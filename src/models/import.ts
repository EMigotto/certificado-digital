/**
 * Certificate import & validation logic.
 * Maps to AC Scenario Sets 3 (manual import) and 4 (batch import).
 */

import type { Certificate } from './certificate.js';

/* ------------------------------------------------------------------ */
/* PEM/PKCS#12 validation — AC 3.1, 3.2, 3.3                          */
/* ------------------------------------------------------------------ */

const PEM_HEADER = '-----BEGIN CERTIFICATE-----';
const PEM_FOOTER = '-----END CERTIFICATE-----';

/**
 * Validate that a string looks like a PEM certificate (AC 3.1, 3.3).
 * Returns true if basic PEM structure is present.
 */
export function isValidPEM(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.startsWith(PEM_HEADER) && trimmed.includes(PEM_FOOTER);
}

/**
 * Validate that binary data looks like a PKCS#12 container (AC 3.2).
 * PKCS#12 files start with ASN.1 SEQUENCE tag 0x30 and typically
 * byte 2 is 0x82 for DER length encoding.
 */
export function isValidPKCS12(data: Uint8Array): boolean {
  if (data.length < 4) return false;
  // ASN.1 SEQUENCE tag
  return data[0] === 0x30;
}

/* ------------------------------------------------------------------ */
/* Required fields validation — AC 3.4                                 */
/* ------------------------------------------------------------------ */

export interface ImportFormData {
  owner?: string;
  application?: string;
  environment?: 'dev' | 'hml' | 'prd' | string;
}

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate that required fields are set before import (AC 3.4).
 */
export function validateImportForm(data: ImportFormData): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!data.owner?.trim()) {
    errors.push({ field: 'owner', message: 'Owner is required' });
  }
  if (!data.application?.trim()) {
    errors.push({ field: 'application', message: 'Application is required' });
  }
  if (!data.environment?.trim()) {
    errors.push({ field: 'environment', message: 'Environment is required' });
  } else if (!['dev', 'hml', 'prd'].includes(data.environment)) {
    errors.push({ field: 'environment', message: 'Environment must be dev, hml, or prd' });
  }

  return errors;
}

/* ------------------------------------------------------------------ */
/* CSV batch import — AC 4.1, 4.2                                      */
/* ------------------------------------------------------------------ */

export interface CsvRow {
  cn?: string;
  san?: string;
  owner?: string;
  application?: string;
  environment?: string;
  ca?: string;
  zone?: string;
  tag_criticality?: string;
  tag_team?: string;
}

export interface CsvValidationResult {
  valid: boolean;
  errors: { row: number; field: string; message: string }[];
}

const CSV_REQUIRED_FIELDS: (keyof CsvRow)[] = ['cn', 'owner', 'application', 'environment'];

/**
 * Validate all rows of a CSV import (AC 4.2 — validate before commit).
 */
export function validateCsvRows(rows: CsvRow[]): CsvValidationResult {
  const errors: { row: number; field: string; message: string }[] = [];

  rows.forEach((row, index) => {
    const rowNum = index + 1;
    for (const field of CSV_REQUIRED_FIELDS) {
      if (!row[field]?.trim()) {
        errors.push({
          row: rowNum,
          field,
          message: `${field} is required`,
        });
      }
    }
    if (row.environment && !['dev', 'hml', 'prd'].includes(row.environment.trim())) {
      errors.push({
        row: rowNum,
        field: 'environment',
        message: 'Environment must be dev, hml, or prd',
      });
    }
  });

  return { valid: errors.length === 0, errors };
}

/* ------------------------------------------------------------------ */
/* API import response — AC 4.3                                        */
/* ------------------------------------------------------------------ */

export interface ImportResult {
  imported: number;
  failed: number;
  errors: { index: number; message: string }[];
}

/**
 * Build an import summary from results (AC 4.1, 4.3).
 */
export function buildImportSummary(
  total: number,
  errorIndices: { index: number; message: string }[],
): ImportResult {
  return {
    imported: total - errorIndices.length,
    failed: errorIndices.length,
    errors: errorIndices,
  };
}
