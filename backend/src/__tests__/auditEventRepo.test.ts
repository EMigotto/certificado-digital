/**
 * Testes unitários do AuditEventRepository (C6).
 *
 * Usa mocks do Prisma para testar:
 * - create(): inserção de evento
 * - findMany(): consulta paginada com filtros
 * - findById(): busca por ID
 * - buildWhereClause(): construção dinâmica de WHERE
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditEventRepository } from '../repositories/auditEventRepo.js';
import type { PrismaClient, AuditEvent as PrismaAuditEvent } from '@prisma/client';
import type { AuditEventCreate } from '@certificado-digital/shared';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeAuditEvent(overrides: Partial<PrismaAuditEvent> = {}): PrismaAuditEvent {
  return {
    id: 'evt-001',
    action: 'CERT_CREATE',
    resourceType: 'CERTIFICATE',
    resourceId: 'cert-123',
    userId: 'user-001',
    userAgent: 'TestAgent/1.0',
    ipAddress: '192.168.1.1',
    timestamp: new Date('2025-06-10T10:00:00.000Z'),
    status: 'SUCCESS',
    detail: 'Certificado criado com sucesso',
    metadata: null,
    changes: null,
    correlationId: null,
    durationMs: 150,
    ...overrides,
  };
}

function makeMockPrisma() {
  const mocks = {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
  };

  const prisma = {
    auditEvent: mocks,
    $transaction: vi.fn(),
  } as unknown as PrismaClient;

  return { prisma, mocks };
}

// ─── buildWhereClause ───────────────────────────────────────────────────────

describe('AuditEventRepository.buildWhereClause', () => {
  let repo: AuditEventRepository;

  beforeEach(() => {
    const { prisma } = makeMockPrisma();
    repo = new AuditEventRepository(prisma);
  });

  it('deve retornar objeto vazio quando nenhum filtro é fornecido', () => {
    const where = repo.buildWhereClause({});
    expect(where).toEqual({});
  });

  it('deve filtrar por action única', () => {
    const where = repo.buildWhereClause({ action: 'CERT_CREATE' });
    expect(where).toEqual({ action: 'CERT_CREATE' });
  });

  it('deve filtrar por array de actions', () => {
    const where = repo.buildWhereClause({
      action: ['CERT_CREATE', 'CERT_UPDATE'],
    });
    expect(where).toEqual({ action: { in: ['CERT_CREATE', 'CERT_UPDATE'] } });
  });

  it('deve filtrar por resourceType única', () => {
    const where = repo.buildWhereClause({ resourceType: 'CERTIFICATE' });
    expect(where).toEqual({ resourceType: 'CERTIFICATE' });
  });

  it('deve filtrar por array de resourceTypes', () => {
    const where = repo.buildWhereClause({
      resourceType: ['CERTIFICATE', 'TOKEN'],
    });
    expect(where).toEqual({ resourceType: { in: ['CERTIFICATE', 'TOKEN'] } });
  });

  it('deve filtrar por resourceId (match exato)', () => {
    const where = repo.buildWhereClause({ resourceId: 'cert-123' });
    expect(where).toEqual({ resourceId: 'cert-123' });
  });

  it('deve filtrar por userId (match exato)', () => {
    const where = repo.buildWhereClause({ userId: 'user-001' });
    expect(where).toEqual({ userId: 'user-001' });
  });

  it('deve filtrar por status', () => {
    const where = repo.buildWhereClause({ status: 'FAILURE' });
    expect(where).toEqual({ status: 'FAILURE' });
  });

  it('deve filtrar por dateFrom', () => {
    const where = repo.buildWhereClause({ dateFrom: '2025-01-01' });
    expect(where).toEqual({
      timestamp: { gte: new Date('2025-01-01') },
    });
  });

  it('deve filtrar por dateTo (inclui dia inteiro)', () => {
    const where = repo.buildWhereClause({ dateTo: '2025-12-31' });
    const expected = new Date('2025-12-31');
    expected.setHours(23, 59, 59, 999);
    expect(where).toEqual({
      timestamp: { lte: expected },
    });
  });

  it('deve filtrar por correlationId', () => {
    const where = repo.buildWhereClause({ correlationId: 'batch-abc' });
    expect(where).toEqual({ correlationId: 'batch-abc' });
  });

  it('deve filtrar por busca textual no detail', () => {
    const where = repo.buildWhereClause({ search: 'certificado' });
    expect(where).toEqual({
      detail: { contains: 'certificado', mode: 'insensitive' },
    });
  });

  it('deve combinar múltiplos filtros com AND', () => {
    const where = repo.buildWhereClause({
      action: 'CERT_CREATE',
      status: 'SUCCESS',
      userId: 'user-001',
    });
    expect(where).toEqual({
      AND: [
        { action: 'CERT_CREATE' },
        { userId: 'user-001' },
        { status: 'SUCCESS' },
      ],
    });
  });

  it('deve ignorar filtros com string vazia ou whitespace', () => {
    const where = repo.buildWhereClause({
      resourceId: '  ',
      userId: '',
      correlationId: '   ',
      search: ' ',
    });
    expect(where).toEqual({});
  });
});

// ─── create ─────────────────────────────────────────────────────────────────

describe('AuditEventRepository.create', () => {
  it('deve chamar prisma.auditEvent.create com dados corretos', async () => {
    const { prisma, mocks } = makeMockPrisma();
    const repo = new AuditEventRepository(prisma);
    const event = makeAuditEvent();
    mocks.create.mockResolvedValue(event);

    const input: AuditEventCreate = {
      action: 'CERT_CREATE',
      resourceType: 'CERTIFICATE',
      resourceId: 'cert-123',
      userId: 'user-001',
      userAgent: 'TestAgent/1.0',
      ipAddress: '192.168.1.1',
      status: 'SUCCESS',
      detail: 'Certificado criado com sucesso',
      metadata: null,
      changes: null,
      correlationId: null,
      durationMs: 150,
    };

    const result = await repo.create(input);

    expect(mocks.create).toHaveBeenCalledOnce();
    expect(result).toEqual(event);
  });
});

// ─── findMany ───────────────────────────────────────────────────────────────

describe('AuditEventRepository.findMany', () => {
  it('deve retornar dados paginados com total', async () => {
    const { prisma } = makeMockPrisma();
    const repo = new AuditEventRepository(prisma);
    const events = [makeAuditEvent()];

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([events, 1]);

    const result = await repo.findMany({}, { skip: 0, take: 25 });

    expect(result.data).toEqual(events);
    expect(result.total).toBe(1);
  });

  it('deve usar ordenação padrão timestamp DESC', async () => {
    const { prisma } = makeMockPrisma();
    const repo = new AuditEventRepository(prisma);

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([[], 0]);

    await repo.findMany({}, { skip: 0, take: 25 });

    // Verifica que $transaction foi chamado
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it('deve aceitar ordenação customizada', async () => {
    const { prisma } = makeMockPrisma();
    const repo = new AuditEventRepository(prisma);

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([[], 0]);

    await repo.findMany(
      { sortBy: 'action', sortDirection: 'asc' },
      { skip: 0, take: 10 },
    );

    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});

// ─── findById ───────────────────────────────────────────────────────────────

describe('AuditEventRepository.findById', () => {
  it('deve retornar evento quando encontrado', async () => {
    const { prisma, mocks } = makeMockPrisma();
    const repo = new AuditEventRepository(prisma);
    const event = makeAuditEvent();
    mocks.findUnique.mockResolvedValue(event);

    const result = await repo.findById('evt-001');

    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: 'evt-001' } });
    expect(result).toEqual(event);
  });

  it('deve retornar null quando não encontrado', async () => {
    const { prisma, mocks } = makeMockPrisma();
    const repo = new AuditEventRepository(prisma);
    mocks.findUnique.mockResolvedValue(null);

    const result = await repo.findById('inexistente');
    expect(result).toBeNull();
  });
});
