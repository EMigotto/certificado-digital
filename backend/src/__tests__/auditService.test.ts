import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AuditService,
  mapToApiAuditEntry,
  sanitizeForAudit,
  type AuditLogParams,
} from '../services/auditService.js';
import type { AuditRepository } from '../repositories/auditRepo.js';
import type { AuditEntry } from '@prisma/client';

// ─── Test helpers ────────────────────────────────────────────────────────────

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

// ─── Unit tests: mapToApiAuditEntry ──────────────────────────────────────────

describe('mapToApiAuditEntry', () => {
  it('should map Prisma AuditEntry to API AuditEntry with ISO timestamp', () => {
    const log = makeAuditEntry();
    const result = mapToApiAuditEntry(log);

    expect(result.id).toBe('audit-001');
    expect(result.certificateId).toBe('cert-001');
    expect(result.certCn).toBe('test.example.com');
    expect(result.action).toBe('CREATE');
    expect(result.actor).toBe('admin');
    expect(result.result).toBe('SUCCESS');
    expect(result.detail).toBe('Certificate imported from file: cert.pem');
    expect(result.timestamp).toBe('2025-01-15T10:30:00.000Z');
  });

  it('should handle null certId', () => {
    const log = makeAuditEntry({ certificateId: null });
    const result = mapToApiAuditEntry(log);
    expect(result.certificateId).toBeNull();
  });

  it('should handle FAILURE result', () => {
    const log = makeAuditEntry({ result: 'FAILURE', detail: 'Import failed: invalid cert' });
    const result = mapToApiAuditEntry(log);
    expect(result.result).toBe('FAILURE');
    expect(result.detail).toContain('failed');
  });
});

// ─── Unit tests: sanitizeForAudit ────────────────────────────────────────────

describe('sanitizeForAudit', () => {
  it('should redact sensitive fields (password, privateKey, pemData)', () => {
    const input = {
      commonName: 'test.example.com',
      password: 'secret123',
      privateKey: '-----BEGIN PRIVATE KEY-----',
      pemData: '-----BEGIN CERTIFICATE-----',
    };

    const result = sanitizeForAudit(input);

    expect(result.commonName).toBe('test.example.com');
    expect(result.password).toBe('[REDACTED]');
    expect(result.privateKey).toBe('[REDACTED]');
    expect(result.pemData).toBe('[REDACTED]');
  });

  it('should pass through non-sensitive fields', () => {
    const input = {
      commonName: 'test.example.com',
      issuer: 'CN=Test CA',
      serial: 'AABBCCDD',
    };

    const result = sanitizeForAudit(input);

    expect(result.commonName).toBe('test.example.com');
    expect(result.issuer).toBe('CN=Test CA');
    expect(result.serial).toBe('AABBCCDD');
  });

  it('should recursively sanitize nested objects', () => {
    const input = {
      changes: {
        before: { pemData: 'old-pem', commonName: 'old.example.com' },
        after: { pemData: 'new-pem', commonName: 'new.example.com' },
      },
    };

    const result = sanitizeForAudit(input);
    const changes = result.changes as Record<string, Record<string, unknown>>;

    expect(changes.before.pemData).toBe('[REDACTED]');
    expect(changes.before.commonName).toBe('old.example.com');
    expect(changes.after.pemData).toBe('[REDACTED]');
    expect(changes.after.commonName).toBe('new.example.com');
  });

  it('should handle arrays without recursion', () => {
    const input = {
      sans: ['a.example.com', 'b.example.com'],
      tags: { team: 'platform' },
    };

    const result = sanitizeForAudit(input);

    expect(result.sans).toEqual(['a.example.com', 'b.example.com']);
    expect(result.tags).toEqual({ team: 'platform' });
  });

  it('should handle empty object', () => {
    const result = sanitizeForAudit({});
    expect(result).toEqual({});
  });

  it('should redact pem_data (snake_case variant)', () => {
    const input = { pem_data: 'cert-content', private_key: 'key-content' };
    const result = sanitizeForAudit(input);
    expect(result.pem_data).toBe('[REDACTED]');
    expect(result.private_key).toBe('[REDACTED]');
  });
});

// ─── Unit tests: AuditService.log ────────────────────────────────────────────

describe('AuditService.log', () => {
  let service: AuditService;
  let mocks: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    const mockRepo = makeMockRepo();
    service = new AuditService(mockRepo.repo);
    mocks = mockRepo.mocks;
  });

  it('should create an audit entry with basic params', async () => {
    const created = makeAuditEntry();
    mocks.create.mockResolvedValue(created);

    const params: AuditLogParams = {
      actor: 'admin',
      action: 'CREATE',
      certificateCn: 'test.example.com',
      certificateId: 'cert-001',
      result: 'SUCCESS',
      detail: 'Certificate imported',
    };

    const result = await service.log(params);

    expect(mocks.create).toHaveBeenCalledWith({
      certificateId: 'cert-001',
      certCn: 'test.example.com',
      action: 'CREATE',
      actor: 'admin',
      result: 'SUCCESS',
      detail: 'Certificate imported',
    });

    expect(result.id).toBe('audit-001');
    expect(result.action).toBe('CREATE');
    expect(typeof result.timestamp).toBe('string');
  });

  it('should include batchId in detail string', async () => {
    const created = makeAuditEntry({
      detail: 'CSV import | batch: abc-123-def',
    });
    mocks.create.mockResolvedValue(created);

    await service.log({
      actor: 'admin',
      action: 'CREATE',
      certificateCn: 'test.example.com',
      result: 'SUCCESS',
      detail: 'CSV import',
      batchId: 'abc-123-def',
    });

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: 'CSV import | batch: abc-123-def',
      }),
    );
  });

  it('should include errorReason in detail string for failures', async () => {
    const created = makeAuditEntry({
      result: 'FAILURE',
      detail: 'Import failed | error: Invalid PEM format',
    });
    mocks.create.mockResolvedValue(created);

    await service.log({
      actor: 'system',
      action: 'CREATE',
      certificateCn: 'bad-cert.pem',
      result: 'FAILURE',
      detail: 'Import failed',
      errorReason: 'Invalid PEM format',
    });

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'FAILURE',
        detail: 'Import failed | error: Invalid PEM format',
      }),
    );
  });

  it('should include both batchId and errorReason when present', async () => {
    const created = makeAuditEntry({ detail: 'Row failed | batch: b-1 | error: parse error' });
    mocks.create.mockResolvedValue(created);

    await service.log({
      actor: 'admin',
      action: 'CREATE',
      certificateCn: 'row5.example.com',
      result: 'FAILURE',
      detail: 'Row failed',
      batchId: 'b-1',
      errorReason: 'parse error',
    });

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: 'Row failed | batch: b-1 | error: parse error',
      }),
    );
  });

  it('should default certificateId to null when not provided', async () => {
    const created = makeAuditEntry({ certificateId: null });
    mocks.create.mockResolvedValue(created);

    await service.log({
      actor: 'admin',
      action: 'CREATE',
      certificateCn: 'batch-import',
      result: 'SUCCESS',
    });

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        certificateId: null,
      }),
    );
  });

  it('should produce detail with no separator when only detail is provided', async () => {
    const created = makeAuditEntry();
    mocks.create.mockResolvedValue(created);

    await service.log({
      actor: 'admin',
      action: 'DELETE',
      certificateCn: 'test.example.com',
      certificateId: 'cert-001',
      result: 'SUCCESS',
      detail: 'Certificate revoked',
    });

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: 'Certificate revoked',
      }),
    );
  });

  it('should produce empty detail when no detail/batch/error provided', async () => {
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
      expect.objectContaining({
        detail: '',
      }),
    );
  });
});

// ─── Unit tests: AuditService.getEntries ────────────────────────────────────

describe('AuditService.getEntries', () => {
  let service: AuditService;
  let mocks: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    const mockRepo = makeMockRepo();
    service = new AuditService(mockRepo.repo);
    mocks = mockRepo.mocks;
  });

  it('should return paginated response with defaults', async () => {
    const entries = [makeAuditEntry()];
    mocks.findMany.mockResolvedValue({ data: entries, total: 1 });

    const result = await service.getEntries({});

    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(result.total).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('audit-001');
    expect(typeof result.data[0].timestamp).toBe('string');
  });

  it('should pass pagination params correctly', async () => {
    mocks.findMany.mockResolvedValue({ data: [], total: 0 });

    await service.getEntries({ page: '3', pageSize: '10' });

    const call = mocks.findMany.mock.calls[0];
    expect(call[1]).toEqual({ page: 3, pageSize: 10, skip: 20, take: 10 });
  });

  it('should pass all filter params to the repository', async () => {
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

    const call = mocks.findMany.mock.calls[0];
    const filters = call[0];
    expect(filters).toEqual({
      action: 'CREATE',
      actor: 'admin',
      certificateId: 'cert-001',
      batchId: 'batch-abc',
      dateFrom: '2025-01-01',
      dateTo: '2025-12-31',
      result: 'SUCCESS',
    });
  });

  it('should handle empty filters gracefully', async () => {
    mocks.findMany.mockResolvedValue({ data: [], total: 0 });

    const result = await service.getEntries({});

    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
  });

  it('should map multiple entries correctly', async () => {
    const entries = [
      makeAuditEntry({ id: 'a-1', action: 'CREATE' }),
      makeAuditEntry({ id: 'a-2', action: 'DELETE' }),
      makeAuditEntry({ id: 'a-3', action: 'REVOKE', result: 'FAILURE' }),
    ];
    mocks.findMany.mockResolvedValue({ data: entries, total: 3 });

    const result = await service.getEntries({});

    expect(result.data).toHaveLength(3);
    expect(result.data[0].id).toBe('a-1');
    expect(result.data[1].action).toBe('DELETE');
    expect(result.data[2].result).toBe('FAILURE');
  });

  it('should calculate totalPages correctly', async () => {
    mocks.findMany.mockResolvedValue({ data: [], total: 55 });

    const result = await service.getEntries({ page: '1', pageSize: '10' });

    expect(result.totalPages).toBe(6);
    expect(result.total).toBe(55);
  });
});

// ─── Unit tests: AuditService.getByBatchId ──────────────────────────────────

describe('AuditService.getByBatchId', () => {
  let service: AuditService;
  let mocks: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    const mockRepo = makeMockRepo();
    service = new AuditService(mockRepo.repo);
    mocks = mockRepo.mocks;
  });

  it('should return all entries for a given batch ID', async () => {
    const entries = [
      makeAuditEntry({ id: 'a-1', detail: 'CSV bulk import (batch: batch-abc)' }),
      makeAuditEntry({ id: 'a-2', detail: 'CSV bulk import (batch: batch-abc)' }),
    ];
    mocks.findByBatchId.mockResolvedValue(entries);

    const result = await service.getByBatchId('batch-abc');

    expect(mocks.findByBatchId).toHaveBeenCalledWith('batch-abc');
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('a-1');
    expect(result[1].id).toBe('a-2');
  });

  it('should return empty array when no entries match', async () => {
    mocks.findByBatchId.mockResolvedValue([]);

    const result = await service.getByBatchId('nonexistent-batch');

    expect(result).toEqual([]);
  });

  it('should map entries to API format with ISO timestamps', async () => {
    const entries = [makeAuditEntry({ timestamp: new Date('2025-06-15T14:00:00.000Z') })];
    mocks.findByBatchId.mockResolvedValue(entries);

    const result = await service.getByBatchId('batch-123');

    expect(result[0].timestamp).toBe('2025-06-15T14:00:00.000Z');
  });
});
