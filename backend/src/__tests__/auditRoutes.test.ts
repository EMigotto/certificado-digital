import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

/**
 * Audit routes integration-style tests.
 *
 * We mock Prisma with vi.hoisted to avoid reference-before-init
 * (vi.mock is hoisted above variable declarations).
 */

// ─── Mock Prisma client with vi.hoisted ─────────────────────────────────────

const {
  mockAuditFindMany,
  mockAuditCount,
  mockAuditCreate,
  mockTransaction,
} = vi.hoisted(() => ({
  mockAuditFindMany: vi.fn(),
  mockAuditCount: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock('../prismaClient.js', () => ({
  default: {
    auditEntry: {
      findMany: mockAuditFindMany,
      count: mockAuditCount,
      create: mockAuditCreate,
    },
    $transaction: mockTransaction,
  },
}));

import { auditRoutes } from '../routes/audit.js';

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeAuditLogRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'audit-001',
    certificateId: 'cert-001',
    certCn: 'test.example.com',
    action: 'CREATE',
    actor: 'admin',
    result: 'SUCCESS',
    detail: 'Certificate imported from file: cert.pem',
    timestamp: new Date('2025-01-15T10:30:00.000Z'),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Audit Routes', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = Fastify();
    await server.register(auditRoutes);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  // ── GET /api/audit ──────────────────────────────────────────────────────

  describe('GET /api/audit', () => {
    it('should return paginated audit entries with defaults', async () => {
      const entries = [makeAuditLogRow()];
      mockTransaction.mockResolvedValue([entries, 1]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/audit',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(25);
      expect(body.total).toBe(1);
      expect(body.totalPages).toBe(1);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe('audit-001');
      expect(body.data[0].action).toBe('CREATE');
      expect(body.data[0].actor).toBe('admin');
      expect(body.data[0].result).toBe('SUCCESS');
      expect(body.data[0].timestamp).toBe('2025-01-15T10:30:00.000Z');
    });

    it('should accept pagination query params', async () => {
      mockTransaction.mockResolvedValue([[], 0]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/audit?page=2&pageSize=5',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.page).toBe(2);
      expect(body.pageSize).toBe(5);
    });

    it('should accept action filter query param', async () => {
      const entries = [makeAuditLogRow({ action: 'DELETE' })];
      mockTransaction.mockResolvedValue([entries, 1]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/audit?action=DELETE',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].action).toBe('DELETE');
    });

    it('should accept result filter query param', async () => {
      const entries = [makeAuditLogRow({ result: 'FAILURE' })];
      mockTransaction.mockResolvedValue([entries, 1]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/audit?result=FAILURE',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data[0].result).toBe('FAILURE');
    });

    it('should accept actor filter query param', async () => {
      const entries = [makeAuditLogRow({ actor: 'admin' })];
      mockTransaction.mockResolvedValue([entries, 1]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/audit?actor=admin',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data).toHaveLength(1);
    });

    it('should accept date range filters', async () => {
      mockTransaction.mockResolvedValue([[], 0]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/audit?dateFrom=2025-01-01&dateTo=2025-12-31',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data).toEqual([]);
    });

    it('should accept certificateId filter', async () => {
      const entries = [makeAuditLogRow()];
      mockTransaction.mockResolvedValue([entries, 1]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/audit?certificateId=cert-001',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data).toHaveLength(1);
    });

    it('should accept batchId filter', async () => {
      const entries = [makeAuditLogRow({ detail: 'batch: abc-123' })];
      mockTransaction.mockResolvedValue([entries, 1]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/audit?batchId=abc-123',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data).toHaveLength(1);
    });

    it('should return empty result when no entries match', async () => {
      mockTransaction.mockResolvedValue([[], 0]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/audit?action=REVOKE',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('should combine multiple filters', async () => {
      mockTransaction.mockResolvedValue([[], 0]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/audit?action=CREATE&actor=admin&result=SUCCESS&dateFrom=2025-01-01',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ── GET /api/audit/batch/:batchId ────────────────────────────────────────

  describe('GET /api/audit/batch/:batchId', () => {
    it('should return all entries for a batch ID', async () => {
      const entries = [
        makeAuditLogRow({ id: 'a-1', detail: 'batch: 550e8400-e29b-41d4-a716-446655440000' }),
        makeAuditLogRow({ id: 'a-2', detail: 'batch: 550e8400-e29b-41d4-a716-446655440000' }),
      ];
      mockAuditFindMany.mockResolvedValue(entries);

      const response = await server.inject({
        method: 'GET',
        url: '/api/audit/batch/550e8400-e29b-41d4-a716-446655440000',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data).toHaveLength(2);
      expect(body.total).toBe(2);
    });

    it('should return empty array when no entries match batch', async () => {
      mockAuditFindMany.mockResolvedValue([]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/audit/batch/00000000-0000-0000-0000-000000000000',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data).toEqual([]);
      expect(body.total).toBe(0);
    });
  });

  // ── Immutability — no mutation routes ─────────────────────────────────

  describe('Immutability — no mutation routes exposed', () => {
    it('should NOT expose POST /api/audit', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/audit',
        payload: { action: 'CREATE' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should NOT expose PUT /api/audit/:id', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: '/api/audit/audit-001',
        payload: { detail: 'modified' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should NOT expose PATCH /api/audit/:id', async () => {
      const response = await server.inject({
        method: 'PATCH',
        url: '/api/audit/audit-001',
        payload: { detail: 'modified' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should NOT expose DELETE /api/audit/:id', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: '/api/audit/audit-001',
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
