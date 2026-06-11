/**
 * C6 — Trilha de Auditoria: Testes QA do AuditRepository (backend)
 *
 * Mapeia cenários dos critérios de aceite:
 *   - F1.3: Impedir atualização de evento (imutabilidade via API — sem UPDATE/DELETE)
 *   - F1.4: Impedir deleção de evento
 *   - F3.1–F3.5: Filtros de consulta (buildWhereClause)
 *   - F3.7: Paginação (findMany)
 *   - F3.11: Parâmetros inválidos
 *   - F12.2: Paginação obrigatória
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditRepository } from '../../repositories/auditRepo.js';
import type { PrismaClient } from '@prisma/client';

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockPrisma() {
  const mockFindMany = vi.fn();
  const mockCount = vi.fn();
  const mockCreate = vi.fn();
  const mockTransaction = vi.fn();

  const prisma = {
    auditEntry: {
      findMany: mockFindMany,
      count: mockCount,
      create: mockCreate,
    },
    $transaction: mockTransaction,
  } as unknown as PrismaClient;

  return {
    prisma,
    mocks: {
      findMany: mockFindMany,
      count: mockCount,
      create: mockCreate,
      transaction: mockTransaction,
    },
  };
}

// ─── F1.3 & F1.4: Imutabilidade — Repositório sem métodos de alteração ─────

describe('C6-F1.3/F1.4: Imutabilidade — AuditRepository não expõe update/delete', () => {
  it('AuditRepository não deve ter método update', () => {
    const { prisma } = createMockPrisma();
    const repo = new AuditRepository(prisma);
    expect((repo as Record<string, unknown>)['update']).toBeUndefined();
  });

  it('AuditRepository não deve ter método delete', () => {
    const { prisma } = createMockPrisma();
    const repo = new AuditRepository(prisma);
    expect((repo as Record<string, unknown>)['delete']).toBeUndefined();
  });

  it('AuditRepository deve expor apenas create, findMany, findByBatchId, buildWhereClause', () => {
    const { prisma } = createMockPrisma();
    const repo = new AuditRepository(prisma);
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(repo)).filter(
      (n) => n !== 'constructor',
    );

    expect(methods).toContain('create');
    expect(methods).toContain('findMany');
    expect(methods).toContain('findByBatchId');
    expect(methods).toContain('buildWhereClause');

    // Não deve ter métodos de mutação
    expect(methods).not.toContain('update');
    expect(methods).not.toContain('delete');
    expect(methods).not.toContain('updateMany');
    expect(methods).not.toContain('deleteMany');
  });
});

// ─── F3: buildWhereClause — filtros de consulta ────────────────────────────

describe('C6-F3: buildWhereClause — filtros de consulta', () => {
  let repo: AuditRepository;

  beforeEach(() => {
    const { prisma } = createMockPrisma();
    repo = new AuditRepository(prisma);
  });

  it('C6-F3.11: deve retornar objeto vazio para filtros vazios', () => {
    const where = repo.buildWhereClause({});
    expect(where).toEqual({});
  });

  it('C6-F3.4: deve filtrar por action (case-insensitive)', () => {
    const where1 = repo.buildWhereClause({ action: 'CREATE' });
    expect(where1).toEqual({ action: 'CREATE' });

    const where2 = repo.buildWhereClause({ action: 'create' });
    expect(where2).toEqual({ action: 'CREATE' });
  });

  it('C6-F3.4: deve ignorar ações inválidas', () => {
    const where = repo.buildWhereClause({ action: 'INVALID_ACTION' });
    expect(where).toEqual({});
  });

  it('C6-F3.3: deve filtrar por actor (case-insensitive contains)', () => {
    const where = repo.buildWhereClause({ actor: 'admin' });
    expect(where).toEqual({
      actor: { contains: 'admin', mode: 'insensitive' },
    });
  });

  it('C6-F3.1: deve filtrar por certificateId (match exato)', () => {
    const where = repo.buildWhereClause({ certificateId: 'cert-001' });
    expect(where).toEqual({ certificateId: 'cert-001' });
  });

  it('deve filtrar por batchId (contains no campo detail)', () => {
    const where = repo.buildWhereClause({ batchId: 'batch-abc' });
    expect(where).toEqual({ detail: { contains: 'batch-abc' } });
  });

  it('C6-F3.2: deve filtrar por dateFrom (>=)', () => {
    const where = repo.buildWhereClause({ dateFrom: '2025-01-01' });
    expect(where).toHaveProperty('timestamp');
    const ts = where.timestamp as { gte: Date };
    expect(ts.gte).toBeInstanceOf(Date);
    expect(ts.gte.toISOString()).toContain('2025-01-01');
  });

  it('C6-F3.2: deve filtrar por dateTo (fim do dia, <=)', () => {
    const where = repo.buildWhereClause({ dateTo: '2025-12-31' });
    expect(where).toHaveProperty('timestamp');
    const ts = where.timestamp as { lte: Date };
    expect(ts.lte).toBeInstanceOf(Date);
    expect(ts.lte.getHours()).toBe(23);
    expect(ts.lte.getMinutes()).toBe(59);
    expect(ts.lte.getSeconds()).toBe(59);
  });

  it('C6-F3.5: deve filtrar por resultado (SUCCESS/FAILURE)', () => {
    expect(repo.buildWhereClause({ result: 'FAILURE' })).toEqual({ result: 'FAILURE' });
    expect(repo.buildWhereClause({ result: 'success' })).toEqual({ result: 'SUCCESS' });
  });

  it('C6-F3.5: deve ignorar resultado inválido', () => {
    const where = repo.buildWhereClause({ result: 'UNKNOWN' });
    expect(where).toEqual({});
  });

  it('deve combinar múltiplos filtros com AND', () => {
    const where = repo.buildWhereClause({
      action: 'CREATE',
      actor: 'admin',
      result: 'SUCCESS',
    });

    expect(where).toHaveProperty('AND');
    const and = (where as { AND: unknown[] }).AND;
    expect(and).toHaveLength(3);
  });

  it('deve retornar condição única sem wrapper AND', () => {
    const where = repo.buildWhereClause({ action: 'DELETE' });
    expect(where).not.toHaveProperty('AND');
    expect(where).toEqual({ action: 'DELETE' });
  });

  it('deve ignorar filtros com strings vazias ou apenas espaços', () => {
    const where = repo.buildWhereClause({
      actor: '   ',
      certificateId: '',
      batchId: '  ',
    });
    expect(where).toEqual({});
  });

  it('C6-F3.11: deve ignorar datas inválidas', () => {
    const where = repo.buildWhereClause({ dateFrom: 'not-a-date' });
    expect(where).toEqual({});
  });
});

// ─── F3.7 & F12.2: findMany — paginação ────────────────────────────────────

describe('C6-F3.7/F12.2: findMany — paginação e consulta', () => {
  let repo: AuditRepository;
  let mocks: ReturnType<typeof createMockPrisma>['mocks'];

  beforeEach(() => {
    const mock = createMockPrisma();
    repo = new AuditRepository(mock.prisma);
    mocks = mock.mocks;
  });

  it('deve chamar $transaction com findMany e count', async () => {
    const entries = [{ id: 'a-1' }];
    mocks.transaction.mockResolvedValue([entries, 1]);

    const result = await repo.findMany({}, { page: 1, pageSize: 25, skip: 0, take: 25 });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual(entries);
    expect(result.total).toBe(1);
  });

  it('deve respeitar skip/take na paginação', async () => {
    mocks.transaction.mockResolvedValue([[], 0]);

    await repo.findMany({}, { page: 3, pageSize: 10, skip: 20, take: 10 });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});

// ─── findByBatchId ─────────────────────────────────────────────────────────

describe('C6: findByBatchId — consulta por lote', () => {
  let repo: AuditRepository;
  let mocks: ReturnType<typeof createMockPrisma>['mocks'];

  beforeEach(() => {
    const mock = createMockPrisma();
    repo = new AuditRepository(mock.prisma);
    mocks = mock.mocks;
  });

  it('deve consultar com detail contains batchId, ordenado por timestamp desc', async () => {
    mocks.findMany.mockResolvedValue([]);

    await repo.findByBatchId('batch-xyz');

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { detail: { contains: 'batch-xyz' } },
      orderBy: { timestamp: 'desc' },
    });
  });

  it('deve retornar entradas correspondentes', async () => {
    const entries = [{ id: 'a-1' }, { id: 'a-2' }];
    mocks.findMany.mockResolvedValue(entries);

    const result = await repo.findByBatchId('batch-xyz');

    expect(result).toEqual(entries);
    expect(result).toHaveLength(2);
  });
});

// ─── create — entrada imutável ─────────────────────────────────────────────

describe('C6-F1.1: create — criação de entrada imutável', () => {
  let repo: AuditRepository;
  let mocks: ReturnType<typeof createMockPrisma>['mocks'];

  beforeEach(() => {
    const mock = createMockPrisma();
    repo = new AuditRepository(mock.prisma);
    mocks = mock.mocks;
  });

  it('deve criar entrada com todos os campos', async () => {
    const entry = {
      certificateId: 'cert-001',
      certCn: 'test.example.com',
      action: 'CREATE' as const,
      actor: 'admin',
      result: 'SUCCESS' as const,
      detail: 'Certificate imported',
    };

    const created = { id: 'audit-new', ...entry, timestamp: new Date() };
    mocks.create.mockResolvedValue(created);

    const result = await repo.create(entry);

    expect(mocks.create).toHaveBeenCalledWith({ data: entry });
    expect(result.id).toBe('audit-new');
  });

  it('deve criar entrada com certificateId null', async () => {
    const entry = {
      certificateId: null,
      certCn: 'batch-summary',
      action: 'CREATE' as const,
      actor: 'system',
      result: 'SUCCESS' as const,
      detail: 'CSV bulk import complete',
    };

    mocks.create.mockResolvedValue({ id: 'audit-batch', ...entry, timestamp: new Date() });

    const result = await repo.create(entry);

    expect(mocks.create).toHaveBeenCalledWith({ data: entry });
    expect(result.id).toBe('audit-batch');
  });
});
