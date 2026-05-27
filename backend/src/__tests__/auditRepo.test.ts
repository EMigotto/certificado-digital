import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditRepository } from '../repositories/auditRepo.js';
import type { PrismaClient } from '@prisma/client';

// ─── Test helpers ───────────────────────────────────────────────────────────

function createMockPrisma() {
  const mockAuditCreate = vi.fn();
  const mockAuditFindMany = vi.fn();
  const mockAuditCount = vi.fn();
  const mockTransaction = vi.fn();

  const prisma = {
    auditLog: {
      create: mockAuditCreate,
      findMany: mockAuditFindMany,
      count: mockAuditCount,
    },
    $transaction: mockTransaction,
  } as unknown as PrismaClient;

  return {
    prisma,
    mocks: {
      auditCreate: mockAuditCreate,
      auditFindMany: mockAuditFindMany,
      auditCount: mockAuditCount,
      transaction: mockTransaction,
    },
  };
}

// ─── Tests: buildWhereClause ────────────────────────────────────────────────

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

  it('should filter by action (case-insensitive input)', () => {
    const where = repo.buildWhereClause({ action: 'create' });
    expect(where).toEqual({ action: 'CREATE' });
  });

  it('should filter by action (uppercase input)', () => {
    const where = repo.buildWhereClause({ action: 'DELETE' });
    expect(where).toEqual({ action: 'DELETE' });
  });

  it('should ignore invalid action values', () => {
    const where = repo.buildWhereClause({ action: 'INVALID_ACTION' });
    expect(where).toEqual({});
  });

  it('should filter by actor (case-insensitive contains)', () => {
    const where = repo.buildWhereClause({ actor: 'admin' });
    expect(where).toEqual({
      actor: { contains: 'admin', mode: 'insensitive' },
    });
  });

  it('should ignore empty/whitespace actor', () => {
    const where = repo.buildWhereClause({ actor: '   ' });
    expect(where).toEqual({});
  });

  it('should filter by certificateId (exact match)', () => {
    const where = repo.buildWhereClause({ certificateId: 'cert-001' });
    expect(where).toEqual({ certId: 'cert-001' });
  });

  it('should filter by batchId (exact match on column)', () => {
    const where = repo.buildWhereClause({ batchId: 'batch-uuid-123' });
    expect(where).toEqual({ batchId: 'batch-uuid-123' });
  });

  it('should filter by dateFrom (gte)', () => {
    const where = repo.buildWhereClause({ dateFrom: '2025-01-01' });
    expect(where).toHaveProperty('timestamp');
    const ts = (where as { timestamp: { gte: Date } }).timestamp;
    expect(ts.gte).toBeInstanceOf(Date);
    expect(ts.gte.toISOString()).toContain('2025-01-01');
  });

  it('should filter by dateTo (lte, end of day for date-only)', () => {
    const where = repo.buildWhereClause({ dateTo: '2025-06-30' });
    expect(where).toHaveProperty('timestamp');
    const ts = (where as { timestamp: { lte: Date } }).timestamp;
    expect(ts.lte).toBeInstanceOf(Date);
    // End of day: 23:59:59.999 UTC
    expect(ts.lte.getUTCHours()).toBe(23);
    expect(ts.lte.getUTCMinutes()).toBe(59);
  });

  it('should filter by dateTo with full ISO timestamp (exact)', () => {
    const where = repo.buildWhereClause({ dateTo: '2025-06-30T15:30:00.000Z' });
    expect(where).toHaveProperty('timestamp');
    const ts = (where as { timestamp: { lte: Date } }).timestamp;
    // Full ISO — should NOT add end-of-day adjustment
    expect(ts.lte.getUTCHours()).toBe(15);
    expect(ts.lte.getUTCMinutes()).toBe(30);
  });

  it('should ignore invalid dateFrom', () => {
    const where = repo.buildWhereClause({ dateFrom: 'not-a-date' });
    expect(where).toEqual({});
  });

  it('should ignore invalid dateTo', () => {
    const where = repo.buildWhereClause({ dateTo: 'not-a-date' });
    expect(where).toEqual({});
  });

  it('should filter by result (case-insensitive input)', () => {
    const where = repo.buildWhereClause({ result: 'failure' });
    expect(where).toEqual({ result: 'FAILURE' });
  });

  it('should ignore invalid result values', () => {
    const where = repo.buildWhereClause({ result: 'MAYBE' });
    expect(where).toEqual({});
  });

  it('should combine multiple filters with AND', () => {
    const where = repo.buildWhereClause({
      action: 'CREATE',
      actor: 'admin',
      result: 'SUCCESS',
    });
    expect(where).toHaveProperty('AND');
    const conditions = (where as { AND: unknown[] }).AND;
    expect(conditions).toHaveLength(3);
  });

  it('should return single condition without AND wrapper', () => {
    const where = repo.buildWhereClause({ action: 'DELETE' });
    expect(where).not.toHaveProperty('AND');
    expect(where).toEqual({ action: 'DELETE' });
  });

  it('should combine date range with other filters', () => {
    const where = repo.buildWhereClause({
      action: 'CREATE',
      dateFrom: '2025-01-01',
      dateTo: '2025-12-31',
    });
    expect(where).toHaveProperty('AND');
    const conditions = (where as { AND: unknown[] }).AND;
    expect(conditions).toHaveLength(3);
  });
});

// ─── Tests: findMany ────────────────────────────────────────────────────────

describe('AuditRepository.findMany', () => {
  let repo: AuditRepository;
  let mocks: ReturnType<typeof createMockPrisma>['mocks'];

  beforeEach(() => {
    const { prisma, mocks: m } = createMockPrisma();
    mocks = m;
    repo = new AuditRepository(prisma);
  });

  it('should call $transaction with findMany and count', async () => {
    const entries = [
      {
        id: 'audit-1',
        certId: 'cert-1',
        certCn: 'test.example.com',
        action: 'CREATE',
        actor: 'admin',
        result: 'SUCCESS',
        detail: 'Imported',
        batchId: null,
        timestamp: new Date(),
      },
    ];
    mocks.transaction.mockResolvedValue([entries, 1]);

    const result = await repo.findMany({}, { page: 1, pageSize: 25, skip: 0, take: 25 });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual(entries);
    expect(result.total).toBe(1);
  });
});

// ─── Tests: findByBatchId ───────────────────────────────────────────────────

describe('AuditRepository.findByBatchId', () => {
  let repo: AuditRepository;
  let mocks: ReturnType<typeof createMockPrisma>['mocks'];

  beforeEach(() => {
    const { prisma, mocks: m } = createMockPrisma();
    mocks = m;
    repo = new AuditRepository(prisma);
  });

  it('should query by batchId column and sort by timestamp DESC', async () => {
    const entries = [{ id: 'audit-1' }, { id: 'audit-2' }];
    mocks.auditFindMany.mockResolvedValue(entries);

    const result = await repo.findByBatchId('batch-123');

    expect(mocks.auditFindMany).toHaveBeenCalledWith({
      where: { batchId: 'batch-123' },
      orderBy: { timestamp: 'desc' },
    });
    expect(result).toEqual(entries);
  });
});

// ─── Tests: create ──────────────────────────────────────────────────────────

describe('AuditRepository.create', () => {
  let repo: AuditRepository;
  let mocks: ReturnType<typeof createMockPrisma>['mocks'];

  beforeEach(() => {
    const { prisma, mocks: m } = createMockPrisma();
    mocks = m;
    repo = new AuditRepository(prisma);
  });

  it('should create audit entry with all fields', async () => {
    const created = {
      id: 'audit-new',
      certId: 'cert-001',
      certCn: 'test.example.com',
      action: 'CREATE',
      actor: 'admin',
      result: 'SUCCESS',
      detail: 'Certificate imported',
      batchId: null,
      timestamp: new Date(),
    };
    mocks.auditCreate.mockResolvedValue(created);

    const result = await repo.create({
      certId: 'cert-001',
      certCn: 'test.example.com',
      action: 'CREATE',
      actor: 'admin',
      result: 'SUCCESS',
      detail: 'Certificate imported',
    });

    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: {
        certId: 'cert-001',
        certCn: 'test.example.com',
        action: 'CREATE',
        actor: 'admin',
        result: 'SUCCESS',
        detail: 'Certificate imported',
        batchId: null,
      },
    });
    expect(result).toEqual(created);
  });

  it('should create audit entry with batchId', async () => {
    const created = {
      id: 'audit-batch',
      batchId: 'batch-uuid-456',
    };
    mocks.auditCreate.mockResolvedValue(created);

    await repo.create({
      certId: 'cert-002',
      certCn: 'batch.example.com',
      action: 'CREATE',
      actor: 'system',
      result: 'SUCCESS',
      detail: 'CSV import',
      batchId: 'batch-uuid-456',
    });

    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        batchId: 'batch-uuid-456',
      }),
    });
  });

  it('should set batchId to null when undefined', async () => {
    mocks.auditCreate.mockResolvedValue({ id: 'audit-1' });

    await repo.create({
      certId: null,
      certCn: 'test.pem',
      action: 'CREATE',
      actor: 'system',
      result: 'FAILURE',
      detail: 'Parse error',
    });

    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        batchId: null,
      }),
    });
  });
});
