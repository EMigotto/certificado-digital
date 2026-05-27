import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// ─── Mock Prisma client (using vi.hoisted to avoid hoisting issues) ─────────

const { mockFindMany, mockCount, mockTransaction, mockCreate } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockCount: vi.fn(),
  mockTransaction: vi.fn(),
  mockCreate: vi.fn(),
}));

vi.mock('../prismaClient.js', () => ({
  default: {
    auditLog: {
      findMany: mockFindMany,
      count: mockCount,
      create: mockCreate,
    },
    $transaction: mockTransaction,
  },
}));

import { auditRoutes } from '../routes/audit.js';

// ─── Test helpers ───────────────────────────────────────────────────────────

function makeAuditLogRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'audit-001',
    certId: 'cert-001',
    certCn: 'test.example.com',
    action: 'CREATE',
    actor: 'admin',
    result: 'SUCCESS',
    detail: 'Certificate imported',
    batchId: null,
    timestamp: new Date('2025-06-01T12:00:00.000Z'),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Audit Routes', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = Fastify({ logger: false });
    await server.register(auditRoutes);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    vi.clearAllMocks();
  });

  // ── GET /api/audit ────────────────────────────────────────────────────────

  describe('GET /api/audit', () => {
    it('should return paginated audit entries', async () => {
      const entries = [makeAuditLogRow()];
      mockTransaction.mockResolvedValue([entries, 1]);

      const res = await server.inject({
        method: 'GET',
        url: '/api/audit',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data).toHaveLength(1);
      expect(body.total).toBe(1);
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(25);
      expect(body.totalPages).toBe(1);
      expect(body.data[0].certCn).toBe('test.example.com');
      expect(body.data[0].timestamp).toBe('2025-06-01T12:00:00.000Z');
      expect(body.data[0].batchId).toBeNull();
    });

    it('should accept pagination parameters', async () => {
      mockTransaction.mockResolvedValue([[], 0]);

      const res = await server.inject({
        method: 'GET',
        url: '/api/audit?page=2&pageSize=10',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.page).toBe(2);
      expect(body.pageSize).toBe(10);
    });

    it('should accept filter parameters', async () => {
      mockTransaction.mockResolvedValue([[], 0]);

      const res = await server.inject({
        method: 'GET',
        url: '/api/audit?action=CREATE&actor=admin&result=SUCCESS',
      });

      expect(res.statusCode).toBe(200);
    });

    it('should accept date range filters', async () => {
      mockTransaction.mockResolvedValue([[], 0]);

      const res = await server.inject({
        method: 'GET',
        url: '/api/audit?dateFrom=2025-01-01&dateTo=2025-06-30',
      });

      expect(res.statusCode).toBe(200);
    });

    it('should accept batchId filter', async () => {
      const entries = [
        makeAuditLogRow({ batchId: 'batch-123' }),
        makeAuditLogRow({ id: 'audit-002', batchId: 'batch-123' }),
      ];
      mockTransaction.mockResolvedValue([entries, 2]);

      const res = await server.inject({
        method: 'GET',
        url: '/api/audit?batchId=batch-123',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.total).toBe(2);
    });

    it('should accept certificateId filter', async () => {
      mockTransaction.mockResolvedValue([[], 0]);

      const res = await server.inject({
        method: 'GET',
        url: '/api/audit?certificateId=cert-001',
      });

      expect(res.statusCode).toBe(200);
    });

    it('should return empty list when no entries', async () => {
      mockTransaction.mockResolvedValue([[], 0]);

      const res = await server.inject({
        method: 'GET',
        url: '/api/audit',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data).toHaveLength(0);
      expect(body.total).toBe(0);
    });

    it('should include batchId in response entries', async () => {
      const entries = [makeAuditLogRow({ batchId: 'some-batch' })];
      mockTransaction.mockResolvedValue([entries, 1]);

      const res = await server.inject({
        method: 'GET',
        url: '/api/audit',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data[0].batchId).toBe('some-batch');
    });
  });

  // ── GET /api/audit/batch/:batchId ─────────────────────────────────────────

  describe('GET /api/audit/batch/:batchId', () => {
    it('should return all entries for a valid batch ID', async () => {
      const batchId = '550e8400-e29b-41d4-a716-446655440000';
      const entries = [
        makeAuditLogRow({ batchId }),
        makeAuditLogRow({ id: 'audit-002', batchId }),
      ];
      mockFindMany.mockResolvedValue(entries);

      const res = await server.inject({
        method: 'GET',
        url: `/api/audit/batch/${batchId}`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data).toHaveLength(2);
      expect(body.batchId).toBe(batchId);
      expect(body.total).toBe(2);
    });

    it('should return 400 for invalid batch ID format', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/audit/batch/not-a-uuid',
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe('Bad Request');
      expect(body.message).toContain('Invalid batch ID');
    });

    it('should return empty data for nonexistent batch ID', async () => {
      const batchId = '550e8400-e29b-41d4-a716-446655440099';
      mockFindMany.mockResolvedValue([]);

      const res = await server.inject({
        method: 'GET',
        url: `/api/audit/batch/${batchId}`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data).toHaveLength(0);
      expect(body.total).toBe(0);
    });
  });

  // ── Immutability: No mutation routes ──────────────────────────────────────

  describe('Immutability', () => {
    it('should not expose POST /api/audit', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/audit',
        payload: {},
      });
      expect(res.statusCode).toBe(404);
    });

    it('should not expose PUT /api/audit/:id', async () => {
      const res = await server.inject({
        method: 'PUT',
        url: '/api/audit/audit-001',
        payload: {},
      });
      expect(res.statusCode).toBe(404);
    });

    it('should not expose PATCH /api/audit/:id', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: '/api/audit/audit-001',
        payload: {},
      });
      expect(res.statusCode).toBe(404);
    });

    it('should not expose DELETE /api/audit/:id', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: '/api/audit/audit-001',
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
