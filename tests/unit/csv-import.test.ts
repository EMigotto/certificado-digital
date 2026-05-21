/**
 * Tests for CSV bulk import with row-level validation.
 *
 * Covers AC 3 (bulk CSV import), AC 4 (validation errors),
 * AC 42 (partial commit on error), AC 46 (file type validation),
 * AC 47 (empty CSV).
 *
 * Issue #14 — C3 Chunk 3/7: Bulk CSV Import with Row-Level Validation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  importCsvContent,
  parseCsvContent,
  validateCsvImportRow,
  persistCsvRow,
  type CsvImportResult,
} from '../../src/server/services/import-service.js';
import { initDatabase, closeDatabase } from '../../src/server/db.js';
import type Database from 'better-sqlite3';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Escape a CSV value: quote it if it contains commas, quotes, or newlines. */
function escapeCsvValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Build a CSV string from an array of rows (first row = headers). */
function buildCsv(headers: string[], rows: string[][]): string {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvValue).join(','));
  }
  return lines.join('\n');
}

/** Generate N valid CSV rows with unique CNs. */
function generateValidRows(count: number): string[][] {
  const rows: string[][] = [];
  for (let i = 1; i <= count; i++) {
    rows.push([
      `cert-${i}.example.com`,          // cn
      `alt-${i}.example.com`,            // san
      `team-${(i % 5) + 1}`,             // owner
      `app-${(i % 3) + 1}`,              // application
      ['dev', 'hml', 'prd'][i % 3],      // environment
      'Vault PKI',                        // ca
      'zone-a',                           // zone
    ]);
  }
  return rows;
}

const CSV_HEADERS = ['cn', 'san', 'owner', 'application', 'environment', 'ca', 'zone'];

/** Count certificates in the database. */
function countCerts(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM certificates').get() as { cnt: number };
  return row.cnt;
}

/** Count audit log entries in the database. */
function countAuditEntries(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM audit_log').get() as { cnt: number };
  return row.cnt;
}

/* ------------------------------------------------------------------ */
/* Test suite                                                          */
/* ------------------------------------------------------------------ */

describe('CSV parsing (parseCsvContent)', () => {
  it('parses a simple CSV with headers', () => {
    const csv = 'cn,owner,application,environment\na.com,team,app,prd\n';
    const records = parseCsvContent(csv);
    expect(records).toHaveLength(1);
    expect(records[0].cn).toBe('a.com');
    expect(records[0].owner).toBe('team');
    expect(records[0].application).toBe('app');
    expect(records[0].environment).toBe('prd');
  });

  it('skips empty lines', () => {
    const csv = 'cn,owner,application,environment\n\na.com,team,app,prd\n\n';
    const records = parseCsvContent(csv);
    expect(records).toHaveLength(1);
  });

  it('trims whitespace from values', () => {
    const csv = 'cn,owner,application,environment\n  a.com  , team , app , prd \n';
    const records = parseCsvContent(csv);
    expect(records[0].cn).toBe('a.com');
    expect(records[0].owner).toBe('team');
  });

  it('returns empty array for header-only CSV', () => {
    const csv = 'cn,owner,application,environment\n';
    const records = parseCsvContent(csv);
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

  /* ================================================================ */
  /* AC 3: 100 valid rows → all imported                               */
  /* ================================================================ */
  it('imports 100 valid rows successfully (AC 3)', () => {
    const rows = generateValidRows(100);
    const csv = buildCsv(CSV_HEADERS, rows);

    const result = importCsvContent(db, csv);

    expect(result.imported).toBe(100);
    expect(result.failed).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(countCerts(db)).toBe(100);
    expect(countAuditEntries(db)).toBe(100);
  });

  /* ================================================================ */
  /* AC 4: 50 rows, 5 with missing owner → 45 imported, 5 reported    */
  /* ================================================================ */
  it('imports 45 of 50 rows when last 5 have missing owner (AC 4)', () => {
    // First 45 valid rows
    const validRows = generateValidRows(45);
    // Last 5 rows with missing owner
    const invalidRows: string[][] = [];
    for (let i = 46; i <= 50; i++) {
      invalidRows.push([
        `cert-${i}.example.com`,     // cn
        '',                           // san
        '',                           // owner  ← MISSING
        `app-${i}`,                   // application
        'prd',                        // environment
        'Vault PKI',                  // ca
        'zone-a',                     // zone
      ]);
    }

    const csv = buildCsv(CSV_HEADERS, [...validRows, ...invalidRows]);
    const result = importCsvContent(db, csv);

    expect(result.imported).toBe(45);
    expect(result.failed).toBe(5);
    expect(result.errors.length).toBeGreaterThanOrEqual(5);
    expect(result.errors.every((e) => e.field === 'owner')).toBe(true);
    expect(result.errors[0].row).toBe(46);
    expect(countCerts(db)).toBe(45);
  });

  /* ================================================================ */
  /* AC 42: 200 rows, row 150 invalid → 1-149 committed, 150+ skipped */
  /* ================================================================ */
  it('commits rows 1-149 and skips 150+ when row 150 is invalid (AC 42)', () => {
    // Generate 200 rows: first 149 valid, row 150 invalid, rest valid
    const allRows: string[][] = [];
    for (let i = 1; i <= 200; i++) {
      if (i === 150) {
        // Row 150: missing CN (invalid)
        allRows.push([
          '',                             // cn ← MISSING
          '',                             // san
          'team-a',                        // owner
          'app-a',                         // application
          'prd',                           // environment
          'Vault PKI',                     // ca
          'zone-a',                        // zone
        ]);
      } else {
        allRows.push([
          `cert-${i}.example.com`,
          `alt-${i}.example.com`,
          `team-${(i % 5) + 1}`,
          `app-${(i % 3) + 1}`,
          ['dev', 'hml', 'prd'][i % 3],
          'Vault PKI',
          'zone-a',
        ]);
      }
    }

    const csv = buildCsv(CSV_HEADERS, allRows);
    const result = importCsvContent(db, csv);

    // Rows 1-149 committed
    expect(result.imported).toBe(149);
    // Row 150 invalid + rows 151-200 skipped = 51 failed
    expect(result.failed).toBe(51);
    // Error reported for row 150
    expect(result.errors.some((e) => e.row === 150)).toBe(true);
    expect(result.errors.find((e) => e.row === 150)!.field).toBe('cn');
    // Verify in database
    expect(countCerts(db)).toBe(149);
    expect(countAuditEntries(db)).toBe(149);
  });

  /* ================================================================ */
  /* AC 47: Empty CSV → error "No valid rows found in file"            */
  /* ================================================================ */
  it('throws error for empty CSV (AC 47)', () => {
    // Header-only CSV (no data rows)
    const csv = 'cn,san,owner,application,environment,ca,zone\n';

    expect(() => importCsvContent(db, csv)).toThrow('No valid rows found in file');
    expect(countCerts(db)).toBe(0);
  });

  it('throws error for completely empty file (AC 47)', () => {
    expect(() => importCsvContent(db, '')).toThrow('No valid rows found in file');
    expect(countCerts(db)).toBe(0);
  });

  /* ================================================================ */
  /* Additional edge cases                                             */
  /* ================================================================ */

  it('imports a single valid row', () => {
    const csv = buildCsv(CSV_HEADERS, [
      ['api.bank.internal', 'api-v2.bank.internal', 'team-payments', 'API Payments', 'prd', 'Vault PKI', 'bank-prd'],
    ]);

    const result = importCsvContent(db, csv);

    expect(result.imported).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(countCerts(db)).toBe(1);
  });

  it('stores certificate with correct metadata from CSV row', () => {
    const csv = buildCsv(CSV_HEADERS, [
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
    const csv = buildCsv(CSV_HEADERS, generateValidRows(5));
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
      ['cert-1.com', '', 'team-a', 'app', 'prd', '', ''],  // valid
      ['cert-2.com', '', 'team-a', 'app', 'prd', '', ''],  // valid
      ['', '', 'team-a', 'app', 'prd', '', ''],             // invalid (no CN)
      ['cert-4.com', '', 'team-a', 'app', 'prd', '', ''],  // valid but skipped
      ['cert-5.com', '', 'team-a', 'app', 'prd', '', ''],  // valid but skipped
    ];

    const csv = buildCsv(CSV_HEADERS, rows);
    const result = importCsvContent(db, csv);

    expect(result.imported).toBe(2);
    expect(result.failed).toBe(3);
    // Error only for the invalid row (row 3)
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(3);
    expect(result.errors[0].field).toBe('cn');
    expect(countCerts(db)).toBe(2);
  });

  it('handles invalid environment value in a row', () => {
    const rows: string[][] = [
      ['cert-1.com', '', 'team-a', 'app', 'prd', '', ''],
      ['cert-2.com', '', 'team-a', 'app', 'staging', '', ''],  // invalid env
      ['cert-3.com', '', 'team-a', 'app', 'prd', '', ''],
    ];

    const csv = buildCsv(CSV_HEADERS, rows);
    const result = importCsvContent(db, csv);

    expect(result.imported).toBe(1);
    expect(result.failed).toBe(2);
    expect(result.errors.some((e) => e.row === 2 && e.field === 'environment')).toBe(true);
  });

  it('handles rows with multiple validation errors', () => {
    const rows: string[][] = [
      ['', '', '', '', 'staging', '', ''],  // all fields missing + bad env
    ];

    const csv = buildCsv(CSV_HEADERS, rows);
    const result = importCsvContent(db, csv);

    expect(result.imported).toBe(0);
    expect(result.failed).toBe(1);
    // Should have errors for cn, owner, application, environment (missing + invalid)
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
    expect(result.errors.map((e) => e.field)).toContain('cn');
    expect(result.errors.map((e) => e.field)).toContain('owner');
    expect(result.errors.map((e) => e.field)).toContain('application');
    expect(result.errors.map((e) => e.field)).toContain('environment');
  });

  it('handles CSV with tag columns', () => {
    const headers = [...CSV_HEADERS, 'tag_criticality', 'tag_team'];
    const rows: string[][] = [
      ['cert-1.com', '', 'team-a', 'app', 'prd', '', '', 'high', 'payments'],
    ];

    const csv = buildCsv(headers, rows);
    importCsvContent(db, csv);

    const cert = db
      .prepare('SELECT tags FROM certificates WHERE common_name = ?')
      .get('cert-1.com') as { tags: string };

    const tags = JSON.parse(cert.tags);
    expect(tags.criticality).toBe('high');
    expect(tags.team).toBe('payments');
  });

  it('handles all rows invalid (first row is already bad)', () => {
    const rows: string[][] = [
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
    ];

    const csv = buildCsv(CSV_HEADERS, rows);
    const result = importCsvContent(db, csv);

    expect(result.imported).toBe(0);
    expect(result.failed).toBe(3);
    expect(countCerts(db)).toBe(0);
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

/* ================================================================ */
/* AC 46: Non-CSV file → error "Only CSV files are supported"       */
/* ================================================================ */
describe('File type validation (AC 46)', () => {
  // Note: File type validation is handled by multer middleware (upload.ts).
  // These tests verify the multer configuration by importing the check functions.

  it('rejects non-CSV file extension via isCsvExtension', async () => {
    const { isCsvExtension } = await import('../../src/server/middleware/upload.js');
    expect(isCsvExtension('data.csv')).toBe(true);
    expect(isCsvExtension('data.CSV')).toBe(true);
    expect(isCsvExtension('data.txt')).toBe(false);
    expect(isCsvExtension('data.xlsx')).toBe(false);
    expect(isCsvExtension('data.json')).toBe(false);
    expect(isCsvExtension('data.pem')).toBe(false);
  });
});
