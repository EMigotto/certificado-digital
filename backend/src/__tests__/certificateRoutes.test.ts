import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// ─── Mock Prisma client with vi.hoisted to avoid reference-before-init ──────

const {
  mockFindMany,
  mockFindUnique,
  mockCount,
  mockUpdate,
  mockCreateAuditEntry,
  mockTransaction,
} = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockFindUnique: vi.fn(),
  mockCount: vi.fn(),
  mockUpdate: vi.fn(),
  mockCreateAuditEntry: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock('../prismaClient.js', () => ({
  default: {
    certificate: {
      findMany: mockFindMany,
      findUnique: mockFindUnique,
      count: mockCount,
      update: mockUpdate,
    },
    auditEntry: {
      create: mockCreateAuditEntry,
    },
    $transaction: mockTransaction,
  },
}));

import { certificateRoutes } from '../routes/certificates.js';

// ─── Test helpers ────────────────────────────────────────────────────────────

const NOW = new Date();
const FUTURE = new Date(NOW.getTime() + 180 * 24 * 60 * 60 * 1000);
const PAST = new Date(NOW.getTime() - 90 * 24 * 60 * 60 * 1000);

function makePrismaCert(overrides: Record<string, unknown> = {}) {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    commonName: 'api.example.com',
    subjectDn: 'CN=api.example.com, O=Corp, C=BR',
    issuerDn: 'CN=Test CA, O=Test, C=BR',
    sans: ['api.example.com', 'www.example.com'],
    serialNumber: 'AA:BB:CC:DD',
    notBefore: PAST,
    notAfter: FUTURE,
    status: 'VALID',
    signatureAlgorithm: 'SHA256withRSA',
    keySize: 2048,
    fingerprintSha256: 'ab:cd:ef',
    fingerprintSha1: 'aa:bb:cc',
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
    description: 'Test',
    pemData: '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Certificate Routes', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = Fastify();
    await server.register(certificateRoutes);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  // ── GET /api/certificates ──────────────────────────────────────────────────

  describe('GET /api/certificates', () => {
    it('should return paginated list of certificates', async () => {
      const cert = makePrismaCert();
      mockTransaction.mockResolvedValue([[cert], 1]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/certificates',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data).toHaveLength(1);
      expect(body.total).toBe(1);
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(25);
      expect(body.totalPages).toBe(1);
      expect(body.data[0].commonName).toBe('api.example.com');
      expect(body.data[0].status).toBe('VALID');
      expect(body.data[0].daysUntilExpiry).toBeGreaterThan(0);
    });

    it('should accept pagination params', async () => {
      mockTransaction.mockResolvedValue([[], 0]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/certificates?page=2&pageSize=10',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.page).toBe(2);
      expect(body.pageSize).toBe(10);
    });

    it('should accept search query', async () => {
      mockTransaction.mockResolvedValue([[], 0]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/certificates?q=example',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should accept filter parameters', async () => {
      mockTransaction.mockResolvedValue([[], 0]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/certificates?environment=DEV,PRD&ca=DigiCert&status=VALID',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should accept sort parameters', async () => {
      mockTransaction.mockResolvedValue([[], 0]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/certificates?sort=commonName&sortDir=desc',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ── GET /api/certificates/:id ──────────────────────────────────────────────

  describe('GET /api/certificates/:id', () => {
    it('should return certificate detail with computed fields', async () => {
      const cert = makePrismaCert();
      mockFindUnique.mockResolvedValue(cert);

      const response = await server.inject({
        method: 'GET',
        url: '/api/certificates/550e8400-e29b-41d4-a716-446655440000',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(body.commonName).toBe('api.example.com');
      expect(body.status).toBe('VALID');
      expect(body.daysUntilExpiry).toBeGreaterThan(0);
    });

    it('should return 404 for non-existent certificate', async () => {
      mockFindUnique.mockResolvedValue(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/certificates/nonexistent-id',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('Not Found');
    });
  });

  // ── GET /api/certificates/:id/export/:format ──────────────────────────────

  describe('GET /api/certificates/:id/export/:format', () => {
    it('should export certificate as PEM', async () => {
      const cert = makePrismaCert();
      mockFindUnique.mockResolvedValue(cert);

      const response = await server.inject({
        method: 'GET',
        url: '/api/certificates/550e8400-e29b-41d4-a716-446655440000/export/pem',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('application/x-pem-file');
      expect(response.headers['content-disposition']).toContain('.pem');
      expect(response.payload).toContain('BEGIN CERTIFICATE');
    });

    it('should export certificate as JSON', async () => {
      const cert = makePrismaCert();
      mockFindUnique.mockResolvedValue(cert);

      const response = await server.inject({
        method: 'GET',
        url: '/api/certificates/550e8400-e29b-41d4-a716-446655440000/export/json',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.headers['content-disposition']).toContain('.json');
      const body = JSON.parse(response.payload);
      expect(body.commonName).toBe('api.example.com');
    });

    it('should return 400 for unsupported format', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/certificates/550e8400-e29b-41d4-a716-446655440000/export/csv',
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 404 when certificate not found', async () => {
      mockFindUnique.mockResolvedValue(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/certificates/nonexistent-id/export/pem',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ── DELETE /api/certificates/:id ───────────────────────────────────────────

  describe('DELETE /api/certificates/:id', () => {
    it('should soft-delete certificate and return revoked status', async () => {
      const cert = makePrismaCert();
      const revokedCert = makePrismaCert({ revoked: true });
      mockFindUnique.mockResolvedValue(cert);
      mockUpdate.mockResolvedValue(revokedCert);
      mockCreateAuditEntry.mockResolvedValue({});

      const response = await server.inject({
        method: 'DELETE',
        url: '/api/certificates/550e8400-e29b-41d4-a716-446655440000',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('REVOKED');
      expect(body.revoked).toBe(true);
    });

    it('should return 404 when certificate not found', async () => {
      mockFindUnique.mockResolvedValue(null);

      const response = await server.inject({
        method: 'DELETE',
        url: '/api/certificates/nonexistent-id',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ── GET /api/meta/filters ──────────────────────────────────────────────────

  describe('GET /api/meta/filters', () => {
    it('should return filter metadata', async () => {
      // Mock all distinct queries
      mockFindMany
        .mockResolvedValueOnce([{ environment: 'DEV' }, { environment: 'PRD' }]) // environments
        .mockResolvedValueOnce([{ caName: 'DigiCert' }]) // caNames
        .mockResolvedValueOnce([{ owner: 'teamA' }]) // owners
        .mockResolvedValueOnce([{ signatureAlgorithm: 'SHA256withRSA' }]) // algorithms
        .mockResolvedValueOnce([{ tags: { team: 'platform' } }]); // tags

      const response = await server.inject({
        method: 'GET',
        url: '/api/meta/filters',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.environments).toEqual(['DEV', 'PRD']);
      expect(body.caNames).toEqual(['DigiCert']);
      expect(body.statuses).toEqual(['VALID', 'EXPIRING_SOON', 'EXPIRED', 'REVOKED']);
      expect(body.owners).toEqual(['teamA']);
      expect(body.algorithms).toEqual(['SHA256withRSA']);
      expect(body.tagKeys).toEqual(['team']);
    });
  });
});
