/**
 * Unit tests for CSV bulk import with row-level validation.
 *
 * Covers:
 *  - AC 3:  CSV with 100 certs → validated, imported, invalid rows reported
 *  - AC 4:  50 rows / 5 invalid → 45 imported, 5 rejected with specific errors
 *  - AC 42: 200 rows, row 150 invalid → rows 1-149 committed, 150+ skipped
 *  - AC 46: Non-CSV file → error "Only CSV files are supported"
 *  - AC 47: Empty CSV → error "No valid rows found in file"
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  importCsv,
  importCsvContent,
  validateCsvFilename,
  validateCsvRow,
  validateCsvImportRow,
  parseCsvRecord,
  parseCsvContent,
  parseCsvContentSync,
  persistCsvRow,
  type CsvCommitRowFn,
  type ParsedCsvCertificate,
} from '../../src/server/services/import-service.js';
import { initDatabase, closeDatabase } from '../../src/server/db.js';
import type Database from 'better-sqlite3';

/* ================================================================ */
/* Helpers                                                           */
/* ================================================================ */

/** CSV header row matching expected column names. */
const CSV_HEADER = 'cn,san,owner,application,environment,ca,zone,tag_criticality,tag_team';

/**
 * Generate a valid CSV row string for a given index.
 */
function makeValidRow(i: number): string {
  const envs = ['dev', 'hml', 'prd'];
  return [
    `svc-${i}.bank.internal`,             // cn
    `svc-${i}-alt.bank.internal`,          // san
    `team-${(i % 5) + 1}`,                // owner
    `App ${i}`,                            // application
    envs[i % 3],                           // environment
    i % 2 === 0 ? 'Vault PKI' : 'ACM PCA', // ca
    `zone-${i % 3}`,                       // zone
    i % 2 === 0 ? 'high' : 'low',         // tag_criticality
    `team-${(i % 5) + 1}`,                // tag_team
  ].join(',');
}

/**
 * Generate an invalid CSV row with a specific missing field.
 */
function makeInvalidRow(i: number, missingField: 'cn' | 'owner' | 'application' | 'environment'): string {
  const parts = {
    cn: `svc-${i}.bank.internal`,
    san: '',
    owner: `team-${i}`,
    application: `App ${i}`,
    environment: 'prd',
    ca: 'Vault PKI',
    zone: '',
    tag_criticality: '',
    tag_team: '',
  };
  // Clear the missing field
  parts[missingField] = '';
  return Object.values(parts).join(',');
}

/**
 * Build a full CSV string from header + data rows.
 */
function buildCsv(rows: string[]): string {
  return [CSV_HEADER, ...rows].join('\n');
}

/* ================================================================ */
/* AC 46 — File type validation                                      */
/* ================================================================ */

describe('CSV file type validation (AC 46)', () => {
  it('accepts .csv files', () => {
    expect(validateCsvFilename('certificates.csv')).toBeNull();
  });

  it('accepts .CSV files (case-insensitive)', () => {
    expect(validateCsvFilename('data.CSV')).toBeNull();
  });

  it('rejects .txt files', () => {
    expect(validateCsvFilename('data.txt')).toBe('Only CSV files are supported');
  });

  it('rejects .xlsx files', () => {
    expect(validateCsvFilename('data.xlsx')).toBe('Only CSV files are supported');
  });

  it('rejects .json files', () => {
    expect(validateCsvFilename('data.json')).toBe('Only CSV files are supported');
  });

  it('rejects .pem files', () => {
    expect(validateCsvFilename('cert.pem')).toBe('Only CSV files are supported');
  });

  it('rejects files with no extension', () => {
    expect(validateCsvFilename('noextension')).toBe('Only CSV files are supported');
  });
});

/* ================================================================ */
/* CSV row validation                                                */
/* ================================================================ */

describe('validateCsvRow', () => {
  it('passes with all required fields present', () => {
    const record = { cn: 'test.com', owner: 'team-1', application: 'App', environment: 'prd' };
    expect(validateCsvRow(record, 1)).toHaveLength(0);
  });

  it('fails when cn is missing', () => {
    const record = { cn: '', owner: 'team-1', application: 'App', environment: 'prd' };
    const errors = validateCsvRow(record, 1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({ row: 1, field: 'cn', message: 'cn is required' });
  });

  it('fails when owner is missing', () => {
    const record = { cn: 'test.com', owner: '', application: 'App', environment: 'prd' };
    const errors = validateCsvRow(record, 3);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({ row: 3, field: 'owner', message: 'owner is required' });
  });

  it('fails when application is missing', () => {
    const record = { cn: 'test.com', owner: 'team-1', application: '', environment: 'prd' };
    const errors = validateCsvRow(record, 1);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('application');
  });

  it('fails when environment is missing', () => {
    const record = { cn: 'test.com', owner: 'team-1', application: 'App', environment: '' };
    const errors = validateCsvRow(record, 1);
    expect(errors.some((e) => e.field === 'environment')).toBe(true);
  });

  it('fails when environment is invalid value', () => {
    const record = { cn: 'test.com', owner: 'team-1', application: 'App', environment: 'staging' };
    const errors = validateCsvRow(record, 1);
    expect(errors.some((e) => e.field === 'environment' && e.message.includes('dev, hml, or prd'))).toBe(true);
  });

  it('reports multiple missing fields in same row', () => {
    const record = { cn: '', owner: '', application: '', environment: '' };
    const errors = validateCsvRow(record, 5);
    expect(errors.length).toBeGreaterThanOrEqual(4);
    expect(errors.every((e) => e.row === 5)).toBe(true);
  });

  it('reports correct row number', () => {
    const record = { cn: '', owner: 'team', application: 'app', environment: 'prd' };
    const errors = validateCsvRow(record, 42);
    expect(errors[0].row).toBe(42);
  });
});

/* ================================================================ */
/* parseCsvRecord                                                    */
/* ================================================================ */

describe('parseCsvRecord', () => {
  it('parses all standard fields', () => {
    const record = {
      cn: 'api.bank.internal',
      san: 'api-v2.bank.internal,api-canary.bank.internal',
      owner: 'team-payments',
      application: 'API Payments',
      environment: 'prd',
      ca: 'Vault PKI',
      zone: 'bank-prd',
    };
    const parsed = parseCsvRecord(record);
    expect(parsed.commonName).toBe('api.bank.internal');
    expect(parsed.sans).toEqual(['api-v2.bank.internal', 'api-canary.bank.internal']);
    expect(parsed.owner).toBe('team-payments');
    expect(parsed.application).toBe('API Payments');
    expect(parsed.environment).toBe('prd');
    expect(parsed.ca).toBe('Vault PKI');
    expect(parsed.zone).toBe('bank-prd');
  });

  it('parses tags from tag_* columns', () => {
    const record = {
      cn: 'test.com',
      san: '',
      owner: 'team',
      application: 'app',
      environment: 'dev',
      ca: '',
      zone: '',
      tag_criticality: 'high',
      tag_team: 'payments',
      tag_region: 'us-east',
    };
    const parsed = parseCsvRecord(record);
    expect(parsed.tags).toEqual({
      criticality: 'high',
      team: 'payments',
      region: 'us-east',
    });
  });

  it('handles empty SAN field', () => {
    const record = { cn: 'test.com', san: '', owner: 'team', application: 'app', environment: 'dev', ca: '', zone: '' };
    const parsed = parseCsvRecord(record);
    expect(parsed.sans).toEqual([]);
  });

  it('handles missing optional fields gracefully', () => {
    const record = { cn: 'test.com', owner: 'team', application: 'app', environment: 'prd' };
    const parsed = parseCsvRecord(record);
    expect(parsed.ca).toBe('');
    expect(parsed.zone).toBe('');
    expect(parsed.sans).toEqual([]);
    expect(parsed.tags).toEqual({});
  });

  it('trims whitespace from all fields', () => {
    const record = {
      cn: '  test.com  ',
      san: ' a.com , b.com ',
      owner: ' team ',
      application: ' app ',
      environment: ' prd ',
      ca: ' Vault ',
      zone: ' zone-1 ',
    };
    const parsed = parseCsvRecord(record);
    expect(parsed.commonName).toBe('test.com');
    expect(parsed.sans).toEqual(['a.com', 'b.com']);
    expect(parsed.owner).toBe('team');
    expect(parsed.application).toBe('app');
    expect(parsed.environment).toBe('prd');
    expect(parsed.ca).toBe('Vault');
    expect(parsed.zone).toBe('zone-1');
  });
});

/* ================================================================ */
/* parseCsvContent (csv-parse integration)                           */
/* ================================================================ */

describe('parseCsvContent', () => {
  it('parses a simple CSV with header row', async () => {
    const csv = 'cn,owner,application,environment\ntest.com,team-1,App,prd\n';
    const records = await parseCsvContent(csv);
    expect(records).toHaveLength(1);
    expect(records[0].cn).toBe('test.com');
    expect(records[0].owner).toBe('team-1');
  });

  it('parses multiple rows', async () => {
    const csv = buildCsv([makeValidRow(1), makeValidRow(2), makeValidRow(3)]);
    const records = await parseCsvContent(csv);
    expect(records).toHaveLength(3);
  });

  it('returns empty array for header-only CSV', async () => {
    const csv = CSV_HEADER + '\n';
    const records = await parseCsvContent(csv);
    expect(records).toHaveLength(0);
  });

  it('skips empty lines', async () => {
    const csv = CSV_HEADER + '\n\n' + makeValidRow(1) + '\n\n' + makeValidRow(2) + '\n';
    const records = await parseCsvContent(csv);
    expect(records).toHaveLength(2);
  });

  it('trims field values', async () => {
    const csv = 'cn,owner,application,environment\n  test.com  ,  team-1  ,  App  ,  prd  \n';
    const records = await parseCsvContent(csv);
    expect(records[0].cn).toBe('test.com');
    expect(records[0].owner).toBe('team-1');
  });
});

/* ================================================================ */
/* AC 3 — 100 valid rows → all imported                              */
/* ================================================================ */

describe('importCsv — 100 valid rows (AC 3)', () => {
  it('imports all 100 rows successfully', async () => {
    const rows = Array.from({ length: 100 }, (_, i) => makeValidRow(i + 1));
    const csv = buildCsv(rows);

    const committed: ParsedCsvCertificate[] = [];
    const commitFn: CsvCommitRowFn = (row) => committed.push(row);

    const result = await importCsv(csv, commitFn);

    expect(result.imported).toBe(100);
    expect(result.failed).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(committed).toHaveLength(100);
  });

  it('commit callback receives correctly parsed certificate data', async () => {
    const csv = buildCsv([
      'api.bank.internal,api-v2.bank.internal,team-payments,API Payments,prd,Vault PKI,bank-prd,high,payments',
    ]);

    const committed: ParsedCsvCertificate[] = [];
    const commitFn: CsvCommitRowFn = (row) => committed.push(row);

    await importCsv(csv, commitFn);

    expect(committed[0].commonName).toBe('api.bank.internal');
    expect(committed[0].sans).toEqual(['api-v2.bank.internal']);
    expect(committed[0].owner).toBe('team-payments');
    expect(committed[0].application).toBe('API Payments');
    expect(committed[0].environment).toBe('prd');
    expect(committed[0].ca).toBe('Vault PKI');
    expect(committed[0].zone).toBe('bank-prd');
    expect(committed[0].tags).toEqual({ criticality: 'high', team: 'payments' });
  });
});

/* ================================================================ */
/* AC 4 — 50 rows, 5 invalid → 45 imported, 5 reported              */
/* ================================================================ */

describe('importCsv — 50 rows with 5 missing owner (AC 4)', () => {
  it('imports 45 valid rows and reports 5 errors', async () => {
    // 45 valid rows, then 5 rows with missing owner at the end
    const validRows = Array.from({ length: 45 }, (_, i) => makeValidRow(i + 1));
    const invalidRows = Array.from({ length: 5 }, (_, i) =>
      makeInvalidRow(46 + i, 'owner'),
    );
    const csv = buildCsv([...validRows, ...invalidRows]);

    const committed: ParsedCsvCertificate[] = [];
    const commitFn: CsvCommitRowFn = (row) => committed.push(row);

    const result = await importCsv(csv, commitFn);

    expect(result.imported).toBe(45);
    expect(result.failed).toBe(5);
    expect(committed).toHaveLength(45);
  });

  it('reports specific error for each invalid row with field and message', async () => {
    const validRows = Array.from({ length: 45 }, (_, i) => makeValidRow(i + 1));
    const invalidRows = Array.from({ length: 5 }, (_, i) =>
      makeInvalidRow(46 + i, 'owner'),
    );
    const csv = buildCsv([...validRows, ...invalidRows]);

    const result = await importCsv(csv);

    // All 5 invalid rows should have error entries
    expect(result.errors.length).toBeGreaterThanOrEqual(5);
    // First error should be for row 46
    expect(result.errors[0].row).toBe(46);
    expect(result.errors[0].field).toBe('owner');
    expect(result.errors[0].message).toBe('owner is required');
  });

  it('stops committing after first invalid row even if later rows are valid', async () => {
    // 10 valid, 1 invalid, 10 valid — should only commit 10
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => makeValidRow(i + 1)),
      makeInvalidRow(11, 'owner'),
      ...Array.from({ length: 10 }, (_, i) => makeValidRow(12 + i)),
    ];
    const csv = buildCsv(rows);

    const committed: ParsedCsvCertificate[] = [];
    const commitFn: CsvCommitRowFn = (row) => committed.push(row);

    const result = await importCsv(csv, commitFn);

    expect(committed).toHaveLength(10);
    expect(result.imported).toBe(10);
    expect(result.failed).toBe(11); // 1 invalid + 10 skipped
  });
});

/* ================================================================ */
/* AC 47 — Empty CSV → error                                         */
/* ================================================================ */

describe('importCsv — empty CSV (AC 47)', () => {
  it('returns error for CSV with only header row', async () => {
    const csv = CSV_HEADER + '\n';
    const result = await importCsv(csv);

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toBe('No valid rows found in file');
  });

  it('returns error for completely empty string', async () => {
    const result = await importCsv('');

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toBe('No valid rows found in file');
  });

  it('returns error for whitespace-only content', async () => {
    const result = await importCsv('   \n  \n  ');

    expect(result.imported).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

/* ================================================================ */
/* AC 42 — 200 rows, row 150 invalid → 149 committed, 150+ skipped  */
/* ================================================================ */

describe('importCsv — large import with mid-file error (AC 42)', () => {
  it('commits rows 1-149 and skips row 150+ when row 150 is invalid', async () => {
    const rows: string[] = [];
    for (let i = 1; i <= 200; i++) {
      if (i === 150) {
        // Row 150: invalid (missing owner)
        rows.push(makeInvalidRow(i, 'owner'));
      } else {
        rows.push(makeValidRow(i));
      }
    }
    const csv = buildCsv(rows);

    const committed: ParsedCsvCertificate[] = [];
    const commitFn: CsvCommitRowFn = (row) => committed.push(row);

    const result = await importCsv(csv, commitFn);

    // First 149 rows committed
    expect(result.imported).toBe(149);
    expect(committed).toHaveLength(149);

    // Row 150 + remaining 50 = 51 failed
    expect(result.failed).toBe(51);

    // Error reported for row 150
    expect(result.errors.some((e) => e.row === 150)).toBe(true);
    expect(result.errors.some((e) => e.row === 150 && e.field === 'owner')).toBe(true);
  });

  it('does not commit any row after the first invalid row', async () => {
    const rows: string[] = [];
    for (let i = 1; i <= 200; i++) {
      if (i === 150) {
        rows.push(makeInvalidRow(i, 'owner'));
      } else {
        rows.push(makeValidRow(i));
      }
    }
    const csv = buildCsv(rows);

    const committedRows: number[] = [];
    const commitFn: CsvCommitRowFn = (_row, rowNum) => committedRows.push(rowNum);

    await importCsv(csv, commitFn);

    // Only rows 1-149 should be committed
    expect(committedRows).toHaveLength(149);
    expect(Math.max(...committedRows)).toBe(149);
    // Row 150 and beyond should NOT appear
    expect(committedRows).not.toContain(150);
    expect(committedRows).not.toContain(200);
  });
});

/* ================================================================ */
/* Additional edge cases                                             */
/* ================================================================ */

describe('importCsv — edge cases', () => {
  it('handles first row being invalid (0 imported)', async () => {
    const csv = buildCsv([makeInvalidRow(1, 'cn')]);

    const result = await importCsv(csv);

    expect(result.imported).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0].row).toBe(1);
    expect(result.errors[0].field).toBe('cn');
  });

  it('handles all rows being invalid', async () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      makeInvalidRow(i + 1, 'owner'),
    );
    const csv = buildCsv(rows);

    const result = await importCsv(csv);

    expect(result.imported).toBe(0);
    expect(result.failed).toBe(5);
    expect(result.errors.length).toBeGreaterThanOrEqual(5);
  });

  it('handles single valid row', async () => {
    const csv = buildCsv([makeValidRow(1)]);

    const committed: ParsedCsvCertificate[] = [];
    const commitFn: CsvCommitRowFn = (row) => committed.push(row);

    const result = await importCsv(csv, commitFn);

    expect(result.imported).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(committed).toHaveLength(1);
  });

  it('works without a commit callback (validation-only mode)', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => makeValidRow(i + 1));
    const csv = buildCsv(rows);

    // No commit callback — just validate
    const result = await importCsv(csv);

    expect(result.imported).toBe(10);
    expect(result.failed).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects rows with invalid environment enum', async () => {
    const csv = 'cn,owner,application,environment\ntest.com,team,app,staging\n';

    const result = await importCsv(csv);

    expect(result.imported).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors.some((e) => e.field === 'environment')).toBe(true);
  });

  it('handles CSV with extra columns gracefully', async () => {
    const csv = 'cn,owner,application,environment,extra_col\ntest.com,team,app,prd,ignored\n';

    const committed: ParsedCsvCertificate[] = [];
    const result = await importCsv(csv, (row) => committed.push(row));

    expect(result.imported).toBe(1);
    expect(committed[0].commonName).toBe('test.com');
  });

  it('commit callback receives row number', async () => {
    const csv = buildCsv([makeValidRow(1), makeValidRow(2), makeValidRow(3)]);

    const rowNumbers: number[] = [];
    const commitFn: CsvCommitRowFn = (_row, rowNum) => rowNumbers.push(rowNum);

    await importCsv(csv, commitFn);

    expect(rowNumbers).toEqual([1, 2, 3]);
  });

  it('handles malformed CSV gracefully', async () => {
    // Completely broken CSV that csv-parse cannot handle
    const result = await importCsv('"unclosed quote\n');

    // Should return an error rather than throwing
    expect(result.imported).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

/* ================================================================== */
/* Database-integrated tests (from Chunk 5/7: Audit Log)               */
/* ================================================================== */

/** Escape a CSV value: quote it if it contains commas, quotes, or newlines. */
function escapeCsvValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Build a CSV string from an array of rows with the given headers. */
function buildCsvDb(headers: string[], rows: string[][]): string {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvValue).join(','));
  }
  return lines.join('\n');
}

/** Generate N valid CSV rows with unique CNs. */
function generateValidRowsDb(count: number): string[][] {
  const rows: string[][] = [];
  for (let i = 1; i <= count; i++) {
    rows.push([
      `cert-${i}.example.com`,
      `alt-${i}.example.com`,
      `team-${(i % 5) + 1}`,
      `app-${(i % 3) + 1}`,
      ['dev', 'hml', 'prd'][i % 3],
      'Vault PKI',
      'zone-a',
    ]);
  }
  return rows;
}

const CSV_HEADERS_DB = ['cn', 'san', 'owner', 'application', 'environment', 'ca', 'zone'];

function countCerts(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM certificates').get() as { cnt: number };
  return row.cnt;
}

function countAuditEntries(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM audit_log').get() as { cnt: number };
  return row.cnt;
}

describe('CSV parsing (parseCsvContentSync)', () => {
  it('parses a simple CSV with headers', () => {
    const csv = 'cn,owner,application,environment\na.com,team,app,prd\n';
    const records = parseCsvContentSync(csv);
    expect(records).toHaveLength(1);
    expect(records[0].cn).toBe('a.com');
    expect(records[0].owner).toBe('team');
    expect(records[0].application).toBe('app');
    expect(records[0].environment).toBe('prd');
  });

  it('skips empty lines', () => {
    const csv = 'cn,owner,application,environment\n\na.com,team,app,prd\n\n';
    const records = parseCsvContentSync(csv);
    expect(records).toHaveLength(1);
  });

  it('trims whitespace from values', () => {
    const csv = 'cn,owner,application,environment\n  a.com  , team , app , prd \n';
    const records = parseCsvContentSync(csv);
    expect(records[0].cn).toBe('a.com');
    expect(records[0].owner).toBe('team');
  });

  it('returns empty array for header-only CSV', () => {
    const csv = 'cn,owner,application,environment\n';
    const records = parseCsvContentSync(csv);
    expect(records).toHaveLength(0);
  });
});

describe('Row-level validation (validateCsvImportRow)', () => {
  it('returns no errors for a valid row', () => {
    const row = { cn: 'a.com', owner: 'team', application: 'app', environment: 'prd' };
    const errors = validateCsvImportRow(row, 1);
    expect(errors).toHaveLength(0);
  });

  it('requires cn field', () => {
    const row = { cn: '', owner: 'team', application: 'app', environment: 'prd' };
    const errors = validateCsvImportRow(row, 1);
    expect(errors.some((e) => e.field === 'cn')).toBe(true);
  });

  it('requires owner field', () => {
    const row = { cn: 'a.com', owner: '', application: 'app', environment: 'prd' };
    const errors = validateCsvImportRow(row, 1);
    expect(errors.some((e) => e.field === 'owner')).toBe(true);
    expect(errors[0].message).toBe('owner is required');
  });

  it('requires application field', () => {
    const row = { cn: 'a.com', owner: 'team', application: '', environment: 'prd' };
    const errors = validateCsvImportRow(row, 1);
    expect(errors.some((e) => e.field === 'application')).toBe(true);
  });

  it('requires environment field', () => {
    const row = { cn: 'a.com', owner: 'team', application: 'app', environment: '' };
    const errors = validateCsvImportRow(row, 1);
    expect(errors.some((e) => e.field === 'environment')).toBe(true);
  });

  it('rejects invalid environment value', () => {
    const row = { cn: 'a.com', owner: 'team', application: 'app', environment: 'staging' };
    const errors = validateCsvImportRow(row, 1);
    expect(errors.some((e) => e.field === 'environment')).toBe(true);
    expect(errors.find((e) => e.field === 'environment')!.message).toBe(
      'Environment must be dev, hml, or prd',
    );
  });

  it('reports the correct row number', () => {
    const row = { cn: '', owner: '', application: '', environment: '' };
    const errors = validateCsvImportRow(row, 42);
    expect(errors.every((e) => e.row === 42)).toBe(true);
  });

  it('reports multiple errors for a single row', () => {
    const row = { cn: '', owner: '', application: 'app', environment: 'prd' };
    const errors = validateCsvImportRow(row, 1);
    expect(errors).toHaveLength(2);
    expect(errors.map((e) => e.field)).toContain('cn');
    expect(errors.map((e) => e.field)).toContain('owner');
  });
});

describe('CSV import with database (importCsvContent)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = initDatabase(':memory:');
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it('imports 100 valid rows successfully (AC 3)', () => {
    const rows = generateValidRowsDb(100);
    const csv = buildCsvDb(CSV_HEADERS_DB, rows);

    const result = importCsvContent(db, csv);

    expect(result.imported).toBe(100);
    expect(result.failed).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(countCerts(db)).toBe(100);
    expect(countAuditEntries(db)).toBe(100);
  });

  it('imports 45 of 50 rows when last 5 have missing owner (AC 4)', () => {
    const validRows = generateValidRowsDb(45);
    const invalidRows: string[][] = [];
    for (let i = 46; i <= 50; i++) {
      invalidRows.push([
        `cert-${i}.example.com`, '', '', `app-${i}`, 'prd', 'Vault PKI', 'zone-a',
      ]);
    }

    const csv = buildCsvDb(CSV_HEADERS_DB, [...validRows, ...invalidRows]);
    const result = importCsvContent(db, csv);

    expect(result.imported).toBe(45);
    expect(result.failed).toBe(5);
    expect(result.errors.length).toBeGreaterThanOrEqual(5);
    expect(result.errors.every((e) => e.field === 'owner')).toBe(true);
    expect(result.errors[0].row).toBe(46);
    expect(countCerts(db)).toBe(45);
  });

  it('commits rows 1-149 and skips 150+ when row 150 is invalid (AC 42)', () => {
    const allRows: string[][] = [];
    for (let i = 1; i <= 200; i++) {
      if (i === 150) {
        allRows.push(['', '', 'team-a', 'app-a', 'prd', 'Vault PKI', 'zone-a']);
      } else {
        allRows.push([
          `cert-${i}.example.com`, `alt-${i}.example.com`,
          `team-${(i % 5) + 1}`, `app-${(i % 3) + 1}`,
          ['dev', 'hml', 'prd'][i % 3], 'Vault PKI', 'zone-a',
        ]);
      }
    }

    const csv = buildCsvDb(CSV_HEADERS_DB, allRows);
    const result = importCsvContent(db, csv);

    expect(result.imported).toBe(149);
    expect(result.failed).toBe(51);
    expect(result.errors.some((e) => e.row === 150)).toBe(true);
    expect(countCerts(db)).toBe(149);
    expect(countAuditEntries(db)).toBe(149);
  });

  it('throws error for empty CSV (AC 47)', () => {
    const csv = 'cn,san,owner,application,environment,ca,zone\n';
    expect(() => importCsvContent(db, csv)).toThrow('No valid rows found in file');
    expect(countCerts(db)).toBe(0);
  });

  it('throws error for completely empty file (AC 47)', () => {
    expect(() => importCsvContent(db, '')).toThrow('No valid rows found in file');
    expect(countCerts(db)).toBe(0);
  });

  it('imports a single valid row', () => {
    const csv = buildCsvDb(CSV_HEADERS_DB, [
      ['api.bank.internal', 'api-v2.bank.internal', 'team-payments', 'API Payments', 'prd', 'Vault PKI', 'bank-prd'],
    ]);

    const result = importCsvContent(db, csv);
    expect(result.imported).toBe(1);
    expect(result.failed).toBe(0);
    expect(countCerts(db)).toBe(1);
  });

  it('stores certificate with correct metadata from CSV row', () => {
    const csv = buildCsvDb(CSV_HEADERS_DB, [
      ['api.bank.internal', 'api-v2.bank.internal,api-v3.bank.internal', 'team-payments', 'API Payments v2', 'prd', 'Vault PKI', 'bank-prd'],
    ]);

    importCsvContent(db, csv);

    const cert = db
      .prepare('SELECT * FROM certificates WHERE common_name = ?')
      .get('api.bank.internal') as Record<string, unknown>;

    expect(cert).toBeDefined();
    expect(cert.common_name).toBe('api.bank.internal');
    expect(JSON.parse(cert.sans as string)).toEqual([
      'api-v2.bank.internal',
      'api-v3.bank.internal',
    ]);
    expect(cert.owner).toBe('team-payments');
    expect(cert.application).toBe('API Payments v2');
    expect(cert.environment).toBe('prd');
    expect(cert.ca_provider).toBe('Vault PKI');
    expect(cert.zone).toBe('bank-prd');
  });

  it('creates audit log entries for each imported row', () => {
    const csv = buildCsvDb(CSV_HEADERS_DB, generateValidRowsDb(5));
    importCsvContent(db, csv);

    const audits = db
      .prepare('SELECT * FROM audit_log ORDER BY timestamp')
      .all() as Array<Record<string, unknown>>;

    expect(audits).toHaveLength(5);
    expect(audits.every((a) => a.action === 'CREATE')).toBe(true);
    expect(audits.every((a) => a.result === 'SUCCESS')).toBe(true);
  });

  it('stops at first invalid row even when subsequent rows are valid', () => {
    const rows: string[][] = [
      ['cert-1.com', '', 'team-a', 'app', 'prd', '', ''],
      ['cert-2.com', '', 'team-a', 'app', 'prd', '', ''],
      ['', '', 'team-a', 'app', 'prd', '', ''],
      ['cert-4.com', '', 'team-a', 'app', 'prd', '', ''],
      ['cert-5.com', '', 'team-a', 'app', 'prd', '', ''],
    ];

    const csv = buildCsvDb(CSV_HEADERS_DB, rows);
    const result = importCsvContent(db, csv);

    expect(result.imported).toBe(2);
    expect(result.failed).toBe(3);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(3);
    expect(countCerts(db)).toBe(2);
  });

  it('handles CSV with tag columns', () => {
    const headers = [...CSV_HEADERS_DB, 'tag_criticality', 'tag_team'];
    const rows: string[][] = [
      ['cert-1.com', '', 'team-a', 'app', 'prd', '', '', 'high', 'payments'],
    ];

    const csv = buildCsvDb(headers, rows);
    importCsvContent(db, csv);

    const cert = db
      .prepare('SELECT tags FROM certificates WHERE common_name = ?')
      .get('cert-1.com') as { tags: string };

    const tags = JSON.parse(cert.tags);
    expect(tags.criticality).toBe('high');
    expect(tags.team).toBe('payments');
  });
});

describe('CSV row persistence (persistCsvRow)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = initDatabase(':memory:');
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it('persists a row and returns the generated ID', () => {
    const row = {
      cn: 'api.example.com',
      san: 'api-v2.example.com',
      owner: 'team-a',
      application: 'my-app',
      environment: 'prd',
      ca: 'Vault PKI',
      zone: 'zone-a',
    };

    const id = persistCsvRow(db, row);
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');

    const cert = db.prepare('SELECT * FROM certificates WHERE id = ?').get(id) as Record<string, unknown>;
    expect(cert).toBeDefined();
    expect(cert.common_name).toBe('api.example.com');
  });

  it('creates an audit log entry for the persisted row', () => {
    const row = {
      cn: 'api.example.com',
      owner: 'team-a',
      application: 'my-app',
      environment: 'prd',
    };

    const id = persistCsvRow(db, row);

    const audit = db
      .prepare('SELECT * FROM audit_log WHERE cert_id = ?')
      .get(id) as Record<string, unknown>;
    expect(audit).toBeDefined();
    expect(audit.action).toBe('CREATE');
    expect(audit.result).toBe('SUCCESS');
    expect(audit.cert_cn).toBe('api.example.com');
  });

  it('parses comma-separated SANs', () => {
    const row = {
      cn: 'api.example.com',
      san: 'a.example.com, b.example.com, c.example.com',
      owner: 'team-a',
      application: 'app',
      environment: 'dev',
    };

    const id = persistCsvRow(db, row);

    const cert = db.prepare('SELECT sans FROM certificates WHERE id = ?').get(id) as { sans: string };
    const sans = JSON.parse(cert.sans);
    expect(sans).toEqual(['a.example.com', 'b.example.com', 'c.example.com']);
  });

  it('handles empty SANs', () => {
    const row = {
      cn: 'api.example.com',
      san: '',
      owner: 'team-a',
      application: 'app',
      environment: 'dev',
    };

    const id = persistCsvRow(db, row);

    const cert = db.prepare('SELECT sans FROM certificates WHERE id = ?').get(id) as { sans: string };
    const sans = JSON.parse(cert.sans);
    expect(sans).toEqual([]);
  });
});
