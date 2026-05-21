/**
 * Certificate import service — PEM & PKCS#12 parsing, validation, persistence.
 *
 * Covers AC 1 (import single PEM), AC 2 (invalid format error),
 * AC 38 (owner required), AC 39 (valid environment), AC 48 (metadata accuracy).
 *
 * Pipeline (ADR §2.5):
 *   upload → parse → validate org-metadata → persist → audit → return JSON
 */

import forge from 'node-forge';
import { v4 as uuidv4 } from 'uuid';
import type Database from 'better-sqlite3';

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

const INSERT_AUDIT_SQL = `
  INSERT INTO audit_log (id, cert_id, cert_cn, action, actor, result, details)
  VALUES (?, ?, ?, 'CREATE', 'system', 'SUCCESS', '{}')
`;

/**
 * Persist a parsed certificate + metadata into the database and create
 * the corresponding audit log entry.
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
  const insertAudit = db.prepare(INSERT_AUDIT_SQL);

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

    insertAudit.run(uuidv4(), id, parsed.commonName);
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
