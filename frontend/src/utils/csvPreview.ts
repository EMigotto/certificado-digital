/**
 * Client-side CSV preview parser.
 *
 * Uses PapaParse to parse CSV files in the browser and validate rows
 * before sending to the server.
 */

import Papa from 'papaparse';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Required CSV columns */
export const REQUIRED_COLUMNS = ['cn', 'issuer', 'owner', 'environment'] as const;

/** All recognized columns */
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

/** Valid environments */
const VALID_ENVIRONMENTS = ['dev', 'hml', 'prd'];

/** A single parsed CSV row */
export interface CsvRow {
  cn: string;
  issuer: string;
  owner: string;
  environment: string;
  sans: string;
  serial: string;
  notBefore: string;
  notAfter: string;
  algorithm: string;
  application: string;
  zone: string;
  caProvider: string;
  description: string;
}

/** Row validation result */
export interface CsvRowResult {
  row: number;
  data: CsvRow;
  status: 'valid' | 'error';
  errors: string[];
}

/** Client-side CSV parse result */
export interface CsvPreviewResult {
  rows: CsvRowResult[];
  totalRows: number;
  validCount: number;
  errorCount: number;
  headerErrors: string[];
  headers: string[];
}

// ─── Max preview rows ───────────────────────────────────────────────────────

const MAX_PREVIEW_ROWS = 100;

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Parse a CSV file content string and return client-side validation preview.
 * Limited to the first 100 rows for performance.
 */
export function parseCsvPreview(csvContent: string): CsvPreviewResult {
  const clean = csvContent.replace(/^\uFEFF/, '');

  const parsed = Papa.parse<Record<string, string>>(clean, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim().toLowerCase(),
    preview: MAX_PREVIEW_ROWS,
  });

  const headers = parsed.meta.fields ?? [];
  const headerErrors = validateHeaders(headers);

  if (headerErrors.length > 0) {
    return {
      rows: [],
      totalRows: 0,
      validCount: 0,
      errorCount: 0,
      headerErrors,
      headers,
    };
  }

  const rows: CsvRowResult[] = [];
  let validCount = 0;
  let errorCount = 0;

  for (let i = 0; i < parsed.data.length; i++) {
    const result = validateRow(parsed.data[i], i + 1);
    rows.push(result);
    if (result.status === 'valid') {
      validCount++;
    } else {
      errorCount++;
    }
  }

  const totalEstimate = countTotalRows(clean);

  return {
    rows,
    totalRows: totalEstimate,
    validCount,
    errorCount,
    headerErrors: [],
    headers,
  };
}

/**
 * Read a File object as text content.
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Erro ao ler arquivo CSV'));
    reader.readAsText(file, 'utf-8');
  });
}

/**
 * Generate CSV content from failed rows for download.
 */
export function generateFailedRowsCsv(
  rows: Array<{ row: number; data: Record<string, unknown>; errors: string[] }>,
): string {
  if (rows.length === 0) return '';

  const headers = ['row', ...ALL_COLUMNS, 'errors'];
  const lines = rows.map((r) => {
    const d = r.data;
    const values = [
      String(r.row),
      String(d.cn ?? ''),
      String(d.sans ?? ''),
      String(d.serial ?? ''),
      String(d.issuer ?? ''),
      String(d.notBefore ?? ''),
      String(d.notAfter ?? ''),
      String(d.algorithm ?? ''),
      String(d.fingerprintSha256 ?? ''),
      String(d.owner ?? ''),
      String(d.application ?? ''),
      String(d.environment ?? ''),
      String(d.zone ?? ''),
      String(d.caProvider ?? ''),
      String(d.description ?? ''),
      String(d.tags ? JSON.stringify(d.tags) : ''),
      `"${r.errors.join('; ')}"`,
    ];
    return values.join(',');
  });

  return [headers.join(','), ...lines].join('\n');
}

// ─── Validation helpers ─────────────────────────────────────────────────────

function validateHeaders(headers: string[]): string[] {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  const errors: string[] = [];

  for (const col of REQUIRED_COLUMNS) {
    if (!normalized.includes(col)) {
      errors.push(`Coluna obrigatória ausente: "${col}"`);
    }
  }

  return errors;
}

function validateRow(row: Record<string, string>, rowNumber: number): CsvRowResult {
  const errors: string[] = [];

  const cn = (row['cn'] ?? '').trim();
  const issuer = (row['issuer'] ?? '').trim();
  const owner = (row['owner'] ?? '').trim();
  const environment = (row['environment'] ?? '').trim().toLowerCase();

  if (!cn) errors.push('Campo "cn" é obrigatório');
  if (!issuer) errors.push('Campo "issuer" é obrigatório');
  if (!owner) errors.push('Campo "owner" é obrigatório');
  if (!environment) errors.push('Campo "environment" é obrigatório');

  if (environment && !VALID_ENVIRONMENTS.includes(environment)) {
    errors.push(
      `Ambiente inválido "${environment}". Valores aceitos: ${VALID_ENVIRONMENTS.join(', ')}`,
    );
  }

  const notBefore = (row['not_before'] ?? '').trim();
  const notAfter = (row['not_after'] ?? '').trim();

  if (notBefore && isNaN(new Date(notBefore).getTime())) {
    errors.push(`Data inválida em "not_before": "${notBefore}"`);
  }
  if (notAfter && isNaN(new Date(notAfter).getTime())) {
    errors.push(`Data inválida em "not_after": "${notAfter}"`);
  }

  const data: CsvRow = {
    cn,
    issuer,
    owner,
    environment,
    sans: (row['sans'] ?? '').trim(),
    serial: (row['serial'] ?? '').trim(),
    notBefore,
    notAfter,
    algorithm: (row['algorithm'] ?? '').trim(),
    application: (row['application'] ?? '').trim(),
    zone: (row['zone'] ?? '').trim(),
    caProvider: (row['ca_provider'] ?? '').trim(),
    description: (row['description'] ?? '').trim(),
  };

  return {
    row: rowNumber,
    data,
    status: errors.length > 0 ? 'error' : 'valid',
    errors,
  };
}

function countTotalRows(csv: string): number {
  const lines = csv.split('\n').filter((l) => l.trim().length > 0);
  return Math.max(0, lines.length - 1);
}
