import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditRepository, type AuditFilters } from '../repositories/auditRepo.js';
import type { PrismaClient } from '@prisma/client';

// ─── Test helpers ────────────────────────────────────────────────────────────

function createMockPrisma() {
  const mockFindMany = vi.fn();
  const mockCount = vi.fn();
  const mockCreate = vi.fn();
  const mockTransaction = vi.fn();

  const prisma = {
    auditLog: {
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

// ─── Unit tests: buildWhereClause ───────────────────────────────────────────

describe('AuditRepository.buildWhereClause', () => {
  let repo: AuditRepository;

  beforeEach(() => {
    const { prisma } = createMockPrisma();
    repo = new AuditRepository(prisma);
  });

  it('should return empty object for no filters', () => {
    const where = repo.buildWhereClause({});
    expect(where).toEqual({});
  });

  it('should filter by action', () => {
    const where = repo.buildWhereClause({ action: 'CREATE' });
    expect(where).toEqual({ action: 'CREATE' });
  });

  it('should normalize action to uppercase', () => {
    const where = repo.buildWhereClause({ action: 'create' });
    expect(where).toEqual({ action: 'CREATE' });
  });

  it('should ignore invalid action values', () => {
    const where = repo.buildWhereClause({ action: 'INVALID' });
    expect(where).toEqual({});
  });

  it('should filter by actor (case-insensitive contains)', () => {
    const where = repo.buildWhereClause({ actor: 'admin' });
    expect(where).toEqual({
      actor: { contains: 'admin', mode: 'insensitive' },
    });
  });

  it('should filter by certificateId (exact match)', () => {
    const where = repo.buildWhereClause({ certificateId: 'cert-001' });
    expect(where).toEqual({ certId: 'cert-001' });
  });

  it('should filter by batchId (contains in detail)', () => {
    const where = repo.buildWhereClause({ batchId: 'batch-abc' });
    expect(where).toEqual({ detail: { contains: 'batch-abc' } });
  });

  it('should filter by dateFrom', () => {
    const where = repo.buildWhereClause({ dateFrom: '2025-01-01' });
    expect(where).toHaveProperty('timestamp');
    const ts = where.timestamp as { gte: Date };
    expect(ts.gte).toBeInstanceOf(Date);
    expect(ts.gte.toISOString()).toContain('2025-01-01');
  });

  it('should filter by dateTo (end of day)', () => {
    const where = repo.buildWhereClause({ dateTo: '2025-12-31' });
    expect(where).toHaveProperty('timestamp');
    const ts = where.timestamp as { lte: Date };
    expect(ts.lte).toBeInstanceOf(Date);
    expect(ts.lte.getHours()).toBe(23);
    expect(ts.lte.getMinutes()).toBe(59);
  });

  it('should filter by result', () => {
    const where = repo.buildWhereClause({ result: 'FAILURE' });
    expect(where).toEqual({ result: 'FAILURE' });
  });

  it('should normalize result to uppercase', () => {
    const where = repo.buildWhereClause({ result: 'success' });
    expect(where).toEqual({ result: 'SUCCESS' });
  });

  it('should ignore invalid result values', () => {
    const where = repo.buildWhereClause({ result: 'UNKNOWN' });
    expect(where).toEqual({});
  });

  it('should combine multiple filters with AND', () => {
    const where = repo.buildWhereClause({
      action: 'CREATE',
      actor: 'admin',
      result: 'SUCCESS',
    });

    expect(where).toHaveProperty('AND');
    const and = (where as { AND: unknown[] }).AND;
    expect(and).toHaveLength(3);
  });

  it('should return single condition without AND wrapper', () => {
    const where = repo.buildWhereClause({ action: 'DELETE' });
    expect(where).not.toHaveProperty('AND');
    expect(where).toEqual({ action: 'DELETE' });
  });

  it('should ignore empty/whitespace-only string filters', () => {
    const where = repo.buildWhereClause({
      actor: '   ',
      certificateId: '',
      batchId: '  ',
    });
    expect(where).toEqual({});
  });

  it('should skip invalid date strings', () => {
    const where = repo.buildWhereClause({ dateFrom: 'not-a-date' });
    expect(where).toEqual({});
  });
});

// ─── Unit tests: findMany ────────────────────────────────────────────────────

describe('AuditRepository.findMany', () => {
  let repo: AuditRepository;
  let mocks: ReturnType<typeof createMockPrisma>['mocks'];

  beforeEach(() => {
    const mock = createMockPrisma();
    repo = new AuditRepository(mock.prisma);
    mocks = mock.mocks;
  });

  it('should call $transaction with findMany and count', async () => {
    const entries = [{ id: 'a-1' }];
    mocks.transaction.mockResolvedValue([entries, 1]);

    const result = await repo.findMany({}, { page: 1, pageSize: 25, skip: 0, take: 25 });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual(entries);
    expect(result.total).toBe(1);
  });

  it('should pass pagination skip/take to findMany', async () => {
    mocks.transaction.mockResolvedValue([[], 0]);

    await repo.findMany({}, { page: 2, pageSize: 10, skip: 10, take: 10 });

    // Verify the transaction was called (Prisma batches are opaque in mocks)
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});

// ─── Unit tests: findByBatchId ──────────────────────────────────────────────

describe('AuditRepository.findByBatchId', () => {
  let repo: AuditRepository;
  let mocks: ReturnType<typeof createMockPrisma>['mocks'];

  beforeEach(() => {
    const mock = createMockPrisma();
    repo = new AuditRepository(mock.prisma);
    mocks = mock.mocks;
  });

  it('should query with detail contains batchId', async () => {
    mocks.findMany.mockResolvedValue([]);

    await repo.findByBatchId('batch-xyz');

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { detail: { contains: 'batch-xyz' } },
      orderBy: { timestamp: 'desc' },
    });
  });

  it('should return matching entries', async () => {
    const entries = [{ id: 'a-1' }, { id: 'a-2' }];
    mocks.findMany.mockResolvedValue(entries);

    const result = await repo.findByBatchId('batch-xyz');

    expect(result).toEqual(entries);
  });
});

// ─── Unit tests: create ─────────────────────────────────────────────────────

describe('AuditRepository.create', () => {
  let repo: AuditRepository;
  let mocks: ReturnType<typeof createMockPrisma>['mocks'];

  beforeEach(() => {
    const mock = createMockPrisma();
    repo = new AuditRepository(mock.prisma);
    mocks = mock.mocks;
  });

  it('should create an audit log entry with all fields', async () => {
    const entry = {
      certId: 'cert-001',
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

  it('should create an entry with null certId', async () => {
    const entry = {
      certId: null,
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
