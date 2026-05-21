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

import { describe, it, expect, vi } from 'vitest';
import {
  importCsv,
  validateCsvFilename,
  validateCsvRow,
  parseCsvRecord,
  parseCsvContent,
  type CsvCommitRowFn,
  type ParsedCsvCertificate,
} from '../../src/server/services/import-service.js';

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
