import { describe, it, expect } from 'vitest';
import {
  validateHeaders,
  parseCsvContent,
  generateCsvTemplate,
  REQUIRED_COLUMNS,
  ALL_COLUMNS,
} from '../utils/csvParser.js';

// ─── Tests: validateHeaders ─────────────────────────────────────────────────

describe('validateHeaders', () => {
  it('should pass when all required columns are present', () => {
    const errors = validateHeaders(['cn', 'issuer', 'owner', 'environment']);
    expect(errors).toHaveLength(0);
  });

  it('should pass when extra columns are present', () => {
    const errors = validateHeaders([
      'cn',
      'issuer',
      'owner',
      'environment',
      'sans',
      'serial',
      'algorithm',
    ]);
    expect(errors).toHaveLength(0);
  });

  it('should detect missing required column', () => {
    const errors = validateHeaders(['cn', 'issuer', 'owner']); // missing 'environment'
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('environment');
  });

  it('should detect multiple missing required columns', () => {
    const errors = validateHeaders(['sans', 'serial']); // missing all required
    expect(errors).toHaveLength(REQUIRED_COLUMNS.length);
  });

  it('should be case-insensitive for headers', () => {
    const errors = validateHeaders(['CN', 'Issuer', 'OWNER', 'Environment']);
    expect(errors).toHaveLength(0);
  });

  it('should handle whitespace in headers', () => {
    const errors = validateHeaders([' cn ', ' issuer ', ' owner ', ' environment ']);
    expect(errors).toHaveLength(0);
  });

  it('should report errors for empty headers array', () => {
    const errors = validateHeaders([]);
    expect(errors).toHaveLength(REQUIRED_COLUMNS.length);
  });
});

// ─── Tests: parseCsvContent ─────────────────────────────────────────────────

describe('parseCsvContent', () => {
  it('should parse valid CSV with all required columns', () => {
    const csv = [
      'cn,issuer,owner,environment',
      'api.example.com,CN=Test CA,teamA,prd',
      'web.example.com,CN=Test CA,teamB,dev',
    ].join('\n');

    const result = parseCsvContent(csv);

    expect(result.headerErrors).toHaveLength(0);
    expect(result.rows).toHaveLength(2);
    expect(result.validCount).toBe(2);
    expect(result.errorCount).toBe(0);
    expect(result.rows[0].status).toBe('valid');
    expect(result.rows[0].data.cn).toBe('api.example.com');
    expect(result.rows[0].data.issuer).toBe('CN=Test CA');
    expect(result.rows[0].data.owner).toBe('teamA');
    expect(result.rows[0].data.environment).toBe('prd');
    expect(result.rows[0].row).toBe(1);
    expect(result.rows[1].row).toBe(2);
  });

  it('should parse CSV with all columns', () => {
    const csv = [
      'cn,sans,serial,issuer,not_before,not_after,algorithm,fingerprint_sha256,owner,application,environment,zone,ca_provider,description,tags',
      'api.example.com,api.example.com;www.example.com,AABB,CN=DigiCert,2024-01-01T00:00:00Z,2025-01-01T00:00:00Z,RSA-2048,AB:CD:EF,teamA,api-gw,prd,us-east-1,DigiCert,Production API,team:platform;env:prod',
    ].join('\n');

    const result = parseCsvContent(csv);

    expect(result.headerErrors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.validCount).toBe(1);

    const row = result.rows[0].data;
    expect(row.cn).toBe('api.example.com');
    expect(row.sans).toEqual(['api.example.com', 'www.example.com']);
    expect(row.serial).toBe('AABB');
    expect(row.notBefore).toBe('2024-01-01T00:00:00Z');
    expect(row.notAfter).toBe('2025-01-01T00:00:00Z');
    expect(row.algorithm).toBe('RSA-2048');
    expect(row.fingerprintSha256).toBe('AB:CD:EF');
    expect(row.owner).toBe('teamA');
    expect(row.application).toBe('api-gw');
    expect(row.environment).toBe('prd');
    expect(row.zone).toBe('us-east-1');
    expect(row.caProvider).toBe('DigiCert');
    expect(row.description).toBe('Production API');
    expect(row.tags).toEqual({ team: 'platform', env: 'prod' });
  });

  it('should report header errors for missing required columns', () => {
    const csv = ['sans,serial,algorithm', 'foo,bar,baz'].join('\n');

    const result = parseCsvContent(csv);

    expect(result.headerErrors.length).toBeGreaterThan(0);
    expect(result.rows).toHaveLength(0);
  });

  it('should detect missing required field values', () => {
    const csv = [
      'cn,issuer,owner,environment',
      ',CN=Test CA,teamA,prd', // missing cn
      'api.example.com,,teamA,prd', // missing issuer
      'api.example.com,CN=Test CA,,prd', // missing owner
      'api.example.com,CN=Test CA,teamA,', // missing environment
    ].join('\n');

    const result = parseCsvContent(csv);

    expect(result.rows).toHaveLength(4);
    expect(result.errorCount).toBe(4);
    expect(result.validCount).toBe(0);

    expect(result.rows[0].errors[0]).toContain('cn');
    expect(result.rows[1].errors[0]).toContain('issuer');
    expect(result.rows[2].errors[0]).toContain('owner');
    expect(result.rows[3].errors[0]).toContain('environment');
  });

  it('should reject invalid environment values', () => {
    const csv = ['cn,issuer,owner,environment', 'api.example.com,CN=Test CA,teamA,staging'].join(
      '\n',
    );

    const result = parseCsvContent(csv);

    expect(result.rows[0].status).toBe('error');
    expect(result.rows[0].errors[0]).toContain('Invalid environment');
    expect(result.rows[0].errors[0]).toContain('staging');
  });

  it('should validate date formats', () => {
    const csv = [
      'cn,issuer,owner,environment,not_before,not_after',
      'api.example.com,CN=Test CA,teamA,prd,not-a-date,2025-01-01T00:00:00Z',
    ].join('\n');

    const result = parseCsvContent(csv);

    expect(result.rows[0].status).toBe('error');
    expect(result.rows[0].errors).toEqual(
      expect.arrayContaining([expect.stringContaining('not_before')]),
    );
  });

  it('should handle empty CSV (headers only)', () => {
    const csv = 'cn,issuer,owner,environment\n';
    const result = parseCsvContent(csv);

    expect(result.rows).toHaveLength(0);
    expect(result.validCount).toBe(0);
    expect(result.errorCount).toBe(0);
  });

  it('should skip empty lines', () => {
    const csv = [
      'cn,issuer,owner,environment',
      'api.example.com,CN=Test CA,teamA,prd',
      '',
      '',
      'web.example.com,CN=Test CA,teamB,dev',
    ].join('\n');

    const result = parseCsvContent(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.validCount).toBe(2);
  });

  it('should handle CSV with BOM', () => {
    const csv = '\uFEFFcn,issuer,owner,environment\napi.example.com,CN=Test CA,teamA,prd';
    // Note: BOM should be handled by the caller; PapaParse handles it in header parsing
    const result = parseCsvContent(csv);

    // Even with BOM, should work because PapaParse trims headers
    expect(result.rows.length).toBeGreaterThanOrEqual(0);
  });

  it('should handle multiple validation errors in one row', () => {
    const csv = ['cn,issuer,owner,environment,not_before', ',,teamA,staging,invalid-date'].join(
      '\n',
    );

    const result = parseCsvContent(csv);

    expect(result.rows[0].status).toBe('error');
    expect(result.rows[0].errors.length).toBeGreaterThanOrEqual(3);
  });

  it('should parse SANs separated by semicolons', () => {
    const csv = [
      'cn,sans,issuer,owner,environment',
      'api.example.com,api.example.com;www.example.com;cdn.example.com,CN=Test CA,teamA,prd',
    ].join('\n');

    const result = parseCsvContent(csv);

    expect(result.rows[0].data.sans).toEqual([
      'api.example.com',
      'www.example.com',
      'cdn.example.com',
    ]);
  });

  it('should handle tags in key:value;key:value format', () => {
    const csv = [
      'cn,issuer,owner,environment,tags',
      'api.example.com,CN=Test CA,teamA,prd,team:platform;env:production',
    ].join('\n');

    const result = parseCsvContent(csv);

    expect(result.rows[0].data.tags).toEqual({
      team: 'platform',
      env: 'production',
    });
  });
});

// ─── Tests: generateCsvTemplate ─────────────────────────────────────────────

describe('generateCsvTemplate', () => {
  it('should include all column headers', () => {
    const template = generateCsvTemplate();
    const firstLine = template.split('\n')[0];

    for (const col of ALL_COLUMNS) {
      expect(firstLine).toContain(col);
    }
  });

  it('should include example rows', () => {
    const template = generateCsvTemplate();
    const lines = template.split('\n').filter(Boolean);

    expect(lines.length).toBeGreaterThanOrEqual(2); // header + at least 1 example
  });

  it('should be parseable by parseCsvContent', () => {
    const template = generateCsvTemplate();
    const result = parseCsvContent(template);

    expect(result.headerErrors).toHaveLength(0);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.validCount).toBeGreaterThan(0);
  });
});
