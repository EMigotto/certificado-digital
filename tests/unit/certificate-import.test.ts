/**
 * Tests for certificate import and validation.
 * Covers AC Scenarios: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3
 */
import { describe, it, expect } from 'vitest';
import {
  isValidPEM,
  isValidPKCS12,
  validateImportForm,
  validateCsvRows,
  buildImportSummary,
  type CsvRow,
} from '../../src/models/import.js';

/* ================================================================ */
/* AC 3.1 / 3.3 — PEM validation                                    */
/* ================================================================ */
describe('PEM validation (AC 3.1 / 3.3)', () => {
  const VALID_PEM = `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAJC1HiIAZAiUMA0GCSqGSIb3Qw0BAQsFADA=
-----END CERTIFICATE-----`;

  it('accepts a valid PEM certificate (AC 3.1)', () => {
    expect(isValidPEM(VALID_PEM)).toBe(true);
  });

  it('accepts PEM with leading/trailing whitespace', () => {
    expect(isValidPEM(`  \n${VALID_PEM}\n  `)).toBe(true);
  });

  it('rejects an invalid PEM (AC 3.3)', () => {
    expect(isValidPEM('this is not a certificate')).toBe(false);
  });

  it('rejects PEM missing footer (AC 3.3)', () => {
    expect(isValidPEM('-----BEGIN CERTIFICATE-----\nblah')).toBe(false);
  });

  it('rejects empty string (AC 3.3)', () => {
    expect(isValidPEM('')).toBe(false);
  });

  it('rejects a private key as certificate', () => {
    expect(
      isValidPEM('-----BEGIN PRIVATE KEY-----\nblah\n-----END PRIVATE KEY-----'),
    ).toBe(false);
  });
});

/* ================================================================ */
/* AC 3.2 — PKCS#12 validation                                      */
/* ================================================================ */
describe('PKCS#12 validation (AC 3.2)', () => {
  it('accepts data starting with ASN.1 SEQUENCE tag (AC 3.2)', () => {
    // Minimal PKCS#12 structure: SEQUENCE tag (0x30), length...
    const data = new Uint8Array([0x30, 0x82, 0x01, 0x00, 0x02]);
    expect(isValidPKCS12(data)).toBe(true);
  });

  it('rejects data not starting with SEQUENCE tag', () => {
    const data = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    expect(isValidPKCS12(data)).toBe(false);
  });

  it('rejects empty data', () => {
    const data = new Uint8Array([]);
    expect(isValidPKCS12(data)).toBe(false);
  });

  it('rejects data that is too short (< 4 bytes)', () => {
    const data = new Uint8Array([0x30, 0x00]);
    expect(isValidPKCS12(data)).toBe(false);
  });
});

/* ================================================================ */
/* AC 3.4 — Required fields validation                               */
/* ================================================================ */
describe('Import form required fields (AC 3.4)', () => {
  it('passes with all required fields filled', () => {
    const errors = validateImportForm({
      owner: 'time-pagamentos',
      application: 'API Payments v2',
      environment: 'prd',
    });
    expect(errors).toHaveLength(0);
  });

  it('fails when Owner is missing (AC 3.4)', () => {
    const errors = validateImportForm({
      application: 'API Payments v2',
      environment: 'prd',
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('owner');
  });

  it('fails when Application is missing (AC 3.4)', () => {
    const errors = validateImportForm({
      owner: 'time-pagamentos',
      environment: 'prd',
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('application');
  });

  it('fails when Environment is missing (AC 3.4)', () => {
    const errors = validateImportForm({
      owner: 'time-pagamentos',
      application: 'API Payments v2',
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('environment');
  });

  it('fails when all required fields are missing (AC 3.4)', () => {
    const errors = validateImportForm({});
    expect(errors).toHaveLength(3);
    const fields = errors.map((e) => e.field);
    expect(fields).toContain('owner');
    expect(fields).toContain('application');
    expect(fields).toContain('environment');
  });

  it('fails for invalid environment value', () => {
    const errors = validateImportForm({
      owner: 'team',
      application: 'app',
      environment: 'staging',
    });
    expect(errors.some((e) => e.field === 'environment')).toBe(true);
  });

  it('fails for empty-string fields (whitespace only)', () => {
    const errors = validateImportForm({
      owner: '   ',
      application: '',
      environment: 'prd',
    });
    expect(errors).toHaveLength(2);
  });
});

/* ================================================================ */
/* AC 4.1 / 4.2 — CSV batch import validation                       */
/* ================================================================ */
describe('CSV batch import (AC 4.1 / 4.2)', () => {
  const validRows: CsvRow[] = [
    {
      cn: 'api-payments.bank.internal',
      san: 'payments-v2,payments-canary',
      owner: 'time-pagamentos',
      application: 'API Payments v2',
      environment: 'prd',
      ca: 'Vault PKI',
      zone: 'bank-prd',
      tag_criticality: 'alta',
      tag_team: 'payments',
    },
    {
      cn: 'mtls-broker.bank.internal',
      san: '',
      owner: 'time-data',
      application: 'Kafka Broker',
      environment: 'prd',
      ca: 'ACM PCA',
      zone: 'bank-prd',
      tag_criticality: 'high',
      tag_team: 'data',
    },
  ];

  it('accepts valid CSV rows (AC 4.1)', () => {
    const result = validateCsvRows(validRows);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects row with missing required field (AC 4.2)', () => {
    const badRows: CsvRow[] = [
      ...validRows,
      {
        cn: '',
        owner: 'team',
        application: 'app',
        environment: 'prd',
      },
    ];
    const result = validateCsvRows(badRows);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.row === 3 && e.field === 'cn')).toBe(true);
  });

  it('reports row 5 error when row 5 has missing field (AC 4.2)', () => {
    const rows: CsvRow[] = [
      { cn: 'a.com', owner: 'o', application: 'a', environment: 'prd' },
      { cn: 'b.com', owner: 'o', application: 'a', environment: 'prd' },
      { cn: 'c.com', owner: 'o', application: 'a', environment: 'prd' },
      { cn: 'd.com', owner: 'o', application: 'a', environment: 'prd' },
      { cn: 'e.com', owner: '', application: 'a', environment: 'prd' }, // row 5 bad
    ];
    const result = validateCsvRows(rows);
    expect(result.valid).toBe(false);
    expect(result.errors[0].row).toBe(5);
    expect(result.errors[0].field).toBe('owner');
  });

  it('rejects invalid environment in CSV row', () => {
    const rows: CsvRow[] = [
      { cn: 'a.com', owner: 'o', application: 'a', environment: 'staging' },
    ];
    const result = validateCsvRows(rows);
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe('environment');
  });

  it('validates ALL rows before committing (AC 4.2)', () => {
    const rows: CsvRow[] = [
      { cn: '', owner: 'o', application: 'a', environment: 'prd' },   // row 1 bad
      { cn: 'b.com', owner: '', application: 'a', environment: 'prd' }, // row 2 bad
      { cn: 'c.com', owner: 'o', application: 'a', environment: 'prd' }, // ok
    ];
    const result = validateCsvRows(rows);
    expect(result.valid).toBe(false);
    // Both bad rows reported
    expect(result.errors.some((e) => e.row === 1)).toBe(true);
    expect(result.errors.some((e) => e.row === 2)).toBe(true);
  });
});

/* ================================================================ */
/* AC 4.3 — API import summary                                      */
/* ================================================================ */
describe('API import summary (AC 4.3)', () => {
  it('returns correct import count with no errors', () => {
    const summary = buildImportSummary(23, []);
    expect(summary.imported).toBe(23);
    expect(summary.failed).toBe(0);
    expect(summary.errors).toHaveLength(0);
  });

  it('returns import summary with errors', () => {
    const errors = [
      { index: 2, message: 'Invalid CN' },
      { index: 5, message: 'Missing owner' },
    ];
    const summary = buildImportSummary(10, errors);
    expect(summary.imported).toBe(8);
    expect(summary.failed).toBe(2);
    expect(summary.errors).toHaveLength(2);
  });

  it('handles all-failed scenario', () => {
    const errors = [
      { index: 0, message: 'Bad' },
      { index: 1, message: 'Bad' },
    ];
    const summary = buildImportSummary(2, errors);
    expect(summary.imported).toBe(0);
    expect(summary.failed).toBe(2);
  });
});
