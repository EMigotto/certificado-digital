/**
 * C6 — Trilha de Auditoria: Testes QA do AuditService (backend)
 *
 * Mapeia cenários dos critérios de aceite:
 *   - F1 (Captura de Eventos Imutável): 1.2, 1.5
 *   - F2 (Cobertura de Eventos): 2.1, 2.6
 *   - F3 (Consulta de Auditoria via API): 3.1–3.9
 *   - NF.3 (Sanitização de dados sensíveis)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AuditService,
  mapToApiAuditEntry,
  sanitizeForAudit,
  type AuditLogParams,
} from '../../services/auditService.js';
import type { AuditRepository } from '../../repositories/auditRepo.js';
import type { AuditEntry } from '@prisma/client';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeAuditEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
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

function makeMockRepo(): {
  repo: AuditRepository;
  mocks: Record<string, ReturnType<typeof vi.fn>>;
} {
  const mocks = {
    findMany: vi.fn(),
    findByBatchId: vi.fn(),
    create: vi.fn(),
    buildWhereClause: vi.fn(),
  };
  return {
    repo: mocks as unknown as AuditRepository,
    mocks,
  };
}

// ─── Cenário 1.5: Registrar metadados completos ────────────────────────────

describe('C6-F1.5: mapToApiAuditEntry — metadados completos', () => {
  it('deve mapear todos os campos obrigatórios do Prisma para a API', () => {
    const log = makeAuditEntry();
    const result = mapToApiAuditEntry(log);

    // Campos obrigatórios conforme AC 1.5
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('certificateId');
    expect(result).toHaveProperty('certCn');
    expect(result).toHaveProperty('action');
    expect(result).toHaveProperty('actor');
    expect(result).toHaveProperty('result');
    expect(result).toHaveProperty('detail');
    expect(result).toHaveProperty('changes');
    expect(result).toHaveProperty('timestamp');
  });

  it('deve converter timestamp para formato ISO-8601 (UTC)', () => {
    const log = makeAuditEntry({
      timestamp: new Date('2025-06-10T08:00:00.000Z'),
    });
    const result = mapToApiAuditEntry(log);

    expect(result.timestamp).toBe('2025-06-10T08:00:00.000Z');
    // Verifica formato ISO-8601
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('deve preservar certificateId null quando certificado foi removido', () => {
    const log = makeAuditEntry({ certificateId: null });
    const result = mapToApiAuditEntry(log);
    expect(result.certificateId).toBeNull();
  });

  it('deve mapear action enum corretamente (CREATE, UPDATE, DELETE, REVOKE, IMPORT, EXPORT)', () => {
    const actions = ['CREATE', 'UPDATE', 'DELETE', 'REVOKE', 'IMPORT', 'EXPORT'] as const;
    for (const action of actions) {
      const log = makeAuditEntry({ action });
      const result = mapToApiAuditEntry(log);
      expect(result.action).toBe(action);
    }
  });

  it('deve mapear result para SUCCESS ou FAILURE', () => {
    const successLog = makeAuditEntry({ result: 'SUCCESS' });
    const failureLog = makeAuditEntry({ result: 'FAILURE' });

    expect(mapToApiAuditEntry(successLog).result).toBe('SUCCESS');
    expect(mapToApiAuditEntry(failureLog).result).toBe('FAILURE');
  });
});

// ─── Cenário 1.2: Registrar falha com detalhes ─────────────────────────────

describe('C6-F1.2: AuditService.log — registro de falha', () => {
  let service: AuditService;
  let mocks: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    const mockRepo = makeMockRepo();
    service = new AuditService(mockRepo.repo);
    mocks = mockRepo.mocks;
  });

  it('deve registrar evento de falha com status=FAILURE e motivo em detail', async () => {
    const created = makeAuditEntry({
      result: 'FAILURE',
      detail: 'Import failed | error: Invalid PEM format',
    });
    mocks.create.mockResolvedValue(created);

    const params: AuditLogParams = {
      actor: 'system',
      action: 'CREATE',
      certificateCn: 'bad-cert.pem',
      result: 'FAILURE',
      detail: 'Import failed',
      errorReason: 'Invalid PEM format',
    };

    const result = await service.log(params);

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'FAILURE',
        detail: 'Import failed | error: Invalid PEM format',
      }),
    );
    expect(result.result).toBe('FAILURE');
  });

  it('NÃO deve incluir senha ou dados sensíveis no campo detail', async () => {
    const created = makeAuditEntry({
      detail: 'Login failed | error: invalid_credentials',
    });
    mocks.create.mockResolvedValue(created);

    await service.log({
      actor: 'user@example.com',
      action: 'CREATE',
      certificateCn: 'login-attempt',
      result: 'FAILURE',
      detail: 'Login failed',
      errorReason: 'invalid_credentials',
    });

    const callArgs = mocks.create.mock.calls[0][0];
    expect(callArgs.detail).not.toContain('password');
    expect(callArgs.detail).not.toContain('secret');
  });
});

// ─── NF.3: Sanitização de dados sensíveis ──────────────────────────────────

describe('C6-NF.3: sanitizeForAudit — dados sensíveis', () => {
  it('deve redactar password, privateKey, pemData', () => {
    const input = {
      commonName: 'test.example.com',
      password: 'super-secret',
      privateKey: '-----BEGIN PRIVATE KEY-----',
      pemData: '-----BEGIN CERTIFICATE-----',
    };

    const result = sanitizeForAudit(input);

    expect(result.commonName).toBe('test.example.com');
    expect(result.password).toBe('[REDACTED]');
    expect(result.privateKey).toBe('[REDACTED]');
    expect(result.pemData).toBe('[REDACTED]');
  });

  it('deve redactar campos snake_case (pem_data, private_key)', () => {
    const result = sanitizeForAudit({
      pem_data: 'cert-content',
      private_key: 'key-content',
    });
    expect(result.pem_data).toBe('[REDACTED]');
    expect(result.private_key).toBe('[REDACTED]');
  });

  it('deve sanitizar recursivamente objetos aninhados', () => {
    const input = {
      changes: {
        before: { pemData: 'old-pem', commonName: 'old.example.com' },
        after: { pemData: 'new-pem', commonName: 'new.example.com' },
      },
    };

    const result = sanitizeForAudit(input);
    const changes = result.changes as Record<string, Record<string, unknown>>;

    expect(changes.before.pemData).toBe('[REDACTED]');
    expect(changes.after.pemData).toBe('[REDACTED]');
    expect(changes.before.commonName).toBe('old.example.com');
    expect(changes.after.commonName).toBe('new.example.com');
  });

  it('deve preservar arrays sem recursão', () => {
    const input = { sans: ['a.example.com', 'b.example.com'] };
    const result = sanitizeForAudit(input);
    expect(result.sans).toEqual(['a.example.com', 'b.example.com']);
  });

  it('deve lidar com objeto vazio', () => {
    expect(sanitizeForAudit({})).toEqual({});
  });
});

// ─── Cenários 2.x: Cobertura de eventos ────────────────────────────────────

describe('C6-F2: AuditService.log — cobertura de eventos de certificado', () => {
  let service: AuditService;
  let mocks: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    const mockRepo = makeMockRepo();
    service = new AuditService(mockRepo.repo);
    mocks = mockRepo.mocks;
  });

  it('C6-F2.1: deve registrar evento de importação de certificado com resource_type e resource_id', async () => {
    const created = makeAuditEntry({
      action: 'CREATE',
      certificateId: 'cert-new',
      certCn: 'api.example.com',
      detail: 'Certificate imported from PEM',
    });
    mocks.create.mockResolvedValue(created);

    await service.log({
      actor: 'admin',
      action: 'CREATE',
      certificateId: 'cert-new',
      certificateCn: 'api.example.com',
      result: 'SUCCESS',
      detail: 'Certificate imported from PEM',
    });

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        certificateId: 'cert-new',
        certCn: 'api.example.com',
        action: 'CREATE',
        result: 'SUCCESS',
      }),
    );
  });

  it('C6-F2.6: deve registrar evento de download/export de certificado', async () => {
    const created = makeAuditEntry({
      action: 'EXPORT',
      certCn: 'api.example.com',
      detail: 'Certificate exported as PEM',
    });
    mocks.create.mockResolvedValue(created);

    const result = await service.log({
      actor: 'user1',
      action: 'EXPORT',
      certificateId: 'cert-001',
      certificateCn: 'api.example.com',
      result: 'SUCCESS',
      detail: 'Certificate exported as PEM',
    });

    expect(result.action).toBe('EXPORT');
  });

  it('deve registrar evento com batch ID para importação em lote', async () => {
    const created = makeAuditEntry({
      action: 'CREATE',
      detail: 'CSV bulk import | batch: batch-uuid-123',
    });
    mocks.create.mockResolvedValue(created);

    await service.log({
      actor: 'admin',
      action: 'CREATE',
      certificateCn: 'bulk-cert.example.com',
      result: 'SUCCESS',
      detail: 'CSV bulk import',
      batchId: 'batch-uuid-123',
    });

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: 'CSV bulk import | batch: batch-uuid-123',
      }),
    );
  });

  it('deve registrar certificateId=null quando não fornecido', async () => {
    const created = makeAuditEntry({ certificateId: null });
    mocks.create.mockResolvedValue(created);

    await service.log({
      actor: 'admin',
      action: 'DELETE',
      certificateCn: 'removed.example.com',
      result: 'SUCCESS',
    });

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ certificateId: null }),
    );
  });

  it('deve produzir detail vazio quando nenhum campo extra é fornecido', async () => {
    const created = makeAuditEntry({ detail: '' });
    mocks.create.mockResolvedValue(created);

    await service.log({
      actor: 'admin',
      action: 'UPDATE',
      certificateCn: 'test.example.com',
      certificateId: 'cert-001',
      result: 'SUCCESS',
    });

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ detail: '' }),
    );
  });
});

// ─── Cenários 3.x: Consulta de auditoria — getEntries ──────────────────────

describe('C6-F3: AuditService.getEntries — consulta e filtros', () => {
  let service: AuditService;
  let mocks: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    const mockRepo = makeMockRepo();
    service = new AuditService(mockRepo.repo);
    mocks = mockRepo.mocks;
  });

  it('C6-F3.1: deve retornar eventos filtrados por certificateId com paginação', async () => {
    const entries = [makeAuditEntry({ certificateId: 'cert-target' })];
    mocks.findMany.mockResolvedValue({ data: entries, total: 1 });

    const result = await service.getEntries({ certificateId: 'cert-target' });

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(result.totalPages).toBe(1);
    // Verifica que filtro foi passado ao repo
    const callFilters = mocks.findMany.mock.calls[0][0];
    expect(callFilters.certificateId).toBe('cert-target');
  });

  it('C6-F3.2: deve aceitar filtro por período (dateFrom, dateTo)', async () => {
    mocks.findMany.mockResolvedValue({ data: [], total: 0 });

    await service.getEntries({
      dateFrom: '2026-01-01',
      dateTo: '2026-06-30',
    });

    const callFilters = mocks.findMany.mock.calls[0][0];
    expect(callFilters.dateFrom).toBe('2026-01-01');
    expect(callFilters.dateTo).toBe('2026-06-30');
  });

  it('C6-F3.3: deve aceitar filtro por usuário (actor)', async () => {
    const entries = [makeAuditEntry({ actor: 'john@example.com' })];
    mocks.findMany.mockResolvedValue({ data: entries, total: 1 });

    await service.getEntries({ actor: 'john@example.com' });

    const callFilters = mocks.findMany.mock.calls[0][0];
    expect(callFilters.actor).toBe('john@example.com');
  });

  it('C6-F3.4: deve aceitar filtro por ação', async () => {
    mocks.findMany.mockResolvedValue({ data: [], total: 0 });

    await service.getEntries({ action: 'CREATE' });

    const callFilters = mocks.findMany.mock.calls[0][0];
    expect(callFilters.action).toBe('CREATE');
  });

  it('C6-F3.5: deve aceitar filtro por resultado (result)', async () => {
    mocks.findMany.mockResolvedValue({ data: [], total: 0 });

    await service.getEntries({ result: 'FAILURE' });

    const callFilters = mocks.findMany.mock.calls[0][0];
    expect(callFilters.result).toBe('FAILURE');
  });

  it('C6-F3.7: deve suportar paginação (page, pageSize)', async () => {
    mocks.findMany.mockResolvedValue({ data: [], total: 500 });

    const result = await service.getEntries({
      page: '1',
      pageSize: '50',
    });

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
    expect(result.total).toBe(500);
    expect(result.totalPages).toBe(10);

    // Verifica skip/take passados ao repo
    const callPagination = mocks.findMany.mock.calls[0][1];
    expect(callPagination.skip).toBe(0);
    expect(callPagination.take).toBe(50);
  });

  it('C6-F3.7: paginação offset deve funcionar corretamente', async () => {
    mocks.findMany.mockResolvedValue({ data: [], total: 500 });

    await service.getEntries({ page: '2', pageSize: '50' });

    const callPagination = mocks.findMany.mock.calls[0][1];
    expect(callPagination.skip).toBe(50);
    expect(callPagination.take).toBe(50);
  });

  it('C6-F3.8: deve usar timestamp DESC como ordenação padrão (via repo)', async () => {
    // O repo já ordena por timestamp desc — verificamos que os dados voltam mapeados
    const entries = [
      makeAuditEntry({ id: 'a-recent', timestamp: new Date('2025-06-15T14:00:00Z') }),
      makeAuditEntry({ id: 'a-old', timestamp: new Date('2025-01-01T10:00:00Z') }),
    ];
    mocks.findMany.mockResolvedValue({ data: entries, total: 2 });

    const result = await service.getEntries({});

    expect(result.data).toHaveLength(2);
    expect(result.data[0].id).toBe('a-recent');
    expect(result.data[1].id).toBe('a-old');
  });

  it('deve combinar múltiplos filtros simultaneamente', async () => {
    mocks.findMany.mockResolvedValue({ data: [], total: 0 });

    await service.getEntries({
      action: 'CREATE',
      actor: 'admin',
      certificateId: 'cert-001',
      batchId: 'batch-abc',
      dateFrom: '2025-01-01',
      dateTo: '2025-12-31',
      result: 'SUCCESS',
    });

    const callFilters = mocks.findMany.mock.calls[0][0];
    expect(callFilters).toEqual({
      action: 'CREATE',
      actor: 'admin',
      certificateId: 'cert-001',
      batchId: 'batch-abc',
      dateFrom: '2025-01-01',
      dateTo: '2025-12-31',
      result: 'SUCCESS',
    });
  });

  it('deve retornar lista vazia quando nenhum filtro combina', async () => {
    mocks.findMany.mockResolvedValue({ data: [], total: 0 });

    const result = await service.getEntries({});

    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
  });

  it('deve calcular totalPages corretamente', async () => {
    mocks.findMany.mockResolvedValue({ data: [], total: 55 });

    const result = await service.getEntries({ page: '1', pageSize: '10' });

    expect(result.totalPages).toBe(6);
  });
});

// ─── Cenário 3.9: Detalhes de evento único (via getByBatchId) ──────────────

describe('C6-F3.9: AuditService.getByBatchId — detalhe por batch', () => {
  let service: AuditService;
  let mocks: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    const mockRepo = makeMockRepo();
    service = new AuditService(mockRepo.repo);
    mocks = mockRepo.mocks;
  });

  it('deve retornar todos os eventos de um batch com timestamps ISO', async () => {
    const entries = [
      makeAuditEntry({ id: 'a-1', timestamp: new Date('2025-06-15T14:00:00.000Z') }),
      makeAuditEntry({ id: 'a-2', timestamp: new Date('2025-06-15T14:01:00.000Z') }),
    ];
    mocks.findByBatchId.mockResolvedValue(entries);

    const result = await service.getByBatchId('batch-123');

    expect(result).toHaveLength(2);
    expect(result[0].timestamp).toBe('2025-06-15T14:00:00.000Z');
    expect(result[1].timestamp).toBe('2025-06-15T14:01:00.000Z');
    expect(mocks.findByBatchId).toHaveBeenCalledWith('batch-123');
  });

  it('deve retornar array vazio quando nenhum batch combina', async () => {
    mocks.findByBatchId.mockResolvedValue([]);

    const result = await service.getByBatchId('nonexistent-batch');

    expect(result).toEqual([]);
  });
});
