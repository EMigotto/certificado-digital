import { describe, it, expect, vi, beforeEach } from 'vitest';
import forge from 'node-forge';
import { ImportService } from '../services/importService.js';
import type { PrismaClient } from '@prisma/client';

// ─── Test helpers ───────────────────────────────────────────────────────────

/**
 * Generate a self-signed PEM test certificate.
 */
function generatePemCert(cn: string = 'test.example.com'): {
  pem: string;
  buffer: Buffer;
} {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = 'AABBCCDD01';
  cert.validity.notBefore = new Date('2024-01-01');
  cert.validity.notAfter = new Date('2025-12-31');
  cert.setSubject([{ shortName: 'CN', value: cn }]);
  cert.setIssuer([{ shortName: 'CN', value: 'Test CA' }]);
  cert.setExtensions([
    {
      name: 'subjectAltName',
      altNames: [{ type: 2, value: cn }],
    },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const pem = forge.pki.certificateToPem(cert);
  return { pem, buffer: Buffer.from(pem, 'utf-8') };
}

/**
 * Create a mock PrismaClient with all methods needed by ImportService.
 */
function createMockPrisma() {
  const mockCreate = vi.fn();
  const mockCreateMany = vi.fn();
  const mockFindFirst = vi.fn();
  const mockAuditCreate = vi.fn();
  const mockTransaction = vi.fn();

  const prisma = {
    certificate: {
      create: mockCreate,
      createMany: mockCreateMany,
      findFirst: mockFindFirst,
    },
    auditLog: {
      create: mockAuditCreate,
    },
    $transaction: mockTransaction,
  } as unknown as PrismaClient;

  return {
    prisma,
    mocks: {
      certCreate: mockCreate,
      certCreateMany: mockCreateMany,
      certFindFirst: mockFindFirst,
      auditCreate: mockAuditCreate,
      transaction: mockTransaction,
    },
  };
}

// ─── Tests: importSingleCertificate ─────────────────────────────────────────

describe('ImportService.importSingleCertificate', () => {
  let service: ImportService;
  let mocks: ReturnType<typeof createMockPrisma>['mocks'];

  beforeEach(() => {
    const { prisma, mocks: m } = createMockPrisma();
    mocks = m;
    service = new ImportService(prisma);
  });

  it('should import a valid PEM certificate', async () => {
    const { buffer } = generatePemCert('import.example.com');

    mocks.certFindFirst.mockResolvedValue(null); // No duplicates
    mocks.certCreate.mockResolvedValue({
      id: 'new-cert-id',
      commonName: 'import.example.com',
      serial: 'AABBCCDD01',
    });
    mocks.auditCreate.mockResolvedValue({ id: 'audit-1' });

    const result = await service.importSingleCertificate(
      buffer,
      'cert.pem',
      undefined,
      { owner: 'teamA', environment: 'prd' },
      'admin',
    );

    expect(result.status).toBe('created');
    if (result.status === 'created') {
      expect(result.certificate.commonName).toBe('import.example.com');
      expect(result.auditId).toBe('audit-1');
    }

    // Verify certificate.create was called with correct fields
    expect(mocks.certCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        commonName: 'import.example.com',
        owner: 'teamA',
        environment: 'prd',
      }),
    });

    // Verify audit log was created
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CREATE',
        actor: 'admin',
        result: 'SUCCESS',
        detail: expect.stringContaining('imported'),
      }),
    });
  });

  it('should detect duplicate by fingerprint', async () => {
    const { buffer } = generatePemCert('dup.example.com');

    mocks.certFindFirst.mockResolvedValueOnce({
      id: 'existing-id',
      commonName: 'dup.example.com',
      issuer: 'CN=Test CA',
      fingerprintSha256: 'AB:CD:EF',
    });

    const result = await service.importSingleCertificate(buffer, 'cert.pem', undefined, {
      owner: 'teamA',
    });

    expect(result.status).toBe('duplicate');
    if (result.status === 'duplicate') {
      expect(result.duplicate.existingId).toBe('existing-id');
      expect(result.duplicate.matchType).toBe('fingerprint');
    }
  });

  it('should detect duplicate by CN + issuer', async () => {
    const { buffer } = generatePemCert('dup-cn.example.com');

    // First findFirst (fingerprint) returns null
    mocks.certFindFirst.mockResolvedValueOnce(null);
    // Second findFirst (CN + issuer) returns existing
    mocks.certFindFirst.mockResolvedValueOnce({
      id: 'existing-id',
      commonName: 'dup-cn.example.com',
      issuer: 'CN=Test CA',
      fingerprintSha256: 'XX:YY:ZZ',
    });

    const result = await service.importSingleCertificate(buffer, 'cert.pem', undefined, {
      owner: 'teamA',
    });

    expect(result.status).toBe('duplicate');
    if (result.status === 'duplicate') {
      expect(result.duplicate.matchType).toBe('cn_issuer');
    }
  });

  it('should return invalid for unparseable file', async () => {
    const buffer = Buffer.from('-----BEGIN CERTIFICATE-----\nINVALID\n-----END CERTIFICATE-----');

    mocks.auditCreate.mockResolvedValue({ id: 'audit-fail' });

    const result = await service.importSingleCertificate(buffer, 'bad.pem', undefined, {
      owner: 'teamA',
    });

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.error).toContain('Failed to parse');
    }

    // Verify failure audit was logged
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        result: 'FAILURE',
      }),
    });
  });

  it('should return unsupported for unknown file format', async () => {
    const buffer = Buffer.from('Hello World - not a cert');

    mocks.auditCreate.mockResolvedValue({ id: 'audit-fail' });

    const result = await service.importSingleCertificate(buffer, 'readme.txt', undefined, {
      owner: 'teamA',
    });

    expect(result.status).toBe('unsupported');
  });

  it('should pass metadata (owner, environment, tags) to created cert', async () => {
    const { buffer } = generatePemCert('meta.example.com');

    mocks.certFindFirst.mockResolvedValue(null);
    mocks.certCreate.mockResolvedValue({
      id: 'cert-id',
      commonName: 'meta.example.com',
    });
    mocks.auditCreate.mockResolvedValue({ id: 'audit-1' });

    await service.importSingleCertificate(buffer, 'cert.pem', undefined, {
      owner: 'team-security',
      environment: 'hml',
      application: 'web-app',
      tags: { team: 'security', tier: '1' },
    });

    expect(mocks.certCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        owner: 'team-security',
        environment: 'hml',
        application: 'web-app',
        tags: { team: 'security', tier: '1' },
      }),
    });
  });
});

// ─── Tests: previewCsvImport ────────────────────────────────────────────────

describe('ImportService.previewCsvImport', () => {
  let service: ImportService;
  let mocks: ReturnType<typeof createMockPrisma>['mocks'];

  beforeEach(() => {
    const { prisma, mocks: m } = createMockPrisma();
    mocks = m;
    service = new ImportService(prisma);
  });

  it('should return preview with valid rows', async () => {
    mocks.certFindFirst.mockResolvedValue(null); // No duplicates

    const csv = [
      'cn,issuer,owner,environment',
      'api.example.com,CN=Test CA,teamA,prd',
      'web.example.com,CN=Test CA,teamB,dev',
    ].join('\n');

    const preview = await service.previewCsvImport(csv);

    expect(preview.headerErrors).toHaveLength(0);
    expect(preview.validCount).toBe(2);
    expect(preview.errorCount).toBe(0);
    expect(preview.duplicateCount).toBe(0);
    expect(preview.rows).toHaveLength(2);
  });

  it('should detect duplicates in preview', async () => {
    mocks.certFindFirst.mockResolvedValueOnce({
      id: 'existing-id',
      commonName: 'api.example.com',
      issuer: 'CN=Test CA',
    });
    mocks.certFindFirst.mockResolvedValueOnce(null);

    const csv = [
      'cn,issuer,owner,environment',
      'api.example.com,CN=Test CA,teamA,prd',
      'new.example.com,CN=Test CA,teamB,dev',
    ].join('\n');

    const preview = await service.previewCsvImport(csv);

    expect(preview.duplicateCount).toBe(1);
    expect(preview.validCount).toBe(1);
    expect(preview.rows[0].status).toBe('duplicate');
    expect(preview.rows[1].status).toBe('valid');
  });

  it('should report header errors', async () => {
    const csv = ['sans,serial', 'foo,bar'].join('\n');

    const preview = await service.previewCsvImport(csv);

    expect(preview.headerErrors.length).toBeGreaterThan(0);
    expect(preview.rows).toHaveLength(0);
  });

  it('should report row-level errors alongside valid rows', async () => {
    mocks.certFindFirst.mockResolvedValue(null);

    const csv = [
      'cn,issuer,owner,environment',
      'valid.example.com,CN=Test CA,teamA,prd',
      ',,teamA,staging', // missing cn, issuer, invalid env
    ].join('\n');

    const preview = await service.previewCsvImport(csv);

    expect(preview.validCount).toBe(1);
    expect(preview.errorCount).toBe(1);
    expect(preview.rows[0].status).toBe('valid');
    expect(preview.rows[1].status).toBe('error');
    expect(preview.rows[1].errors.length).toBeGreaterThan(0);
  });
});

// ─── Tests: executeCsvImport ────────────────────────────────────────────────

describe('ImportService.executeCsvImport', () => {
  let service: ImportService;
  let mocks: ReturnType<typeof createMockPrisma>['mocks'];

  beforeEach(() => {
    const { prisma, mocks: m } = createMockPrisma();
    mocks = m;
    service = new ImportService(prisma);
  });

  it('should import valid CSV rows using createMany for performance', async () => {
    mocks.certFindFirst.mockResolvedValue(null);
    mocks.certCreateMany.mockResolvedValue({ count: 2 });
    mocks.auditCreate.mockResolvedValue({ id: 'audit-summary' });

    const csv = [
      'cn,issuer,owner,environment',
      'api.example.com,CN=Test CA,teamA,prd',
      'web.example.com,CN=Test CA,teamB,dev',
    ].join('\n');

    const result = await service.executeCsvImport(csv, 'admin');

    expect(result.imported).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.batchId).toBeTruthy();
    expect(result.batchId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    // Verify createMany was used (bulk INSERT)
    expect(mocks.certCreateMany).toHaveBeenCalledTimes(1);
    expect(mocks.certCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ commonName: 'api.example.com' }),
        expect.objectContaining({ commonName: 'web.example.com' }),
      ]),
    });
  });

  it('should skip error rows and only import valid ones', async () => {
    mocks.certFindFirst.mockResolvedValue(null);
    mocks.certCreateMany.mockResolvedValue({ count: 1 });
    mocks.auditCreate.mockResolvedValue({ id: 'audit-summary' });

    const csv = [
      'cn,issuer,owner,environment',
      'valid.example.com,CN=Test CA,teamA,prd',
      ',,teamA,staging', // invalid
    ].join('\n');

    const result = await service.executeCsvImport(csv);

    expect(result.imported).toBe(1);
    expect(result.failed).toBeGreaterThanOrEqual(1);
  });

  it('should return empty result for CSV with header errors', async () => {
    const csv = ['sans,serial', 'foo,bar'].join('\n');

    const result = await service.executeCsvImport(csv);

    expect(result.imported).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('should generate a batch ID (UUID v4)', async () => {
    mocks.certFindFirst.mockResolvedValue(null);
    mocks.certCreateMany.mockResolvedValue({ count: 1 });
    mocks.auditCreate.mockResolvedValue({ id: 'audit-summary' });

    const csv = ['cn,issuer,owner,environment', 'api.example.com,CN=Test CA,teamA,prd'].join('\n');

    const result = await service.executeCsvImport(csv);

    expect(result.batchId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('should create a batch summary audit log', async () => {
    mocks.certFindFirst.mockResolvedValue(null);
    mocks.certCreateMany.mockResolvedValue({ count: 1 });
    mocks.auditCreate.mockResolvedValue({ id: 'audit-summary' });

    const csv = ['cn,issuer,owner,environment', 'api.example.com,CN=Test CA,teamA,prd'].join('\n');

    await service.executeCsvImport(csv, 'bulk-admin');

    // The last auditCreate call should be the batch summary
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CREATE',
        actor: 'bulk-admin',
        detail: expect.stringContaining('CSV bulk import complete'),
      }),
    });
  });

  it('should generate deterministic fingerprints for rows without one', async () => {
    mocks.certFindFirst.mockResolvedValue(null);
    mocks.certCreateMany.mockResolvedValue({ count: 2 });
    mocks.auditCreate.mockResolvedValue({ id: 'audit-summary' });

    const csv = [
      'cn,issuer,owner,environment',
      'a.example.com,CN=Test CA,teamA,dev',
      'b.example.com,CN=Test CA,teamB,prd',
    ].join('\n');

    await service.executeCsvImport(csv);

    const data = mocks.certCreateMany.mock.calls[0][0].data;
    // Both should have SHA-256 fingerprints (colon-separated hex)
    expect(data[0].fingerprintSha256).toMatch(/^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/);
    expect(data[1].fingerprintSha256).toMatch(/^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/);
    // They should be different
    expect(data[0].fingerprintSha256).not.toBe(data[1].fingerprintSha256);
  });
});
