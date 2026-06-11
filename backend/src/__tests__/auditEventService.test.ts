/**
 * Testes unitários do AuditEventService (C6).
 *
 * Verifica:
 * - logEvent(): validação, sanitização e persistência
 * - sanitizeDetails(): remoção de dados sensíveis
 * - mapToApiAuditEvent(): mapeamento Prisma → API
 * - Emissão de evento para SIEM dispatcher
 * - getEvents(): consulta paginada
 * - getEventById(): busca por ID
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AuditEventService,
  sanitizeDetails,
  mapToApiAuditEvent,
  auditEventEmitter,
  type LogEventParams,
} from '../services/auditEventService.js';
import type { AuditEventRepository } from '../repositories/auditEventRepo.js';
import type { AuditEvent as PrismaAuditEvent } from '@prisma/client';

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
    detail: 'Certificado criado',
    metadata: null,
    changes: null,
    correlationId: null,
    durationMs: 150,
    ...overrides,
  };
}

function makeMockRepo(): {
  repo: AuditEventRepository;
  mocks: Record<string, ReturnType<typeof vi.fn>>;
} {
  const mocks = {
    create: vi.fn(),
    findMany: vi.fn(),
    findById: vi.fn(),
    buildWhereClause: vi.fn(),
  };

  return {
    repo: mocks as unknown as AuditEventRepository,
    mocks,
  };
}

function makeLogParams(overrides: Partial<LogEventParams> = {}): LogEventParams {
  return {
    action: 'CERT_CREATE',
    resourceType: 'CERTIFICATE',
    resourceId: 'cert-123',
    userId: 'user-001',
    userAgent: 'TestAgent/1.0',
    ipAddress: '192.168.1.1',
    status: 'SUCCESS',
    detail: 'Certificado criado com sucesso',
    ...overrides,
  };
}

// ─── sanitizeDetails ────────────────────────────────────────────────────────

describe('sanitizeDetails', () => {
  it('deve retornar null para input null', () => {
    expect(sanitizeDetails(null)).toBeNull();
  });

  it('deve retornar null para input undefined', () => {
    expect(sanitizeDetails(undefined)).toBeNull();
  });

  it('deve manter campos não sensíveis', () => {
    const input = { cn: 'test.example.com', environment: 'production' };
    const result = sanitizeDetails(input);
    expect(result).toEqual(input);
  });

  it('deve substituir password por [REDACTED]', () => {
    const input = { username: 'admin', password: 'secret123' };
    const result = sanitizeDetails(input);
    expect(result).toEqual({ username: 'admin', password: '[REDACTED]' });
  });

  it('deve substituir privateKey por [REDACTED]', () => {
    const input = { cn: 'test.com', privateKey: '-----BEGIN PRIVATE KEY-----...' };
    const result = sanitizeDetails(input);
    expect(result).toEqual({ cn: 'test.com', privateKey: '[REDACTED]' });
  });

  it('deve substituir token por [REDACTED]', () => {
    const input = { name: 'service-1', token: 'abc123xyz' };
    const result = sanitizeDetails(input);
    expect(result).toEqual({ name: 'service-1', token: '[REDACTED]' });
  });

  it('deve substituir api_key por [REDACTED]', () => {
    const input = { service: 'webhook', api_key: 'key-abc' };
    const result = sanitizeDetails(input);
    expect(result).toEqual({ service: 'webhook', api_key: '[REDACTED]' });
  });

  it('deve substituir cpf por [REDACTED]', () => {
    const input = { name: 'João', cpf: '123.456.789-00' };
    const result = sanitizeDetails(input);
    expect(result).toEqual({ name: 'João', cpf: '[REDACTED]' });
  });

  it('deve sanitizar objetos aninhados recursivamente', () => {
    const input = {
      user: { name: 'admin', password: 'secret', accessToken: 'tok123' },
      cn: 'test.com',
    };
    const result = sanitizeDetails(input);
    expect(result).toEqual({
      user: { name: 'admin', password: '[REDACTED]', accessToken: '[REDACTED]' },
      cn: 'test.com',
    });
  });

  it('deve sanitizar objetos dentro de arrays', () => {
    const input = {
      keys: [
        { id: 'k1', privateKey: 'pem-data' },
        { id: 'k2', privateKey: 'pem-data2' },
      ],
    };
    const result = sanitizeDetails(input);
    expect(result).toEqual({
      keys: [
        { id: 'k1', privateKey: '[REDACTED]' },
        { id: 'k2', privateKey: '[REDACTED]' },
      ],
    });
  });

  it('deve manter valores primitivos em arrays', () => {
    const input = { tags: ['prod', 'mtls'], count: 5 };
    const result = sanitizeDetails(input);
    expect(result).toEqual(input);
  });

  it('deve cobrir todos os campos sensíveis conhecidos', () => {
    const input = {
      password: 'x', senha: 'x', secret: 'x',
      token: 'x', accessToken: 'x', refreshToken: 'x',
      access_token: 'x', refresh_token: 'x',
      apiKey: 'x', api_key: 'x',
      privateKey: 'x', private_key: 'x',
      pemData: 'x', pem_data: 'x',
      keyData: 'x', key_data: 'x',
      encryptedKey: 'x', encrypted_key: 'x',
      cpf: 'x', ssn: 'x',
      creditCard: 'x', credit_card: 'x',
    };
    const result = sanitizeDetails(input);

    for (const key of Object.keys(result!)) {
      expect(result![key]).toBe('[REDACTED]');
    }
  });
});

// ─── mapToApiAuditEvent ─────────────────────────────────────────────────────

describe('mapToApiAuditEvent', () => {
  it('deve converter timestamp Date para ISO-8601 string', () => {
    const event = makeAuditEvent();
    const result = mapToApiAuditEvent(event);

    expect(result.timestamp).toBe('2025-06-10T10:00:00.000Z');
    expect(typeof result.timestamp).toBe('string');
  });

  it('deve mapear todos os campos corretamente', () => {
    const event = makeAuditEvent({
      metadata: { reason: 'import' },
      changes: [{ field: 'status', oldValue: 'active', newValue: 'revoked' }] as unknown as PrismaAuditEvent['changes'],
    });
    const result = mapToApiAuditEvent(event);

    expect(result.id).toBe('evt-001');
    expect(result.action).toBe('CERT_CREATE');
    expect(result.resourceType).toBe('CERTIFICATE');
    expect(result.resourceId).toBe('cert-123');
    expect(result.userId).toBe('user-001');
    expect(result.userAgent).toBe('TestAgent/1.0');
    expect(result.ipAddress).toBe('192.168.1.1');
    expect(result.status).toBe('SUCCESS');
    expect(result.detail).toBe('Certificado criado');
    expect(result.metadata).toEqual({ reason: 'import' });
    expect(result.changes).toEqual([{ field: 'status', oldValue: 'active', newValue: 'revoked' }]);
    expect(result.correlationId).toBeNull();
    expect(result.durationMs).toBe(150);
  });
});

// ─── AuditEventService.logEvent ─────────────────────────────────────────────

describe('AuditEventService.logEvent', () => {
  let service: AuditEventService;
  let mocks: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    const mock = makeMockRepo();
    service = new AuditEventService(mock.repo);
    mocks = mock.mocks;
  });

  it('deve persistir evento e retornar mapeado para API', async () => {
    const event = makeAuditEvent();
    mocks.create.mockResolvedValue(event);

    const result = await service.logEvent(makeLogParams());

    expect(mocks.create).toHaveBeenCalledOnce();
    expect(result.id).toBe('evt-001');
    expect(result.action).toBe('CERT_CREATE');
    expect(typeof result.timestamp).toBe('string');
  });

  it('deve sanitizar metadata antes de persistir', async () => {
    const event = makeAuditEvent();
    mocks.create.mockResolvedValue(event);

    await service.logEvent(
      makeLogParams({
        metadata: { reason: 'import', password: 'secret123' },
      }),
    );

    const createCall = mocks.create.mock.calls[0][0];
    expect(createCall.metadata).toEqual({
      reason: 'import',
      password: '[REDACTED]',
    });
  });

  it('deve rejeitar action inválida', async () => {
    await expect(
      service.logEvent(makeLogParams({ action: 'INVALID_ACTION' as never })),
    ).rejects.toThrow('Ação de auditoria inválida');
  });

  it('deve rejeitar resourceType inválido', async () => {
    await expect(
      service.logEvent(makeLogParams({ resourceType: 'INVALID_TYPE' as never })),
    ).rejects.toThrow('Tipo de recurso inválido');
  });

  it('deve rejeitar resourceId vazio', async () => {
    await expect(
      service.logEvent(makeLogParams({ resourceId: '  ' })),
    ).rejects.toThrow('resourceId é obrigatório');
  });

  it('deve rejeitar userId vazio', async () => {
    await expect(
      service.logEvent(makeLogParams({ userId: '' })),
    ).rejects.toThrow('userId é obrigatório');
  });

  it('deve rejeitar status inválido', async () => {
    await expect(
      service.logEvent(makeLogParams({ status: 'UNKNOWN' as never })),
    ).rejects.toThrow('Status inválido');
  });

  it('deve emitir evento audit:event no EventEmitter', async () => {
    const event = makeAuditEvent();
    mocks.create.mockResolvedValue(event);

    const emitted: unknown[] = [];
    const listener = (data: unknown) => emitted.push(data);
    auditEventEmitter.on('audit:event', listener);

    await service.logEvent(makeLogParams());

    auditEventEmitter.off('audit:event', listener);

    expect(emitted).toHaveLength(1);
    expect((emitted[0] as { id: string }).id).toBe('evt-001');
  });

  it('deve registrar login com falha sem armazenar senha (F1.2)', async () => {
    const event = makeAuditEvent({
      action: 'AUTH_FAILED',
      status: 'FAILURE',
      detail: 'Credenciais inválidas',
    });
    mocks.create.mockResolvedValue(event);

    const result = await service.logEvent(
      makeLogParams({
        action: 'AUTH_FAILED',
        resourceType: 'USER',
        status: 'FAILURE',
        detail: 'Credenciais inválidas',
        metadata: { username: 'admin', password: 'wrong_pass' },
      }),
    );

    // Verifica que a senha foi sanitizada
    const createCall = mocks.create.mock.calls[0][0];
    expect(createCall.metadata.password).toBe('[REDACTED]');
    expect(result.status).toBe('FAILURE');
  });

  it('deve preencher campos opcionais como null quando não fornecidos', async () => {
    const event = makeAuditEvent({ userAgent: null, ipAddress: null });
    mocks.create.mockResolvedValue(event);

    await service.logEvent(
      makeLogParams({ userAgent: undefined, ipAddress: undefined }),
    );

    const createCall = mocks.create.mock.calls[0][0];
    expect(createCall.userAgent).toBeNull();
    expect(createCall.ipAddress).toBeNull();
    expect(createCall.correlationId).toBeNull();
    expect(createCall.durationMs).toBeNull();
  });
});

// ─── AuditEventService.getEvents ────────────────────────────────────────────

describe('AuditEventService.getEvents', () => {
  let service: AuditEventService;
  let mocks: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    const mock = makeMockRepo();
    service = new AuditEventService(mock.repo);
    mocks = mock.mocks;
  });

  it('deve retornar resposta paginada', async () => {
    const events = [makeAuditEvent()];
    mocks.findMany.mockResolvedValue({ data: events, total: 1 });

    const result = await service.getEvents({ page: '1', pageSize: '25' });

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(result.totalPages).toBe(1);
  });

  it('deve parsear filtros de action separados por vírgula', async () => {
    mocks.findMany.mockResolvedValue({ data: [], total: 0 });

    await service.getEvents({ action: 'CERT_CREATE,CERT_UPDATE' });

    const call = mocks.findMany.mock.calls[0];
    expect(call[0].action).toEqual(['CERT_CREATE', 'CERT_UPDATE']);
  });

  it('deve parsear action única sem array', async () => {
    mocks.findMany.mockResolvedValue({ data: [], total: 0 });

    await service.getEvents({ action: 'CERT_CREATE' });

    const call = mocks.findMany.mock.calls[0];
    expect(call[0].action).toBe('CERT_CREATE');
  });

  it('deve passar todos os filtros para o repositório', async () => {
    mocks.findMany.mockResolvedValue({ data: [], total: 0 });

    await service.getEvents({
      action: 'CERT_CREATE',
      resourceType: 'CERTIFICATE',
      userId: 'user-001',
      status: 'SUCCESS',
      dateFrom: '2025-01-01',
      dateTo: '2025-12-31',
      search: 'import',
      sortBy: 'timestamp',
      sortDirection: 'desc',
    });

    const call = mocks.findMany.mock.calls[0];
    expect(call[0]).toMatchObject({
      action: 'CERT_CREATE',
      resourceType: 'CERTIFICATE',
      userId: 'user-001',
      status: 'SUCCESS',
      dateFrom: '2025-01-01',
      dateTo: '2025-12-31',
      search: 'import',
      sortBy: 'timestamp',
      sortDirection: 'desc',
    });
  });
});

// ─── AuditEventService.getEventById ─────────────────────────────────────────

describe('AuditEventService.getEventById', () => {
  let service: AuditEventService;
  let mocks: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    const mock = makeMockRepo();
    service = new AuditEventService(mock.repo);
    mocks = mock.mocks;
  });

  it('deve retornar evento mapeado quando encontrado', async () => {
    const event = makeAuditEvent();
    mocks.findById.mockResolvedValue(event);

    const result = await service.getEventById('evt-001');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('evt-001');
    expect(typeof result!.timestamp).toBe('string');
  });

  it('deve retornar null quando não encontrado', async () => {
    mocks.findById.mockResolvedValue(null);

    const result = await service.getEventById('inexistente');
    expect(result).toBeNull();
  });
});
