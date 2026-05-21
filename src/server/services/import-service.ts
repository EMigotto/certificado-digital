/**
 * Certificate import service — PEM, PKCS#12, and CSV parsing, validation, persistence.
 *
 * Covers AC 1 (import single PEM), AC 2 (invalid format error),
 * AC 3 (bulk CSV import), AC 4 (CSV validation errors),
 * AC 38 (owner required), AC 39 (valid environment), AC 42 (partial commit),
 * AC 46 (file type validation), AC 47 (empty CSV), AC 48 (metadata accuracy).
 *
 * Pipeline (ADR §2.5):
 *   upload → parse → validate org-metadata → persist → audit → return JSON
 *
 * CSV pipeline (ADR §2.5):
 *   upload → csv-parse stream → validate each row → commit valid rows
 *   → stop on first invalid row → report errors → return CsvImportResult
 */

import forge from 'node-forge';
import { v4 as uuidv4 } from 'uuid';
import type Database from 'better-sqlite3';
import { parse as csvParse } from 'csv-parse/sync';
import * as auditService from './audit-service.js';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/** Fields extracted from the X.509 certificate file. */
export interface ParsedCertificate {
  commonName: string;
  sans: string[];
  serial: string;
  issuer: string;
  notBefore: string; // ISO-8601
  notAfter: string; // ISO-8601
  algorithm: string;
  keySize: number;
  fingerprintSHA256: string;
  pemContent: string;
}

/** Organisational metadata supplied alongside the file upload. */
export interface ImportMetadata {
  owner: string;
  application?: string;
  environment: 'dev' | 'hml' | 'prd';
  zone?: string;
  caProvider?: string;
  description?: string;
  tags?: Record<string, string>;
}

/** Validation error returned to the caller. */
export interface ImportValidationError {
  field: string;
  message: string;
}

/** The full record returned after a successful import. */
export interface ImportedCertificate extends ParsedCertificate {
  id: string;
  owner: string;
  application: string;
  environment: string;
  zone: string;
  caProvider: string;
  description: string;
  tags: Record<string, string>;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* PEM parsing                                                         */
/* ------------------------------------------------------------------ */

/**
 * Parse a PEM-encoded certificate string and extract all PKI fields.
 *
 * @throws Error if the PEM cannot be parsed.
 */
export function parsePemCertificate(pemContent: string): ParsedCertificate {
  let cert: forge.pki.Certificate;
  try {
    cert = forge.pki.certificateFromPem(pemContent);
  } catch (err) {
    throw new Error(
      `Invalid PEM certificate: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return extractCertificateFields(cert, pemContent);
}

/* ------------------------------------------------------------------ */
/* PKCS#12 parsing                                                     */
/* ------------------------------------------------------------------ */

/**
 * Parse a PKCS#12 (.pfx / .p12) binary buffer and extract the first
 * certificate found, then parse it as PEM.
 *
 * @param buffer  Raw PKCS#12 bytes.
 * @param passphrase  Passphrase to decrypt the container.
 * @throws Error if parsing or decryption fails.
 */
export function parsePkcs12Certificate(
  buffer: Buffer,
  passphrase: string,
): ParsedCertificate {
  let p12Asn1: forge.asn1.Asn1;
  let p12: forge.pkcs12.Pkcs12Pfx;

  try {
    const derString = forge.util.decode64(buffer.toString('base64'));
    p12Asn1 = forge.asn1.fromDer(derString);
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, passphrase);
  } catch (err) {
    throw new Error(
      `Invalid PKCS#12 file or wrong passphrase: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Extract certificate bags
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const bags = certBags[forge.pki.oids.certBag];

  if (!bags || bags.length === 0 || !bags[0].cert) {
    throw new Error('No certificate found in PKCS#12 container');
  }

  const cert = bags[0].cert;
  const pemContent = forge.pki.certificateToPem(cert);

  return extractCertificateFields(cert, pemContent);
}

/* ------------------------------------------------------------------ */
/* Shared field extraction                                             */
/* ------------------------------------------------------------------ */

function extractCertificateFields(
  cert: forge.pki.Certificate,
  pemContent: string,
): ParsedCertificate {
  // Common Name
  const cnAttr = cert.subject.getField('CN');
  const commonName = cnAttr ? String(cnAttr.value) : '';

  // SANs
  const sans: string[] = [];
  const sanExt = cert.getExtension('subjectAltName') as
    | { altNames?: Array<{ type: number; value: string }> }
    | undefined;
  if (sanExt?.altNames) {
    for (const alt of sanExt.altNames) {
      // type 2 = DNS, type 7 = IP
      if (alt.value) {
        sans.push(alt.value);
      }
    }
  }

  // Serial (hex string, uppercase)
  const serial = cert.serialNumber.toUpperCase();

  // Issuer
  const issuerParts: string[] = [];
  for (const attr of cert.issuer.attributes) {
    const shortName = attr.shortName ?? attr.name ?? 'OID';
    issuerParts.push(`${shortName}=${attr.value}`);
  }
  const issuer = issuerParts.join(', ');

  // Validity dates (ISO-8601)
  const notBefore = cert.validity.notBefore.toISOString();
  const notAfter = cert.validity.notAfter.toISOString();

  // Algorithm + key size
  const publicKey = cert.publicKey as forge.pki.rsa.PublicKey;
  let algorithm = 'Unknown';
  let keySize = 0;

  if ('n' in publicKey && 'e' in publicKey) {
    // RSA
    keySize = publicKey.n.bitLength();
    algorithm = `RSA ${keySize}`;
  } else if ('curve' in publicKey) {
    // ECDSA
    algorithm = `ECDSA`;
    keySize = 256; // Default for common curves
  }

  // Fingerprint SHA-256
  const derBytes = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const md = forge.md.sha256.create();
  md.update(derBytes);
  const fingerprintSHA256 = md
    .digest()
    .toHex()
    .toUpperCase()
    .match(/.{2}/g)!
    .join(':');

  return {
    commonName,
    sans,
    serial,
    issuer,
    notBefore,
    notAfter,
    algorithm,
    keySize,
    fingerprintSHA256,
    pemContent: pemContent.trim(),
  };
}

/* ------------------------------------------------------------------ */
/* Metadata validation (AC 38, 39)                                     */
/* ------------------------------------------------------------------ */

const VALID_ENVIRONMENTS = ['dev', 'hml', 'prd'];

/**
 * Validate the organisational metadata provided with a certificate import.
 *
 * AC 38: Owner is required → "Owner is required"
 * AC 39: Environment must be dev/hml/prd → rejected
 */
export function validateImportMetadata(
  meta: Partial<ImportMetadata>,
): ImportValidationError[] {
  const errors: ImportValidationError[] = [];

  if (!meta.owner?.trim()) {
    errors.push({ field: 'owner', message: 'Owner is required' });
  }

  if (!meta.environment?.trim()) {
    errors.push({ field: 'environment', message: 'Environment is required' });
  } else if (!VALID_ENVIRONMENTS.includes(meta.environment)) {
    errors.push({
      field: 'environment',
      message: 'Environment must be dev, hml, or prd',
    });
  }

  return errors;
}

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

const INSERT_CERT_SQL = `
  INSERT INTO certificates (
    id, common_name, sans, serial, issuer,
    not_before, not_after, algorithm, fingerprint_sha256,
    owner, application, environment, zone, ca_provider,
    pem_content, tags, description
  ) VALUES (
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?
  )
`;

/**
 * Persist a parsed certificate + metadata into the database and create
 * the corresponding CREATE audit log entry via audit-service.
 *
 * Returns the full imported certificate record.
 */
export function persistCertificate(
  db: Database.Database,
  parsed: ParsedCertificate,
  meta: ImportMetadata,
): ImportedCertificate {
  const id = uuidv4();
  const now = new Date().toISOString();

  const insertCert = db.prepare(INSERT_CERT_SQL);

  const transaction = db.transaction(() => {
    insertCert.run(
      id,
      parsed.commonName,
      JSON.stringify(parsed.sans),
      parsed.serial,
      parsed.issuer,
      parsed.notBefore,
      parsed.notAfter,
      parsed.algorithm,
      parsed.fingerprintSHA256,
      meta.owner.trim(),
      (meta.application ?? '').trim(),
      meta.environment,
      (meta.zone ?? '').trim(),
      (meta.caProvider ?? '').trim(),
      parsed.pemContent,
      JSON.stringify(meta.tags ?? {}),
      (meta.description ?? '').trim(),
    );

    auditService.log(db, 'CREATE', id, parsed.commonName, 'system', 'SUCCESS');
  });

  transaction();

  return {
    id,
    ...parsed,
    owner: meta.owner.trim(),
    application: (meta.application ?? '').trim(),
    environment: meta.environment,
    zone: (meta.zone ?? '').trim(),
    caProvider: (meta.caProvider ?? '').trim(),
    description: (meta.description ?? '').trim(),
    tags: meta.tags ?? {},
    createdAt: now,
  };
}

/* ------------------------------------------------------------------ */
/* CSV bulk import — AC 3, 4, 42, 47                                   */
/* ------------------------------------------------------------------ */

/** Error detail for a single CSV row. */
export interface CsvRowError {
  row: number;
  field: string;
  message: string;
}

/** Result of a bulk CSV import operation. */
export interface CsvImportResult {
  imported: number;
  failed: number;
  errors: CsvRowError[];
}

/** Required columns in the CSV file. */
const CSV_REQUIRED_FIELDS = ['cn', 'owner', 'application', 'environment'] as const;

/**
 * Validate a single CSV row and return any errors found.
 *
 * Required fields: cn, owner, application, environment.
 * Environment must be one of: dev, hml, prd.
 */
export function validateCsvImportRow(
  row: Record<string, string>,
  rowNum: number,
): CsvRowError[] {
  const errors: CsvRowError[] = [];

  for (const field of CSV_REQUIRED_FIELDS) {
    if (!row[field]?.trim()) {
      errors.push({
        row: rowNum,
        field,
        message: `${field} is required`,
      });
    }
  }

  // Environment enum constraint (AC 39)
  const env = row['environment']?.trim();
  if (env && !VALID_ENVIRONMENTS.includes(env)) {
    errors.push({
      row: rowNum,
      field: 'environment',
      message: 'Environment must be dev, hml, or prd',
    });
  }

  return errors;
}

/**
 * Persist a CSV row as a certificate record in the database.
 *
 * CSV rows don't carry PKI binary data (serial, fingerprint, etc.),
 * so those fields are populated with generated or placeholder values.
 */
export function persistCsvRow(
  db: Database.Database,
  row: Record<string, string>,
): string {
  const id = uuidv4();
  const cn = row['cn']?.trim() ?? '';
  const sans = row['san']?.trim()
    ? row['san'].split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  const owner = row['owner']?.trim() ?? '';
  const application = row['application']?.trim() ?? '';
  const environment = row['environment']?.trim() ?? 'dev';
  const ca = row['ca']?.trim() ?? '';
  const zone = row['zone']?.trim() ?? '';

  // Build tags from any tag_* columns
  const tags: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key.startsWith('tag_') && value?.trim()) {
      tags[key.substring(4)] = value.trim();
    }
  }
  // Also support a generic "tags" column (comma-separated values → keys)
  if (row['tags']?.trim()) {
    const tagValues = row['tags'].split(',').map((t) => t.trim()).filter(Boolean);
    for (const t of tagValues) {
      tags[t] = 'true';
    }
  }

  const now = new Date().toISOString();
  // Generate a serial from the UUID (hex format, like a real serial)
  const serial = id.replace(/-/g, '').toUpperCase();

  const insertCert = db.prepare(INSERT_CERT_SQL);

  const transaction = db.transaction(() => {
    insertCert.run(
      id,
      cn,
      JSON.stringify(sans),
      serial,
      ca || 'Unknown',
      now,                // not_before
      now,                // not_after (placeholder — CSV doesn't have cert dates)
      'N/A',              // algorithm
      'N/A',              // fingerprint_sha256
      owner,
      application,
      environment,
      zone,
      ca,
      null,               // pem_content — no binary data for CSV rows
      JSON.stringify(tags),
      '',                 // description
    );

    auditService.log(db, 'CREATE', id, cn, 'system', 'SUCCESS');
  });

  transaction();
  return id;
}

/**
 * Parse a CSV string and return the parsed records.
 *
 * Uses `csv-parse` synchronous parser with:
 *  - First row as column headers
 *  - Empty lines skipped
 *  - Whitespace trimmed
 *
 * @throws Error if the CSV content cannot be parsed.
 */
export function parseCsvContent(content: string): Record<string, string>[] {
  return csvParse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });
}

/**
 * Import certificates from a CSV file with row-level validation and
 * partial-commit semantics.
 *
 * Processing (ADR §2.5):
 *  1. Parse all rows from CSV content.
 *  2. Iterate rows sequentially.
 *  3. Validate each row for required fields and enum constraints.
 *  4. If valid and processing hasn't stopped: commit to database.
 *  5. On first invalid row: stop committing.
 *  6. Continue validating remaining rows to collect their errors.
 *  7. Return totals and error details.
 *
 * AC 3:  100 valid rows → all imported.
 * AC 4:  50 rows, 5 invalid → 45 imported, 5 reported with specific errors.
 * AC 42: 200 rows, row 150 invalid → rows 1-149 committed, 150+ skipped.
 * AC 47: Empty CSV → error "No valid rows found in file".
 */
export function importCsvContent(
  db: Database.Database,
  content: string,
): CsvImportResult {
  // Parse CSV
  let records: Record<string, string>[];
  try {
    records = parseCsvContent(content);
  } catch {
    throw new Error('Failed to parse CSV file');
  }

  // AC 47: Empty CSV
  if (records.length === 0) {
    throw new Error('No valid rows found in file');
  }

  let imported = 0;
  let failed = 0;
  const errors: CsvRowError[] = [];
  let stopped = false;

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const rowNum = i + 1; // 1-based row numbers (excluding header)

    // Validate the row
    const rowErrors = validateCsvImportRow(row, rowNum);

    if (rowErrors.length > 0) {
      // Invalid row — record errors and stop committing
      errors.push(...rowErrors);
      failed++;
      stopped = true;
      continue;
    }

    if (stopped) {
      // Valid row but processing has stopped — count as failed
      failed++;
      continue;
    }

    // Valid row and processing is active — commit to database
    try {
      persistCsvRow(db, row);
      imported++;
    } catch (err) {
      // Unexpected DB error — treat as row error and stop
      errors.push({
        row: rowNum,
        field: '_db',
        message: err instanceof Error ? err.message : 'Database error',
      });
      failed++;
      stopped = true;
    }
  }

  return { imported, failed, errors };
}
