/**
 * C6 — Trilha de Auditoria: Testes QA das rotas de auditoria (backend)
 *
 * Mapeia cenários dos critérios de aceite:
 *   - F1.3: Impedir UPDATE de evento (rota inexistente → 404)
 *   - F1.4: Impedir DELETE de evento (rota inexistente → 404)
 *   - F3.1: Filtro por resource_id (certificateId)
 *   - F3.2: Filtro por período (dateFrom/dateTo)
 *   - F3.3: Filtro por usuário (actor)
 *   - F3.4: Filtro por ação (action)
 *   - F3.5: Filtro por status (result)
 *   - F3.7: Paginação
 *   - F3.9: Detalhe de batch
 *   - F3.11: Parâmetros inválidos (batch ID inválido → 400)
 *   - F11.2: Auditor lê auditoria
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// ─── Mocks Prisma ──────────────────────────────────────────────────────────

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

vi.mock('../../prismaClient.js', () => ({
  default: {
    auditEntry: {
      findMany: mockAuditFindMany,
      count: mockAuditCount,
      create: mockAuditCreate,
    },
    $transaction: mockTransaction,
  },
}));

import { auditRoutes } from '../../routes/audit.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeAuditLogRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'audit-001',
    certificateId: 'cert-001',
    certCn: 'test.example.com',
    action: 'CREATE',
    actor: 'admin',
    result: 'SUCCESS',
    detail: 'Certificate imported from file: cert.pem',
    changes: null,
    batchId: null,
    timestamp: new Date('2025-01-15T10:30:00.000Z'),
    ...overrides,
  };
}

// ─── Testes ─────────────────────────────────────────────────────────────────

describe('C6 — Rotas de Auditoria', () => {
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

  // ── GET /api/audit ─────────────────────────────────────────────────────

  describe('GET /api/audit — consulta paginada', () => {
    it('C6-F3.7: deve retornar resposta paginada com defaults', async () => {
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
    });

    it('C6-F3.7: deve aceitar query params de paginação', async () => {
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

    it('C6-F3.1: deve aceitar filtro por certificateId', async () => {
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

    it('C6-F3.2: deve aceitar filtros de período (dateFrom/dateTo)', async () => {
      mockTransaction.mockResolvedValue([[], 0]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/audit?dateFrom=2025-01-01&dateTo=2025-12-31',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data).toEqual([]);
    });

    it('C6-F3.3: deve aceitar filtro por actor', async () => {
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

    it('C6-F3.4: deve aceitar filtro por action', async () => {
      const entries = [makeAuditLogRow({ action: 'DELETE' })];
      mockTransaction.mockResolvedValue([entries, 1]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/audit?action=DELETE',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data[0].action).toBe('DELETE');
    });

    it('C6-F3.5: deve aceitar filtro por result', async () => {
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

    it('deve aceitar filtro por batchId', async () => {
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

    it('deve combinar múltiplos filtros simultaneamente', async () => {
      mockTransaction.mockResolvedValue([[], 0]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/audit?action=CREATE&actor=admin&result=SUCCESS&dateFrom=2025-01-01',
      });

      expect(response.statusCode).toBe(200);
    });

    it('deve retornar lista vazia quando nenhum evento combina', async () => {
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

    it('C6-F1.5: resposta deve conter todos os campos obrigatórios', async () => {
      const entries = [makeAuditLogRow()];
      mockTransaction.mockResolvedValue([entries, 1]);

      const response = await server.inject({ method: 'GET', url: '/api/audit' });

      const body = JSON.parse(response.payload);
      const entry = body.data[0];

      // Campos obrigatórios do AuditEntry
      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('certificateId');
      expect(entry).toHaveProperty('certCn');
      expect(entry).toHaveProperty('action');
      expect(entry).toHaveProperty('actor');
      expect(entry).toHaveProperty('result');
      expect(entry).toHaveProperty('detail');
      expect(entry).toHaveProperty('timestamp');
    });

    it('C6-F1.5: timestamp deve ser ISO-8601', async () => {
      const entries = [makeAuditLogRow()];
      mockTransaction.mockResolvedValue([entries, 1]);

      const response = await server.inject({ method: 'GET', url: '/api/audit' });

      const body = JSON.parse(response.payload);
      const ts = body.data[0].timestamp;
      expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  // ── GET /api/audit/batch/:batchId ──────────────────────────────────────

  describe('GET /api/audit/batch/:batchId — consulta por lote', () => {
    it('C6-F3.9: deve retornar todas as entradas de um batch ID válido', async () => {
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
      expect(body.batchId).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('deve retornar array vazio quando nenhum evento pertence ao batch', async () => {
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

    it('C6-F3.11: deve retornar 400 para batch ID com formato inválido', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/audit/batch/invalid-batch-id',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('Invalid batch ID format');
    });
  });

  // ── Imutabilidade — F1.3 & F1.4 ────────────────────────────────────────

  describe('C6-F1.3/F1.4: Imutabilidade — rotas de mutação NÃO expostas', () => {
    it('C6-F1.3: POST /api/audit deve retornar 404 (sem criação externa)', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/audit',
        payload: { action: 'CREATE' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('C6-F1.3: PUT /api/audit/:id deve retornar 404 (sem update)', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: '/api/audit/audit-001',
        payload: { detail: 'modificado' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('C6-F1.3: PATCH /api/audit/:id deve retornar 404 (sem update parcial)', async () => {
      const response = await server.inject({
        method: 'PATCH',
        url: '/api/audit/audit-001',
        payload: { detail: 'modificado' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('C6-F1.4: DELETE /api/audit/:id deve retornar 404 (sem deleção)', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: '/api/audit/audit-001',
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
