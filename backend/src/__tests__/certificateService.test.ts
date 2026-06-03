import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CertificateService,
  CertificateValidationError,
  CertificateDuplicateError,
  CertificateNotFoundError,
  CertificateImmutableFieldError,
  computeStatus,
  computeDaysUntilExpiry,
  mapToApiCertificate,
} from '../services/certificateService.js';
import type { CertificateRepository } from '../repositories/certificateRepo.js';
import type { Certificate } from '@prisma/client';

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeCert(overrides: Partial<Certificate> = {}): Certificate {
  const now = new Date();
  return {
    id: 'cert-001',
    commonName: 'test.example.com',
    subjectDn: 'CN=test.example.com, O=Corp, C=BR',
    issuerDn: 'CN=Test CA, O=Test, C=BR',
    sans: ['test.example.com', 'www.example.com'],
    serialNumber: 'AABBCCDD',
    notBefore: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
    notAfter: new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000),
    status: 'VALID',
    signatureAlgorithm: 'SHA256withRSA',
    keySize: 2048,
    fingerprintSha256: 'AB:CD:EF:12:34:56',
    fingerprintSha1: 'AA:BB:CC:DD:EE',
    owner: 'teamA',
    team: 'Platform Engineering',
    application: 'api-gateway',
    environment: 'PRD',
    zone: 'us-east-1',
    caName: 'DigiCert',
    caProvider: 'DigiCert CertCentral',
    importSource: 'MANUAL',
    sourceFile: null,
    revoked: false,
    revokedAt: null,
    revocationReason: null,
    tags: { team: 'platform' },
    customFields: {},
    description: 'Test cert',
    pemData: '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeMockRepo(): {
  repo: CertificateRepository;
  mocks: Record<string, ReturnType<typeof vi.fn>>;
} {
  const mocks = {
    findMany: vi.fn(),
    findById: vi.fn(),
    findByFingerprint: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    createAuditEntry: vi.fn(),
    getDistinctEnvironments: vi.fn(),
    getDistinctCaNames: vi.fn(),
    getDistinctOwners: vi.fn(),
    getDistinctAlgorithms: vi.fn(),
    getDistinctTagKeys: vi.fn(),
    buildWhereClause: vi.fn(),
    buildOrderBy: vi.fn(),
  };

  return {
    repo: mocks as unknown as CertificateRepository,
    mocks,
  };
}

// ─── Unit tests: helper functions ────────────────────────────────────────────

describe('computeStatus', () => {
  it('should return "REVOKED" when cert is revoked', () => {
    expect(computeStatus({ revoked: true, notAfter: new Date(Date.now() + 999999999) })).toBe(
      'REVOKED',
    );
  });

  it('should return "EXPIRED" when notAfter is in the past', () => {
    expect(computeStatus({ revoked: false, notAfter: new Date(Date.now() - 1000) })).toBe(
      'EXPIRED',
    );
  });

  it('should return "EXPIRING_SOON" when notAfter is within 30 days', () => {
    const in15Days = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    expect(computeStatus({ revoked: false, notAfter: in15Days })).toBe('EXPIRING_SOON');
  });

  it('should return "VALID" when notAfter is more than 30 days away', () => {
    const in60Days = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    expect(computeStatus({ revoked: false, notAfter: in60Days })).toBe('VALID');
  });
});

describe('computeDaysUntilExpiry', () => {
  it('should return positive for future dates', () => {
    const in10Days = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const days = computeDaysUntilExpiry(in10Days);
    expect(days).toBeGreaterThanOrEqual(9);
    expect(days).toBeLessThanOrEqual(11);
  });

  it('should return negative for past dates', () => {
    const ago5Days = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const days = computeDaysUntilExpiry(ago5Days);
    expect(days).toBeLessThanOrEqual(-4);
    expect(days).toBeGreaterThanOrEqual(-6);
  });
});

describe('mapToApiCertificate', () => {
  it('should map Prisma cert to API cert with computed fields', () => {
    const cert = makeCert();
    const result = mapToApiCertificate(cert);

    expect(result.id).toBe('cert-001');
    expect(result.commonName).toBe('test.example.com');
    expect(result.sans).toEqual(['test.example.com', 'www.example.com']);
    expect(result.status).toBe('VALID');
    expect(result.daysUntilExpiry).toBeGreaterThan(0);
    expect(typeof result.notBefore).toBe('string');
    expect(typeof result.notAfter).toBe('string');
    expect(typeof result.createdAt).toBe('string');
    expect(typeof result.updatedAt).toBe('string');
    // New fields
    expect(result.serialNumber).toBe('AABBCCDD');
    expect(result.signatureAlgorithm).toBe('SHA256withRSA');
    expect(result.caName).toBe('DigiCert');
    expect(result.environment).toBe('PRD');
  });

  it('should map revoked cert correctly', () => {
    const cert = makeCert({ revoked: true });
    const result = mapToApiCertificate(cert);
    expect(result.status).toBe('REVOKED');
  });

  it('should handle null tags/customFields gracefully', () => {
    const cert = makeCert({
      tags: null as unknown as object,
      customFields: null as unknown as object,
    });
    const result = mapToApiCertificate(cert);
    expect(result.tags).toEqual({});
    expect(result.customFields).toEqual({});
  });
});

// ─── Unit tests: CertificateService ──────────────────────────────────────────

describe('CertificateService', () => {
  let service: CertificateService;
  let mocks: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    const mockRepo = makeMockRepo();
    service = new CertificateService(mockRepo.repo);
    mocks = mockRepo.mocks;
  });

  describe('listCertificates', () => {
    it('should return paginated response with defaults', async () => {
      const certs = [makeCert()];
      mocks.findMany.mockResolvedValue({ data: certs, total: 1 });

      const result = await service.listCertificates({});

      expect(mocks.findMany).toHaveBeenCalledTimes(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(25);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].commonName).toBe('test.example.com');
    });

    it('should pass pagination params correctly', async () => {
      mocks.findMany.mockResolvedValue({ data: [], total: 0 });

      await service.listCertificates({ page: '2', pageSize: '10' });

      const call = mocks.findMany.mock.calls[0];
      expect(call[1]).toEqual({ page: 2, pageSize: 10, skip: 10, take: 10 });
    });

    it('should pass sort params correctly', async () => {
      mocks.findMany.mockResolvedValue({ data: [], total: 0 });

      await service.listCertificates({ sort: 'commonName', sortDir: 'desc' });

      const call = mocks.findMany.mock.calls[0];
      expect(call[2]).toEqual({ sort: 'commonName', sortDir: 'desc' });
    });

    it('should default sort to notAfter ASC', async () => {
      mocks.findMany.mockResolvedValue({ data: [], total: 0 });

      await service.listCertificates({});

      const call = mocks.findMany.mock.calls[0];
      expect(call[2]).toEqual({ sort: 'notAfter', sortDir: 'asc' });
    });

    it('should parse comma-separated filter values', async () => {
      mocks.findMany.mockResolvedValue({ data: [], total: 0 });

      await service.listCertificates({
        environment: 'DEV,PRD',
        ca: 'DigiCert,LetsEncrypt',
        status: 'VALID,EXPIRING_SOON',
      });

      const call = mocks.findMany.mock.calls[0];
      const filters = call[0];
      expect(filters.environment).toEqual(['DEV', 'PRD']);
      expect(filters.ca).toEqual(['DigiCert', 'LetsEncrypt']);
      expect(filters.status).toEqual(['VALID', 'EXPIRING_SOON']);
    });

    it('should parse tags filter correctly', async () => {
      mocks.findMany.mockResolvedValue({ data: [], total: 0 });

      await service.listCertificates({ tags: 'team:platform,env:prod' });

      const call = mocks.findMany.mock.calls[0];
      expect(call[0].tags).toEqual({ team: 'platform', env: 'prod' });
    });
  });

  describe('getCertificate', () => {
    it('should return mapped certificate with computed fields', async () => {
      const cert = makeCert();
      mocks.findById.mockResolvedValue(cert);

      const result = await service.getCertificate('cert-001');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('cert-001');
      expect(result!.status).toBe('VALID');
      expect(result!.daysUntilExpiry).toBeGreaterThan(0);
    });

    it('should return null when certificate not found', async () => {
      mocks.findById.mockResolvedValue(null);

      const result = await service.getCertificate('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('exportCertificate', () => {
    it('should export PEM with correct content-type', async () => {
      const cert = makeCert();
      mocks.findById.mockResolvedValue(cert);

      const result = await service.exportCertificate('cert-001', 'pem');

      expect(result).not.toBeNull();
      expect(result!.contentType).toBe('application/x-pem-file');
      expect(result!.filename).toContain('.pem');
      expect(result!.body).toContain('BEGIN CERTIFICATE');
    });

    it('should export JSON with correct content-type', async () => {
      const cert = makeCert();
      mocks.findById.mockResolvedValue(cert);

      const result = await service.exportCertificate('cert-001', 'json');

      expect(result).not.toBeNull();
      expect(result!.contentType).toBe('application/json');
      expect(result!.filename).toContain('.json');
      const parsed = JSON.parse(result!.body);
      expect(parsed.commonName).toBe('test.example.com');
    });

    it('should handle cert without PEM data', async () => {
      const cert = makeCert({ pemData: null });
      mocks.findById.mockResolvedValue(cert);

      const result = await service.exportCertificate('cert-001', 'pem');

      expect(result).not.toBeNull();
      expect(result!.body).toContain('No PEM data available');
    });

    it('should return null for unsupported format', async () => {
      const cert = makeCert();
      mocks.findById.mockResolvedValue(cert);

      const result = await service.exportCertificate('cert-001', 'csv');

      expect(result).toBeNull();
    });

    it('should return null when certificate not found', async () => {
      mocks.findById.mockResolvedValue(null);

      const result = await service.exportCertificate('nonexistent', 'pem');

      expect(result).toBeNull();
    });
  });

  describe('deleteCertificate', () => {
    it('should soft-delete and create audit entry', async () => {
      const cert = makeCert();
      const revokedCert = makeCert({ revoked: true });
      mocks.findById.mockResolvedValue(cert);
      mocks.softDelete.mockResolvedValue(revokedCert);
      mocks.createAuditEntry.mockResolvedValue(undefined);

      const result = await service.deleteCertificate('cert-001', 'admin');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('REVOKED');
      expect(mocks.softDelete).toHaveBeenCalledWith('cert-001');
      expect(mocks.createAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          certificateId: 'cert-001',
          action: 'REVOKE',
          actor: 'admin',
          result: 'SUCCESS',
        }),
      );
    });

    it('should return null when certificate not found', async () => {
      mocks.findById.mockResolvedValue(null);

      const result = await service.deleteCertificate('nonexistent');

      expect(result).toBeNull();
      expect(mocks.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('getFilterMeta', () => {
    it('should return aggregated filter metadata', async () => {
      mocks.getDistinctEnvironments.mockResolvedValue(['DEV', 'PRD']);
      mocks.getDistinctCaNames.mockResolvedValue(['DigiCert', 'LetsEncrypt']);
      mocks.getDistinctOwners.mockResolvedValue(['teamA', 'teamB']);
      mocks.getDistinctAlgorithms.mockResolvedValue(['SHA256withRSA', 'SHA256withECDSA']);
      mocks.getDistinctTagKeys.mockResolvedValue(['team', 'env']);

      const result = await service.getFilterMeta();

      expect(result.environments).toEqual(['DEV', 'PRD']);
      expect(result.caNames).toEqual(['DigiCert', 'LetsEncrypt']);
      expect(result.statuses).toEqual(['VALID', 'EXPIRING_SOON', 'EXPIRED', 'REVOKED']);
      expect(result.owners).toEqual(['teamA', 'teamB']);
      expect(result.algorithms).toEqual(['SHA256withRSA', 'SHA256withECDSA']);
      expect(result.tagKeys).toEqual(['team', 'env']);
    });
  });

  // ── createCertificate ──────────────────────────────────────────────────────

  describe('createCertificate', () => {
    const validPayload = {
      commonName: 'new.example.com',
      serialNumber: 'FF:EE:DD:CC',
      notBefore: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      notAfter: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
      signatureAlgorithm: 'SHA256withRSA',
      fingerprintSha256: 'new:fp:hash',
      owner: 'teamX',
      application: 'my-app',
      environment: 'DEV',
    };

    it('should create a certificate and return mapped result', async () => {
      mocks.findByFingerprint.mockResolvedValue(null);
      mocks.create.mockResolvedValue(makeCert({
        commonName: 'new.example.com',
        importSource: 'API_SYNC',
      }));
      mocks.createAuditEntry.mockResolvedValue(undefined);

      const result = await service.createCertificate(validPayload, 'admin');

      expect(result.commonName).toBe('new.example.com');
      expect(mocks.create).toHaveBeenCalledTimes(1);
      expect(mocks.createAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          actor: 'admin',
          result: 'SUCCESS',
        }),
      );
    });

    it('should set importSource to API_SYNC', async () => {
      mocks.findByFingerprint.mockResolvedValue(null);
      mocks.create.mockResolvedValue(makeCert({ importSource: 'API_SYNC' }));
      mocks.createAuditEntry.mockResolvedValue(undefined);

      await service.createCertificate(validPayload);

      const createCall = mocks.create.mock.calls[0][0];
      expect(createCall.importSource).toBe('API_SYNC');
    });

    it('should throw CertificateValidationError when commonName is missing', async () => {
      const payload = { ...validPayload, commonName: '' };

      await expect(service.createCertificate(payload)).rejects.toThrow(
        CertificateValidationError,
      );
    });

    it('should throw CertificateValidationError for invalid environment', async () => {
      const payload = { ...validPayload, environment: 'STAGING' };

      await expect(service.createCertificate(payload)).rejects.toThrow(
        CertificateValidationError,
      );
    });

    it('should throw CertificateValidationError when notAfter is before notBefore', async () => {
      const payload = {
        ...validPayload,
        notBefore: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        notAfter: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      };

      await expect(service.createCertificate(payload)).rejects.toThrow(
        CertificateValidationError,
      );
    });

    it('should throw CertificateDuplicateError for duplicate fingerprint', async () => {
      mocks.findByFingerprint.mockResolvedValue(makeCert());

      await expect(service.createCertificate(validPayload)).rejects.toThrow(
        CertificateDuplicateError,
      );
    });
  });

  // ── updateCertificate ──────────────────────────────────────────────────────

  describe('updateCertificate', () => {
    it('should update mutable fields and return mapped result', async () => {
      const cert = makeCert();
      mocks.findById.mockResolvedValue(cert);
      mocks.update.mockResolvedValue(makeCert({ owner: 'teamZ', description: 'Updated' }));
      mocks.createAuditEntry.mockResolvedValue(undefined);

      const result = await service.updateCertificate(
        'cert-001',
        { owner: 'teamZ', description: 'Updated' },
        'admin',
      );

      expect(result.owner).toBe('teamZ');
      expect(result.description).toBe('Updated');
      expect(mocks.update).toHaveBeenCalledTimes(1);
      expect(mocks.createAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          actor: 'admin',
          result: 'SUCCESS',
        }),
      );
    });

    it('should record field-level changes in audit entry', async () => {
      const cert = makeCert({ owner: 'teamA' });
      mocks.findById.mockResolvedValue(cert);
      mocks.update.mockResolvedValue(makeCert({ owner: 'teamB' }));
      mocks.createAuditEntry.mockResolvedValue(undefined);

      await service.updateCertificate('cert-001', { owner: 'teamB' }, 'admin');

      const auditCall = mocks.createAuditEntry.mock.calls[0][0];
      expect(auditCall.changes).toEqual({
        owner: { old: 'teamA', new: 'teamB' },
      });
      expect(auditCall.detail).toContain('owner');
    });

    it('should throw CertificateNotFoundError for non-existent certificate', async () => {
      mocks.findById.mockResolvedValue(null);

      await expect(
        service.updateCertificate('nonexistent', { owner: 'teamX' }),
      ).rejects.toThrow(CertificateNotFoundError);
    });

    it('should throw CertificateImmutableFieldError when trying to update immutable fields', async () => {
      const cert = makeCert();
      mocks.findById.mockResolvedValue(cert);

      await expect(
        service.updateCertificate('cert-001', {
          commonName: 'changed.example.com',
        } as Record<string, unknown>),
      ).rejects.toThrow(CertificateImmutableFieldError);
    });

    it('should throw CertificateValidationError for invalid environment on update', async () => {
      const cert = makeCert();
      mocks.findById.mockResolvedValue(cert);

      await expect(
        service.updateCertificate('cert-001', { environment: 'INVALID' }),
      ).rejects.toThrow(CertificateValidationError);
    });

    it('should update tags correctly', async () => {
      const cert = makeCert({ tags: { env: 'dev' } });
      mocks.findById.mockResolvedValue(cert);
      mocks.update.mockResolvedValue(makeCert({ tags: { env: 'prod', tier: 'critical' } }));
      mocks.createAuditEntry.mockResolvedValue(undefined);

      const result = await service.updateCertificate(
        'cert-001',
        { tags: { env: 'prod', tier: 'critical' } },
      );

      expect(result.tags).toEqual({ env: 'prod', tier: 'critical' });
    });
  });

  // ── listCertificates (enhanced query params) ───────────────────────────────

  describe('listCertificates (enhanced)', () => {
    it('should use limit as alias for pageSize', async () => {
      mocks.findMany.mockResolvedValue({ data: [], total: 0 });

      const result = await service.listCertificates({ limit: '5' });

      expect(result.pageSize).toBe(5);
      const call = mocks.findMany.mock.calls[0];
      expect(call[1].take).toBe(5);
    });

    it('should parse sort with - prefix as descending', async () => {
      mocks.findMany.mockResolvedValue({ data: [], total: 0 });

      await service.listCertificates({ sort: '-notAfter' });

      const call = mocks.findMany.mock.calls[0];
      expect(call[2]).toEqual({ sort: 'notAfter', sortDir: 'desc' });
    });

    it('should accept filter[status] bracket syntax', async () => {
      mocks.findMany.mockResolvedValue({ data: [], total: 0 });

      await service.listCertificates({ 'filter[status]': 'VALID,EXPIRED' });

      const call = mocks.findMany.mock.calls[0];
      expect(call[0].status).toEqual(['VALID', 'EXPIRED']);
    });

    it('should accept filter[environment] bracket syntax', async () => {
      mocks.findMany.mockResolvedValue({ data: [], total: 0 });

      await service.listCertificates({ 'filter[environment]': 'PRD' });

      const call = mocks.findMany.mock.calls[0];
      expect(call[0].environment).toEqual(['PRD']);
    });

    it('should prefer filter[status] over status param', async () => {
      mocks.findMany.mockResolvedValue({ data: [], total: 0 });

      await service.listCertificates({
        status: 'REVOKED',
        'filter[status]': 'VALID',
      });

      const call = mocks.findMany.mock.calls[0];
      expect(call[0].status).toEqual(['VALID']);
    });
  });
});
