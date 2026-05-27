import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CertificateService,
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
    sans: ['test.example.com', 'www.example.com'],
    serial: 'AABBCCDD',
    issuer: 'CN=Test CA',
    notBefore: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
    notAfter: new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000),
    algorithm: 'RSA-2048',
    fingerprintSha256: 'ab:cd:ef:12:34:56',
    owner: 'teamA',
    application: 'api-gateway',
    environment: 'prd',
    zone: 'us-east-1',
    caProvider: 'DigiCert',
    revoked: false,
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
    softDelete: vi.fn(),
    createAuditLog: vi.fn(),
    getDistinctEnvironments: vi.fn(),
    getDistinctCaProviders: vi.fn(),
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
  it('should return "revoked" when cert is revoked', () => {
    expect(computeStatus({ revoked: true, notAfter: new Date(Date.now() + 999999999) })).toBe(
      'revoked',
    );
  });

  it('should return "expired" when notAfter is in the past', () => {
    expect(computeStatus({ revoked: false, notAfter: new Date(Date.now() - 1000) })).toBe(
      'expired',
    );
  });

  it('should return "expiring" when notAfter is within 30 days', () => {
    const in15Days = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    expect(computeStatus({ revoked: false, notAfter: in15Days })).toBe('expiring');
  });

  it('should return "active" when notAfter is more than 30 days away', () => {
    const in60Days = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    expect(computeStatus({ revoked: false, notAfter: in60Days })).toBe('active');
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
    expect(result.status).toBe('active');
    expect(result.daysUntilExpiry).toBeGreaterThan(0);
    expect(typeof result.notBefore).toBe('string');
    expect(typeof result.notAfter).toBe('string');
    expect(typeof result.createdAt).toBe('string');
    expect(typeof result.updatedAt).toBe('string');
  });

  it('should map revoked cert correctly', () => {
    const cert = makeCert({ revoked: true });
    const result = mapToApiCertificate(cert);
    expect(result.status).toBe('revoked');
  });

  it('should handle null tags/customFields gracefully', () => {
    const cert = makeCert({ tags: null as unknown as object, customFields: null as unknown as object });
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
        environment: 'dev,prd',
        ca: 'DigiCert,LetsEncrypt',
        status: 'active,expiring',
      });

      const call = mocks.findMany.mock.calls[0];
      const filters = call[0];
      expect(filters.environment).toEqual(['dev', 'prd']);
      expect(filters.ca).toEqual(['DigiCert', 'LetsEncrypt']);
      expect(filters.status).toEqual(['active', 'expiring']);
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
      expect(result!.status).toBe('active');
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
    it('should soft-delete and create audit log', async () => {
      const cert = makeCert();
      const revokedCert = makeCert({ revoked: true });
      mocks.findById.mockResolvedValue(cert);
      mocks.softDelete.mockResolvedValue(revokedCert);
      mocks.createAuditLog.mockResolvedValue(undefined);

      const result = await service.deleteCertificate('cert-001', 'admin');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('revoked');
      expect(mocks.softDelete).toHaveBeenCalledWith('cert-001');
      expect(mocks.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          certId: 'cert-001',
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
      mocks.getDistinctEnvironments.mockResolvedValue(['dev', 'prd']);
      mocks.getDistinctCaProviders.mockResolvedValue(['DigiCert', 'LetsEncrypt']);
      mocks.getDistinctOwners.mockResolvedValue(['teamA', 'teamB']);
      mocks.getDistinctAlgorithms.mockResolvedValue(['RSA-2048', 'ECDSA-256']);
      mocks.getDistinctTagKeys.mockResolvedValue(['team', 'env']);

      const result = await service.getFilterMeta();

      expect(result.environments).toEqual(['dev', 'prd']);
      expect(result.caProviders).toEqual(['DigiCert', 'LetsEncrypt']);
      expect(result.statuses).toEqual(['active', 'expiring', 'expired', 'revoked']);
      expect(result.owners).toEqual(['teamA', 'teamB']);
      expect(result.algorithms).toEqual(['RSA-2048', 'ECDSA-256']);
      expect(result.tagKeys).toEqual(['team', 'env']);
    });
  });
});
