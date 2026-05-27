/**
 * CSV parsing utilities for bulk certificate import.
 *
 * Uses PapaParse for streaming CSV parsing with row-level validation.
 */

import Papa from 'papaparse';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Required CSV columns for import */
export const REQUIRED_COLUMNS = ['cn', 'issuer', 'owner', 'environment'] as const;

/** All recognized CSV columns */
export const ALL_COLUMNS = [
  'cn',
  'sans',
  'serial',
  'issuer',
  'not_before',
  'not_after',
  'algorithm',
  'fingerprint_sha256',
  'owner',
  'application',
  'environment',
  'zone',
  'ca_provider',
  'description',
  'tags',
] as const;

/** Valid environment values */
const VALID_ENVIRONMENTS = ['dev', 'hml', 'prd'];

/** A single parsed CSV row */
export interface CsvCertificateRow {
  cn: string;
  sans: string[];
  serial: string;
  issuer: string;
  notBefore: string;
  notAfter: string;
  algorithm: string;
  fingerprintSha256: string;
  owner: string;
  application: string;
  environment: string;
  zone: string;
  caProvider: string;
  description: string;
  tags: Record<string, string>;
}

/** Row validation result */
export interface CsvRowResult {
  row: number;
  data: CsvCertificateRow;
  status: 'valid' | 'error' | 'duplicate';
  errors: string[];
}

/** CSV parse result */
export interface CsvParseResult {
  rows: CsvRowResult[];
  validCount: number;
  errorCount: number;
  headerErrors: string[];
}

// ─── Implementation ─────────────────────────────────────────────────────────

/**
 * Validate CSV headers — check that all required columns are present.
 * Returns list of missing column errors.
 */
export function validateHeaders(headers: string[]): string[] {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  const errors: string[] = [];

  for (const col of REQUIRED_COLUMNS) {
    if (!normalized.includes(col)) {
      errors.push(`Missing required column: "${col}"`);
    }
  }

  return errors;
}

/**
 * Parse tags from a string format "key1:value1;key2:value2".
 */
function parseTags(tagsStr: string): Record<string, string> {
  if (!tagsStr || tagsStr.trim() === '') return {};
  const result: Record<string, string> = {};
  const pairs = tagsStr.split(';');
  for (const pair of pairs) {
    const colonIdx = pair.indexOf(':');
    if (colonIdx > 0) {
      const key = pair.slice(0, colonIdx).trim();
      const value = pair.slice(colonIdx + 1).trim();
      if (key) result[key] = value;
    }
  }
  return result;
}

/**
 * Validate a single CSV row and return errors.
 */
function validateRow(row: Record<string, string>, rowNumber: number): CsvRowResult {
  const errors: string[] = [];

  const cn = (row['cn'] ?? '').trim();
  const issuer = (row['issuer'] ?? '').trim();
  const owner = (row['owner'] ?? '').trim();
  const environment = (row['environment'] ?? '').trim().toLowerCase();

  // Required field checks
  if (!cn) errors.push('Field "cn" is required');
  if (!issuer) errors.push('Field "issuer" is required');
  if (!owner) errors.push('Field "owner" is required');
  if (!environment) errors.push('Field "environment" is required');

  // Enum validation
  if (environment && !VALID_ENVIRONMENTS.includes(environment)) {
    errors.push(
      `Invalid environment "${environment}". Must be one of: ${VALID_ENVIRONMENTS.join(', ')}`,
    );
  }

  // Date validation (if provided)
  const notBefore = (row['not_before'] ?? '').trim();
  const notAfter = (row['not_after'] ?? '').trim();

  if (notBefore && isNaN(new Date(notBefore).getTime())) {
    errors.push(`Invalid date format for "not_before": "${notBefore}"`);
  }
  if (notAfter && isNaN(new Date(notAfter).getTime())) {
    errors.push(`Invalid date format for "not_after": "${notAfter}"`);
  }

  // Parse SANs (comma-separated within the field)
  const sansStr = (row['sans'] ?? '').trim();
  const sans = sansStr
    ? sansStr
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const data: CsvCertificateRow = {
    cn,
    sans,
    serial: (row['serial'] ?? '').trim(),
    issuer,
    notBefore,
    notAfter,
    algorithm: (row['algorithm'] ?? '').trim(),
    fingerprintSha256: (row['fingerprint_sha256'] ?? '').trim(),
    owner,
    application: (row['application'] ?? '').trim(),
    environment,
    zone: (row['zone'] ?? '').trim(),
    caProvider: (row['ca_provider'] ?? '').trim(),
    description: (row['description'] ?? '').trim(),
    tags: parseTags((row['tags'] ?? '').trim()),
  };

  return {
    row: rowNumber,
    data,
    status: errors.length > 0 ? 'error' : 'valid',
    errors,
  };
}

/**
 * Parse a CSV string and validate all rows.
 * Returns structured result with per-row validation.
 */
export function parseCsvContent(csvContent: string): CsvParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim().toLowerCase(),
  });

  // Validate headers
  const headers = parsed.meta.fields ?? [];
  const headerErrors = validateHeaders(headers);

  if (headerErrors.length > 0) {
    return {
      rows: [],
      validCount: 0,
      errorCount: 0,
      headerErrors,
    };
  }

  // Validate each row
  const rows: CsvRowResult[] = [];
  let validCount = 0;
  let errorCount = 0;

  for (let i = 0; i < parsed.data.length; i++) {
    const rowResult = validateRow(parsed.data[i], i + 1);
    rows.push(rowResult);
    if (rowResult.status === 'valid') {
      validCount++;
    } else {
      errorCount++;
    }
  }

  return {
    rows,
    validCount,
    errorCount,
    headerErrors: [],
  };
}

/**
 * Generate a CSV template string with headers and example rows.
 */
export function generateCsvTemplate(): string {
  const headers = ALL_COLUMNS.join(',');
  const example1 = [
    'api.example.com',
    'api.example.com;www.example.com',
    'AA:BB:CC:DD:EE:FF',
    'CN=DigiCert Global Root G2',
    '2024-01-01T00:00:00Z',
    '2025-01-01T00:00:00Z',
    'RSA-2048',
    'AB:CD:EF:12:34:56',
    'team-platform',
    'api-gateway',
    'prd',
    'us-east-1',
    'DigiCert',
    'Production API certificate',
    'team:platform;env:production',
  ].join(',');
  const example2 = [
    'internal.corp.local',
    'internal.corp.local',
    'FF:EE:DD:CC:BB:AA',
    'CN=Internal CA',
    '2024-06-01T00:00:00Z',
    '2025-06-01T00:00:00Z',
    'RSA-4096',
    '12:34:56:78:90:AB',
    'team-infra',
    'internal-api',
    'dev',
    'eu-west-1',
    'Internal CA',
    'Development internal certificate',
    'team:infra;env:development',
  ].join(',');

  return `${headers}\n${example1}\n${example2}\n`;
}
