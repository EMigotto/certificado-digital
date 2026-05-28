/**
 * Import service — orchestrates certificate file parsing, validation,
 * duplicate detection, and database insertion.
 *
 * Supports single file upload (PEM/PKCS#12/DER) and bulk CSV import.
 */

import crypto from 'node:crypto';
import type { PrismaClient, Certificate as PrismaCert } from '@prisma/client';
import { parseCertificateFile } from '../utils/certParser.js';
import { parseCsvContent, type CsvCertificateRow } from '../utils/csvParser.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Metadata fields provided alongside the certificate file */
export interface ImportMetadata {
  owner?: string;
  environment?: string;
  application?: string;
  tags?: Record<string, string>;
}

/** Duplicate info returned on 409 conflict */
export interface DuplicateInfo {
  existingId: string;
  commonName: string;
  issuerDn: string | null;
  fingerprintSha256: string;
  matchType: 'fingerprint' | 'cn_issuer';
}

/** Single import result */
export type SingleImportResult =
  | { status: 'created'; certificate: PrismaCert; auditId: string }
  | { status: 'duplicate'; duplicate: DuplicateInfo }
  | { status: 'invalid'; error: string; code: string }
  | { status: 'unsupported'; error: string };

/** CSV preview row */
export interface CsvPreviewRow {
  row: number;
  data: CsvCertificateRow;
  status: 'valid' | 'error' | 'duplicate';
  errors: string[];
}

/** CSV validation preview */
export interface CsvPreview {
  rows: CsvPreviewRow[];
  validCount: number;
  errorCount: number;
  duplicateCount: number;
  headerErrors: string[];
}

/** CSV import summary */
export interface CsvImportSummary {
  imported: number;
  failed: number;
  batchId: string;
  failedRows: CsvPreviewRow[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Batch insert chunk size for CSV imports */
const BATCH_SIZE = 500;

// ─── Service ────────────────────────────────────────────────────────────────

export class ImportService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Import a single certificate file.
   * Parses the file, checks for duplicates, and inserts into the database.
   */
  async importSingleCertificate(
    fileBuffer: Buffer,
    filename: string,
    password: string | undefined,
    metadata: ImportMetadata,
    actor: string = 'system',
  ): Promise<SingleImportResult> {
    // 1. Parse the certificate
    const parseResult = parseCertificateFile(fileBuffer, filename, password);

    if (!parseResult.ok) {
      // Log failed import attempt
      await this.createAuditEntry({
        certificateId: null,
        certCn: filename,
        action: 'CREATE',
        actor,
        result: 'FAILURE',
        detail: `Import failed: ${parseResult.error}`,
      });

      if (parseResult.code === 'UNSUPPORTED_FORMAT') {
        return { status: 'unsupported', error: parseResult.error };
      }
      return { status: 'invalid', error: parseResult.error, code: parseResult.code };
    }

    const parsed = parseResult.certificate;

    // 2. Check for duplicate by fingerprint
    const dupByFingerprint = await this.prisma.certificate.findFirst({
      where: { fingerprintSha256: parsed.fingerprintSha256 },
    });

    if (dupByFingerprint) {
      return {
        status: 'duplicate',
        duplicate: {
          existingId: dupByFingerprint.id,
          commonName: dupByFingerprint.commonName,
          issuerDn: dupByFingerprint.issuerDn,
          fingerprintSha256: dupByFingerprint.fingerprintSha256,
          matchType: 'fingerprint',
        },
      };
    }

    // 3. Check for duplicate by CN + issuer
    const dupByCnIssuer = await this.prisma.certificate.findFirst({
      where: {
        commonName: parsed.commonName,
        issuerDn: parsed.issuer,
      },
    });

    if (dupByCnIssuer) {
      return {
        status: 'duplicate',
        duplicate: {
          existingId: dupByCnIssuer.id,
          commonName: dupByCnIssuer.commonName,
          issuerDn: dupByCnIssuer.issuerDn,
          fingerprintSha256: dupByCnIssuer.fingerprintSha256,
          matchType: 'cn_issuer',
        },
      };
    }

    // 4. Insert the certificate
    const cert = await this.prisma.certificate.create({
      data: {
        commonName: parsed.commonName,
        sans: parsed.sans,
        serialNumber: parsed.serial,
        issuerDn: parsed.issuer,
        notBefore: parsed.notBefore,
        notAfter: parsed.notAfter,
        signatureAlgorithm: parsed.algorithm,
        fingerprintSha256: parsed.fingerprintSha256,
        pemData: parsed.pemData,
        owner: metadata.owner ?? '',
        environment: validateEnvironment(metadata.environment) ?? 'DEV',
        application: metadata.application ?? '',
        caName: parsed.issuer.split(',')[0]?.replace('CN=', '').trim() || 'Unknown',
        tags: metadata.tags ?? {},
        importSource: 'CERTIFICATE_FILE',
      },
    });

    // 5. Create audit entry
    const auditEntry = await this.createAuditEntry({
      certificateId: cert.id,
      certCn: cert.commonName,
      action: 'CREATE',
      actor,
      result: 'SUCCESS',
      detail: `Certificate imported from file: ${filename}`,
    });

    return { status: 'created', certificate: cert, auditId: auditEntry.id };
  }

  /**
   * Validate and preview CSV import — returns row-level validation
   * without actually inserting anything.
   */
  async previewCsvImport(csvContent: string): Promise<CsvPreview> {
    const parseResult = parseCsvContent(csvContent);

    if (parseResult.headerErrors.length > 0) {
      return {
        rows: [],
        validCount: 0,
        errorCount: 0,
        duplicateCount: 0,
        headerErrors: parseResult.headerErrors,
      };
    }

    // Check duplicates for valid rows
    const previewRows: CsvPreviewRow[] = [];
    let validCount = 0;
    let errorCount = 0;
    let duplicateCount = 0;

    for (const row of parseResult.rows) {
      if (row.status === 'error') {
        previewRows.push(row);
        errorCount++;
        continue;
      }

      // Check duplicate by CN + issuer
      const existing = await this.prisma.certificate.findFirst({
        where: {
          commonName: row.data.cn,
          issuerDn: row.data.issuer,
        },
      });

      if (existing) {
        previewRows.push({
          ...row,
          status: 'duplicate',
          errors: [
            `Duplicate: certificate with CN="${row.data.cn}" and issuer="${row.data.issuer}" already exists (id: ${existing.id})`,
          ],
        });
        duplicateCount++;
      } else {
        previewRows.push(row);
        validCount++;
      }
    }

    return {
      rows: previewRows,
      validCount,
      errorCount,
      duplicateCount,
      headerErrors: [],
    };
  }

  /**
   * Execute CSV import — insert valid rows in batches.
   * Skips rows with errors or duplicates.
   */
  async executeCsvImport(csvContent: string, actor: string = 'system'): Promise<CsvImportSummary> {
    const batchId = crypto.randomUUID();
    const preview = await this.previewCsvImport(csvContent);

    if (preview.headerErrors.length > 0) {
      return {
        imported: 0,
        failed: 0,
        batchId,
        failedRows: [],
      };
    }

    const validRows = preview.rows.filter((r) => r.status === 'valid');
    const failedRows = preview.rows.filter((r) => r.status !== 'valid');

    let imported = 0;

    // Process in batches using createMany for bulk INSERT performance
    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);

      const data = batch.map((row) => {
        const env = validateEnvironment(row.data.environment) ?? 'DEV';
        return {
          commonName: row.data.cn,
          sans: row.data.sans,
          serialNumber: row.data.serial || crypto.randomUUID(),
          issuerDn: row.data.issuer,
          notBefore: row.data.notBefore ? new Date(row.data.notBefore) : new Date(),
          notAfter: row.data.notAfter
            ? new Date(row.data.notAfter)
            : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          signatureAlgorithm: row.data.algorithm || 'unknown',
          fingerprintSha256:
            row.data.fingerprintSha256 || generateMetadataFingerprint(row.data),
          owner: row.data.owner,
          environment: env,
          application: row.data.application,
          zone: row.data.zone,
          caName:
            row.data.caProvider ||
            row.data.issuer.split(',')[0]?.replace('CN=', '').trim() ||
            'Unknown',
          caProvider: row.data.caProvider,
          description: row.data.description,
          tags: row.data.tags,
          importSource: 'CSV_IMPORT' as const,
        };
      });

      try {
        const result = await this.prisma.certificate.createMany({ data });
        imported += result.count;

        // Batch audit entry (one per chunk — avoids N+1 audit writes)
        await this.createAuditEntry({
          certificateId: null,
          certCn: `CSV Import Batch ${batchId}`,
          action: 'IMPORT',
          actor,
          result: 'SUCCESS',
          detail: `CSV bulk import chunk: ${result.count} certificates (batch: ${batchId})`,
        });
      } catch (err) {
        // If a batch fails, mark all rows as failed
        for (const row of batch) {
          failedRows.push({
            ...row,
            status: 'error',
            errors: [
              ...row.errors,
              `Batch insert failed: ${err instanceof Error ? err.message : String(err)}`,
            ],
          });
        }
      }
    }

    // Log batch summary
    await this.createAuditEntry({
      certificateId: null,
      certCn: `CSV Import Batch ${batchId}`,
      action: 'IMPORT',
      actor,
      result: imported > 0 ? 'SUCCESS' : 'FAILURE',
      detail: `CSV bulk import complete. Imported: ${imported}, Failed: ${failedRows.length}, Batch ID: ${batchId}`,
    });

    return {
      imported,
      failed: failedRows.length,
      batchId,
      failedRows,
    };
  }

  /**
   * Create an audit entry. Returns the created entry.
   */
  private async createAuditEntry(entry: {
    certificateId: string | null;
    certCn: string;
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'REVOKE' | 'IMPORT' | 'EXPORT' | 'IMPORT' | 'EXPORT';
    actor: string;
    result: 'SUCCESS' | 'FAILURE';
    detail: string;
  }) {
    return this.prisma.auditEntry.create({ data: entry });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Validate environment string and return the Prisma-compatible enum value.
 */
function validateEnvironment(env?: string): 'DEV' | 'HML' | 'PRD' | null {
  const normalized = env?.trim().toUpperCase();
  if (normalized === 'DEV' || normalized === 'HML' || normalized === 'PRD') {
    return normalized;
  }
  return null;
}

/**
 * Generate a deterministic SHA-256 fingerprint from CSV row metadata.
 * Used when no real DER-based fingerprint is available (CSV imports without cert data).
 * Includes a random component to ensure uniqueness even for rows with identical metadata.
 */
function generateMetadataFingerprint(row: {
  cn: string;
  issuer: string;
  serial: string;
}): string {
  const payload = `${row.cn}|${row.issuer}|${row.serial || crypto.randomUUID()}`;
  const hex = crypto.createHash('sha256').update(payload).digest('hex');
  return hex.match(/.{2}/g)!.join(':').toUpperCase();
}
