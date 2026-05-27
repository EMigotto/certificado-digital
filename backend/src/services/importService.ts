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
  issuer: string;
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
      await this.createAuditLog({
        certId: null,
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
          issuer: dupByFingerprint.issuer,
          fingerprintSha256: dupByFingerprint.fingerprintSha256,
          matchType: 'fingerprint',
        },
      };
    }

    // 3. Check for duplicate by CN + issuer
    const dupByCnIssuer = await this.prisma.certificate.findFirst({
      where: {
        commonName: parsed.commonName,
        issuer: parsed.issuer,
      },
    });

    if (dupByCnIssuer) {
      return {
        status: 'duplicate',
        duplicate: {
          existingId: dupByCnIssuer.id,
          commonName: dupByCnIssuer.commonName,
          issuer: dupByCnIssuer.issuer,
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
        serial: parsed.serial,
        issuer: parsed.issuer,
        notBefore: parsed.notBefore,
        notAfter: parsed.notAfter,
        algorithm: parsed.algorithm,
        fingerprintSha256: parsed.fingerprintSha256,
        pemData: parsed.pemData,
        owner: metadata.owner ?? '',
        environment: validateEnvironment(metadata.environment) ?? 'dev',
        application: metadata.application ?? '',
        tags: metadata.tags ?? {},
      },
    });

    // 5. Create audit entry
    const auditLog = await this.createAuditLog({
      certId: cert.id,
      certCn: cert.commonName,
      action: 'CREATE',
      actor,
      result: 'SUCCESS',
      detail: `Certificate imported from file: ${filename}`,
    });

    return { status: 'created', certificate: cert, auditId: auditLog.id };
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
          issuer: row.data.issuer,
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

    // Process in batches
    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);

      const operations = batch.map((row) => {
        const env = validateEnvironment(row.data.environment) ?? 'dev';
        return this.prisma.certificate.create({
          data: {
            commonName: row.data.cn,
            sans: row.data.sans,
            serial: row.data.serial || crypto.randomUUID(),
            issuer: row.data.issuer,
            notBefore: row.data.notBefore ? new Date(row.data.notBefore) : new Date(),
            notAfter: row.data.notAfter
              ? new Date(row.data.notAfter)
              : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            algorithm: row.data.algorithm || 'unknown',
            fingerprintSha256: row.data.fingerprintSha256 || crypto.randomUUID(),
            owner: row.data.owner,
            environment: env,
            application: row.data.application,
            zone: row.data.zone,
            caProvider: row.data.caProvider,
            description: row.data.description,
            tags: row.data.tags,
          },
        });
      });

      try {
        const results = await this.prisma.$transaction(operations);
        imported += results.length;

        // Create audit entries for each imported cert
        const auditOps = results.map((cert) =>
          this.prisma.auditLog.create({
            data: {
              certId: cert.id,
              certCn: cert.commonName,
              action: 'CREATE',
              actor,
              result: 'SUCCESS',
              detail: `CSV bulk import (batch: ${batchId})`,
            },
          }),
        );
        await this.prisma.$transaction(auditOps);
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
    await this.createAuditLog({
      certId: null,
      certCn: `CSV Import Batch ${batchId}`,
      action: 'CREATE',
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
   * Create an audit log entry. Returns the created entry.
   */
  private async createAuditLog(entry: {
    certId: string | null;
    certCn: string;
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'REVOKE';
    actor: string;
    result: 'SUCCESS' | 'FAILURE';
    detail: string;
  }) {
    return this.prisma.auditLog.create({ data: entry });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Validate environment string and return the Prisma-compatible enum value.
 */
function validateEnvironment(env?: string): 'dev' | 'hml' | 'prd' | null {
  const normalized = env?.trim().toLowerCase();
  if (normalized === 'dev' || normalized === 'hml' || normalized === 'prd') {
    return normalized;
  }
  return null;
}
