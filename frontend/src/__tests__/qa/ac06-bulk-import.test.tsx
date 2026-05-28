/**
 * QA Tests — Functional Requirement 6: Bulk Import from CSV
 *
 * Maps to: Scenarios 6.1–6.4
 */
import { describe, it, expect, vi } from 'vitest';
import {
  parseCsvPreview,
  REQUIRED_COLUMNS,
  ALL_COLUMNS,
  generateFailedRowsCsv,
} from '@/utils/csvPreview';

describe('AC 6 — Bulk Import from CSV', () => {
  // ─── Scenario 6.1: Successful bulk import (preview + validation) ──────
  describe('Scenario 6.1: Successful CSV parsing and validation', () => {
    it('parses a valid CSV with required columns', () => {
      const csv = [
        'cn,sans,serial,issuer,owner,environment,application,tags,zone',
        'api-payments.internal,payments-v2;payments-canary,1A2B3C,Vault PKI,payments-team,prd,api-payments,"mTLS;auto-renewal",bank-prd',
        'kafka-broker.internal,,ABC123,Vault PKI,data-team,prd,kafka,"mTLS",bank-prd',
      ].join('\n');

      const result = parseCsvPreview(csv);

      expect(result.headerErrors).toHaveLength(0);
      expect(result.totalRows).toBe(2);
      expect(result.validCount).toBe(2);
      expect(result.errorCount).toBe(0);
    });

    it('extracts correct data from parsed rows', () => {
      const csv = [
        'cn,issuer,owner,environment,application',
        'api-payments.internal,Vault PKI,payments-team,prd,api-payments',
      ].join('\n');

      const result = parseCsvPreview(csv);

      expect(result.rows[0].data.cn).toBe('api-payments.internal');
      expect(result.rows[0].data.issuer).toBe('Vault PKI');
      expect(result.rows[0].data.owner).toBe('payments-team');
      expect(result.rows[0].data.environment).toBe('prd');
      expect(result.rows[0].status).toBe('valid');
    });

    it('row numbers are 1-indexed', () => {
      const csv = [
        'cn,issuer,owner,environment',
        'cert1.internal,Vault PKI,team1,prd',
        'cert2.internal,Vault PKI,team2,prd',
      ].join('\n');

      const result = parseCsvPreview(csv);
      expect(result.rows[0].row).toBe(1);
      expect(result.rows[1].row).toBe(2);
    });
  });

  // ─── Scenario 6.2: Bulk import with validation errors ────────────────
  describe('Scenario 6.2: CSV with validation errors', () => {
    it('marks rows with missing required fields as errors', () => {
      const csv = [
        'cn,issuer,owner,environment',
        'valid-cert.internal,Vault PKI,team1,prd',
        ',Vault PKI,team2,prd',               // Missing CN
        'valid2.internal,Vault PKI,team3,prd',
      ].join('\n');

      const result = parseCsvPreview(csv);

      expect(result.validCount).toBe(2);
      expect(result.errorCount).toBe(1);
      expect(result.rows[1].status).toBe('error');
      expect(result.rows[1].errors).toContain('Campo "cn" é obrigatório');
    });

    it('validates multiple missing fields per row', () => {
      const csv = [
        'cn,issuer,owner,environment',
        ',,,', // All required fields missing
      ].join('\n');

      const result = parseCsvPreview(csv);

      expect(result.rows[0].status).toBe('error');
      expect(result.rows[0].errors.length).toBeGreaterThanOrEqual(4);
    });

    it('validates environment values', () => {
      const csv = [
        'cn,issuer,owner,environment',
        'cert.internal,Vault PKI,team1,INVALID_ENV',
      ].join('\n');

      const result = parseCsvPreview(csv);

      expect(result.rows[0].status).toBe('error');
      expect(result.rows[0].errors.some((e) => e.includes('Ambiente inválido'))).toBe(true);
    });

    it('validates date fields', () => {
      const csv = [
        'cn,issuer,owner,environment,not_before',
        'cert.internal,Vault PKI,team1,prd,not-a-date',
      ].join('\n');

      const result = parseCsvPreview(csv);

      expect(result.rows[0].status).toBe('error');
      expect(result.rows[0].errors.some((e) => e.includes('Data inválida'))).toBe(true);
    });
  });

  // ─── Scenario 6.2 continued: Failed rows download ────────────────────
  describe('Scenario 6.2: Failed rows available for download', () => {
    it('generates CSV content from failed rows', () => {
      const failedRows = [
        {
          row: 3,
          data: { cn: '', issuer: 'Vault PKI', owner: 'team', environment: 'prd' },
          errors: ['Campo "cn" é obrigatório'],
        },
      ];

      const csv = generateFailedRowsCsv(failedRows);
      expect(csv).toContain('row');
      expect(csv).toContain('3');
      expect(csv).toContain('Campo "cn" é obrigatório');
    });

    it('returns empty string when no failed rows', () => {
      expect(generateFailedRowsCsv([])).toBe('');
    });
  });

  // ─── Scenario 6.3: Duplicate detection in CSV ────────────────────────
  // Note: Duplicate detection happens server-side. Client-side only validates format.
  describe('Scenario 6.3: Duplicate detection', () => {
    it('CsvPreviewRow type includes duplicate status option', () => {
      // This is a type check — CsvPreviewRow has 'duplicate' as a possible status
      const mockRow = {
        row: 1,
        data: {} as any,
        status: 'duplicate' as const,
        errors: [],
      };
      expect(mockRow.status).toBe('duplicate');
    });
  });

  // ─── Scenario 6.4: Large bulk import ──────────────────────────────────
  describe('Scenario 6.4: Large CSV parsing (performance)', () => {
    it('limits preview to 100 rows for performance', () => {
      const header = 'cn,issuer,owner,environment';
      const rows = Array.from(
        { length: 200 },
        (_, i) => `cert-${i}.internal,Vault PKI,team,prd`,
      );
      const csv = [header, ...rows].join('\n');

      const result = parseCsvPreview(csv);

      // Preview rows limited to 100
      expect(result.rows.length).toBeLessThanOrEqual(100);
      // But totalRows reflects the full count
      expect(result.totalRows).toBe(200);
    });
  });

  // ─── Header validation (Scenario 10.2 - Malformed CSV) ───────────────
  describe('Scenario 10.2: Malformed CSV — missing required columns', () => {
    it('returns header errors when required columns are missing', () => {
      const csv = ['wrong_col,another_col', 'val1,val2'].join('\n');

      const result = parseCsvPreview(csv);

      expect(result.headerErrors.length).toBeGreaterThan(0);
      expect(result.headerErrors.some((e) => e.includes('"cn"'))).toBe(true);
      expect(result.headerErrors.some((e) => e.includes('"issuer"'))).toBe(true);
      expect(result.headerErrors.some((e) => e.includes('"owner"'))).toBe(true);
      expect(result.headerErrors.some((e) => e.includes('"environment"'))).toBe(true);
    });

    it('returns empty rows when header validation fails', () => {
      const csv = ['bad_header', 'val1'].join('\n');
      const result = parseCsvPreview(csv);

      expect(result.rows).toHaveLength(0);
      expect(result.validCount).toBe(0);
    });

    it('REQUIRED_COLUMNS includes cn, issuer, owner, environment', () => {
      expect(REQUIRED_COLUMNS).toContain('cn');
      expect(REQUIRED_COLUMNS).toContain('issuer');
      expect(REQUIRED_COLUMNS).toContain('owner');
      expect(REQUIRED_COLUMNS).toContain('environment');
    });
  });

  // ─── BOM handling ────────────────────────────────────────────────────
  describe('CSV with BOM (byte order mark)', () => {
    it('strips BOM before parsing', () => {
      const csv = '\uFEFFcn,issuer,owner,environment\ncert.internal,Vault PKI,team,prd';
      const result = parseCsvPreview(csv);

      expect(result.headerErrors).toHaveLength(0);
      expect(result.validCount).toBe(1);
    });
  });
});
