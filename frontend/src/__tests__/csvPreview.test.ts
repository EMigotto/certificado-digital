/**
 * Unit tests for client-side CSV preview parser utility.
 */

import { describe, it, expect } from 'vitest';
import {
  parseCsvPreview,
  generateFailedRowsCsv,
  REQUIRED_COLUMNS,
  ALL_COLUMNS,
} from '@/utils/csvPreview';

// ─── Test data ──────────────────────────────────────────────────────────────

const VALID_CSV = `cn,issuer,owner,environment,application,zone
api.example.com,CN=DigiCert Root,team-platform,prd,api-gateway,us-east-1
auth.internal,CN=Internal CA,team-iam,hml,auth-svc,eu-west-1
`;

const CSV_WITH_ERRORS = `cn,issuer,owner,environment
api.example.com,CN=DigiCert Root,team-platform,prd
,CN=Internal CA,team-iam,hml
auth.internal,,team-iam,invalid-env
`;

const CSV_MISSING_HEADERS = `cn,issuer,application
api.example.com,CN=DigiCert Root,api-gateway
`;

const CSV_WITH_BOM = `\uFEFFcn,issuer,owner,environment
api.example.com,CN=DigiCert Root,team-platform,prd
`;

const EMPTY_CSV = `cn,issuer,owner,environment
`;

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('csvPreview', () => {
  describe('constants', () => {
    it('should have correct required columns', () => {
      expect(REQUIRED_COLUMNS).toContain('cn');
      expect(REQUIRED_COLUMNS).toContain('issuer');
      expect(REQUIRED_COLUMNS).toContain('owner');
      expect(REQUIRED_COLUMNS).toContain('environment');
      expect(REQUIRED_COLUMNS).toHaveLength(4);
    });

    it('should have all expected columns', () => {
      expect(ALL_COLUMNS.length).toBeGreaterThanOrEqual(15);
      expect(ALL_COLUMNS).toContain('cn');
      expect(ALL_COLUMNS).toContain('sans');
      expect(ALL_COLUMNS).toContain('tags');
    });
  });

  describe('parseCsvPreview', () => {
    it('should parse a valid CSV with no errors', () => {
      const result = parseCsvPreview(VALID_CSV);

      expect(result.headerErrors).toHaveLength(0);
      expect(result.rows).toHaveLength(2);
      expect(result.validCount).toBe(2);
      expect(result.errorCount).toBe(0);
      expect(result.rows[0].status).toBe('valid');
      expect(result.rows[0].data.cn).toBe('api.example.com');
      expect(result.rows[0].data.environment).toBe('prd');
    });

    it('should detect missing required columns', () => {
      const result = parseCsvPreview(CSV_MISSING_HEADERS);

      expect(result.headerErrors.length).toBeGreaterThan(0);
      expect(result.rows).toHaveLength(0);
    });

    it('should validate rows and detect errors', () => {
      const result = parseCsvPreview(CSV_WITH_ERRORS);

      expect(result.headerErrors).toHaveLength(0);
      expect(result.rows).toHaveLength(3);

      expect(result.rows[0].status).toBe('valid');
      expect(result.rows[1].status).toBe('error');
      expect(result.rows[1].errors.length).toBeGreaterThan(0);
      expect(result.rows[2].status).toBe('error');
      expect(result.rows[2].errors.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle BOM-prefixed CSV', () => {
      const result = parseCsvPreview(CSV_WITH_BOM);

      expect(result.headerErrors).toHaveLength(0);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe('valid');
    });

    it('should handle empty CSV (headers only)', () => {
      const result = parseCsvPreview(EMPTY_CSV);

      expect(result.headerErrors).toHaveLength(0);
      expect(result.rows).toHaveLength(0);
      expect(result.validCount).toBe(0);
    });

    it('should report correct counts', () => {
      const result = parseCsvPreview(CSV_WITH_ERRORS);

      expect(result.validCount).toBe(1);
      expect(result.errorCount).toBe(2);
      expect(result.totalRows).toBe(3);
    });

    it('should trim whitespace in field values', () => {
      const csv = `cn,issuer,owner,environment
  api.example.com  , CN=Root , team-platform , prd
`;
      const result = parseCsvPreview(csv);
      expect(result.rows[0].data.cn).toBe('api.example.com');
      expect(result.rows[0].data.issuer).toBe('CN=Root');
      expect(result.rows[0].data.owner).toBe('team-platform');
      expect(result.rows[0].data.environment).toBe('prd');
    });

    it('should validate environment values', () => {
      const csv = `cn,issuer,owner,environment
api.example.com,CN=Root,team-platform,staging
`;
      const result = parseCsvPreview(csv);
      expect(result.rows[0].status).toBe('error');
      expect(result.rows[0].errors.some((e) => e.includes('Ambiente inválido'))).toBe(true);
    });

    it('should accept all valid environments', () => {
      for (const env of ['dev', 'hml', 'prd']) {
        const csv = `cn,issuer,owner,environment\ntest.com,CN=Root,owner,${env}\n`;
        const result = parseCsvPreview(csv);
        expect(result.rows[0].status).toBe('valid');
      }
    });
  });

  describe('generateFailedRowsCsv', () => {
    it('should return empty string for no failed rows', () => {
      expect(generateFailedRowsCsv([])).toBe('');
    });

    it('should generate CSV with headers and error details', () => {
      const failedRows = [
        {
          row: 2,
          data: { cn: 'test.com', issuer: '', owner: 'team', environment: 'prd' },
          errors: ['Campo "issuer" é obrigatório'],
        },
      ];

      const csv = generateFailedRowsCsv(failedRows);
      expect(csv).toContain('row');
      expect(csv).toContain('errors');
      expect(csv).toContain('test.com');
      expect(csv).toContain('issuer');
    });
  });
});
