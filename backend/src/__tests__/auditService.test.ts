import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AuditService,
  mapToApiAuditEntry,
  sanitizeForAudit,
} from '../services/auditService.js';
import type { AuditRepository } from '../repositories/auditRepo.js';
import type { AuditLog } from '@prisma/client';

// ─── Test helpers ───────────────────────────────────────────────────────────

function makeAuditLog(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: 'audit-001',
    certId: 'cert-001',
    certCn: 'test.example.com',
    action: 'CREATE',
    actor: 'admin',
    result: 'SUCCESS',
    detail: 'Certificate imported from file: cert.pem',
    batchId: null,
    timestamp: new Date('2025-06-01T12:00:00.000Z'),
    ...overrides,
  };
}

function makeMockRepo(): {
  repo: AuditRepository;
  mocks: Record<string, ReturnType<typeof vi.fn>>;
} {
  const mocks = {
    create: vi.fn(),
    createInTransaction: vi.fn(),
    findMany: vi.fn(),
    findByBatchId: vi.fn(),
    buildWhereClause: vi.fn(),
  };

  return {
    repo: mocks as unknown as AuditRepository,
    mocks,
  };
}

// ─── Unit tests: mapToApiAuditEntry ─────────────────────────────────────────

describe('mapToApiAuditEntry', () => {
  it('should map Prisma AuditLog to AuditLogEntry with ISO timestamp', () => {
    const entry = makeAuditLog();
    const result = mapToApiAuditEntry(entry);

    expect(result.id).toBe('audit-001');
    expect(result.certId).toBe('cert-001');
    expect(result.certCn).toBe('test.example.com');
    expect(result.action).toBe('CREATE');
    expect(result.actor).toBe('admin');
    expect(result.result).toBe('SUCCESS');
    expect(result.detail).toContain('cert.pem');
    expect(result.batchId).toBeNull();
    expect(result.timestamp).toBe('2025-06-01T12:00:00.000Z');
  });

  it('should handle null certId', () => {
    const entry = makeAuditLog({ certId: null });
    const result = mapToApiAuditEntry(entry);
    expect(result.certId).toBeNull();
  });

  it('should include batchId when present', () => {
    const entry = makeAuditLog({ batchId: 'batch-123' });
    const result = mapToApiAuditEntry(entry);
    expect(result.batchId).toBe('batch-123');
  });

  it('should preserve millisecond precision in timestamps', () => {
    const entry = makeAuditLog({
      timestamp: new Date('2025-06-01T12:00:00.123Z'),
    });
    const result = mapToApiAuditEntry(entry);
    expect(result.timestamp).toBe('2025-06-01T12:00:00.123Z');
  });
});

// ─── Unit tests: sanitizeForAudit ───────────────────────────────────────────

describe('sanitizeForAudit', () => {
  it('should redact password fields', () => {
    const obj = { password: 'secret123', username: 'admin' };
    const result = sanitizeForAudit(obj);
    expect(result.password).toBe('[REDACTED]');
    expect(result.username).toBe('admin');
  });

  it('should redact pemData fields', () => {
    const obj = {
      pemData: '-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----',
      commonName: 'test.example.com',
    };
    const result = sanitizeForAudit(obj);
    expect(result.pemData).toBe('[REDACTED]');
    expect(result.commonName).toBe('test.example.com');
  });

  it('should redact privateKey fields', () => {
    const obj = { privateKey: 'RSA PRIVATE KEY DATA', algorithm: 'RSA-2048' };
    const result = sanitizeForAudit(obj);
    expect(result.privateKey).toBe('[REDACTED]');
    expect(result.algorithm).toBe('RSA-2048');
  });

  it('should redact secret and passphrase fields', () => {
    const obj = { secret: 'top-secret', passphrase: 'p@ss' };
    const result = sanitizeForAudit(obj);
    expect(result.secret).toBe('[REDACTED]');
    expect(result.passphrase).toBe('[REDACTED]');
  });

  it('should redact pem_data and private_key (snake_case)', () => {
    const obj = { pem_data: 'CERT', private_key: 'KEY' };
    const result = sanitizeForAudit(obj);
    expect(result.pem_data).toBe('[REDACTED]');
    expect(result.private_key).toBe('[REDACTED]');
  });

  it('should recursively strip nested sensitive fields', () => {
    const obj = {
      before: { pemData: 'old-pem', commonName: 'old.example.com' },
      after: { pemData: 'new-pem', commonName: 'new.example.com' },
    };
    const result = sanitizeForAudit(obj);
    const before = result.before as Record<string, unknown>;
    const after = result.after as Record<string, unknown>;
    expect(before.pemData).toBe('[REDACTED]');
    expect(before.commonName).toBe('old.example.com');
    expect(after.pemData).toBe('[REDACTED]');
    expect(after.commonName).toBe('new.example.com');
  });

  it('should preserve arrays and primitives', () => {
    const obj = { tags: ['a', 'b'], count: 5, active: true };
    const result = sanitizeForAudit(obj);
    expect(result.tags).toEqual(['a', 'b']);
    expect(result.count).toBe(5);
    expect(result.active).toBe(true);
  });

  it('should handle empty object', () => {
    const result = sanitizeForAudit({});
    expect(result).toEqual({});
  });
});

// ─── Unit tests: AuditService ───────────────────────────────────────────────

describe('AuditService', () => {
  let service: AuditService;
  let mocks: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    const mockRepo = makeMockRepo();
    service = new AuditService(mockRepo.repo);
    mocks = mockRepo.mocks;
  });

  // ── log() ───────────────────────────────────────────────────────────────

  describe('log', () => {
    it('should create an audit entry with basic fields', async () => {
      const created = makeAuditLog();
      mocks.create.mockResolvedValue(created);

      const result = await service.log({
        actor: 'admin',
        action: 'CREATE',
        certificateId: 'cert-001',
        certificateCn: 'test.example.com',
        result: 'SUCCESS',
        detail: 'Certificate imported from file: cert.pem',
      });

      expect(mocks.create).toHaveBeenCalledWith({
        certId: 'cert-001',
        certCn: 'test.example.com',
        action: 'CREATE',
        actor: 'admin',
        result: 'SUCCESS',
        detail: 'Certificate imported from file: cert.pem',
        batchId: null,
      });

      expect(result.id).toBe('audit-001');
      expect(result.action).toBe('CREATE');
      expect(result.result).toBe('SUCCESS');
    });

    it('should include batchId when provided', async () => {
      const created = makeAuditLog({ batchId: 'batch-uuid-123' });
      mocks.create.mockResolvedValue(created);

      const result = await service.log({
        actor: 'system',
        action: 'CREATE',
        certificateId: 'cert-001',
        certificateCn: 'bulk.example.com',
        batchId: 'batch-uuid-123',
        result: 'SUCCESS',
        detail: 'CSV import',
      });

      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          batchId: 'batch-uuid-123',
        }),
      );
      expect(result.batchId).toBe('batch-uuid-123');
    });

    it('should log failures with error reason', async () => {
      const created = makeAuditLog({
        result: 'FAILURE',
        detail: 'Import failed | error: Invalid PEM format',
      });
      mocks.create.mockResolvedValue(created);

      const result = await service.log({
        actor: 'admin',
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
      expect(result.result).toBe('FAILURE');
    });

    it('should strip sensitive data from metadata', async () => {
      const created = makeAuditLog();
      mocks.create.mockResolvedValue(created);

      await service.log({
        actor: 'admin',
        action: 'CREATE',
        certificateCn: 'test.example.com',
        result: 'SUCCESS',
        detail: 'Imported',
        metadata: {
          filename: 'cert.pem',
          pemData: 'SHOULD_BE_REDACTED',
          password: 'SHOULD_BE_REDACTED',
          owner: 'teamA',
        },
      });

      const call = mocks.create.mock.calls[0][0];
      expect(call.detail).toContain('metadata:');
      expect(call.detail).not.toContain('SHOULD_BE_REDACTED');
      expect(call.detail).toContain('[REDACTED]');
      expect(call.detail).toContain('teamA');
    });

    it('should handle null certificateId for failed imports', async () => {
      const created = makeAuditLog({ certId: null });
      mocks.create.mockResolvedValue(created);

      const result = await service.log({
        actor: 'system',
        action: 'CREATE',
        certificateId: null,
        certificateCn: 'unknown.pem',
        result: 'FAILURE',
        errorReason: 'Unsupported format',
      });

      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          certId: null,
        }),
      );
      expect(result.certId).toBeNull();
    });

    it('should default batchId to null when not provided', async () => {
      const created = makeAuditLog();
      mocks.create.mockResolvedValue(created);

      await service.log({
        actor: 'admin',
        action: 'DELETE',
        certificateId: 'cert-001',
        certificateCn: 'test.example.com',
        result: 'SUCCESS',
      });

      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          batchId: null,
        }),
      );
    });

    it('should combine detail, errorReason and metadata in detail string', async () => {
      const created = makeAuditLog();
      mocks.create.mockResolvedValue(created);

      await service.log({
        actor: 'admin',
        action: 'CREATE',
        certificateCn: 'test.example.com',
        result: 'FAILURE',
        detail: 'Import attempt',
        errorReason: 'Parse error',
        metadata: { source: 'api' },
      });

      const call = mocks.create.mock.calls[0][0];
      expect(call.detail).toContain('Import attempt');
      expect(call.detail).toContain('error: Parse error');
      expect(call.detail).toContain('metadata:');
      expect(call.detail).toContain('"source":"api"');
    });
  });

  // ── getEntries() ────────────────────────────────────────────────────────

  describe('getEntries', () => {
    it('should return paginated response with defaults', async () => {
      const entries = [makeAuditLog()];
      mocks.findMany.mockResolvedValue({ data: entries, total: 1 });

      const result = await service.getEntries({});

      expect(mocks.findMany).toHaveBeenCalledTimes(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(25);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].certCn).toBe('test.example.com');
      expect(typeof result.data[0].timestamp).toBe('string');
    });

    it('should pass pagination params correctly', async () => {
      mocks.findMany.mockResolvedValue({ data: [], total: 0 });

      await service.getEntries({ page: '3', pageSize: '10' });

      const call = mocks.findMany.mock.calls[0];
      expect(call[1]).toEqual({ page: 3, pageSize: 10, skip: 20, take: 10 });
    });

    it('should pass filter params for action', async () => {
      mocks.findMany.mockResolvedValue({ data: [], total: 0 });

      await service.getEntries({ action: 'CREATE' });

      const call = mocks.findMany.mock.calls[0];
      expect(call[0].action).toBe('CREATE');
    });

    it('should pass filter params for actor', async () => {
      mocks.findMany.mockResolvedValue({ data: [], total: 0 });

      await service.getEntries({ actor: 'admin' });

      const call = mocks.findMany.mock.calls[0];
      expect(call[0].actor).toBe('admin');
    });

    it('should pass filter params for certificateId', async () => {
      mocks.findMany.mockResolvedValue({ data: [], total: 0 });

      await service.getEntries({ certificateId: 'cert-001' });

      const call = mocks.findMany.mock.calls[0];
      expect(call[0].certificateId).toBe('cert-001');
    });

    it('should pass filter params for batchId', async () => {
      mocks.findMany.mockResolvedValue({ data: [], total: 0 });

      await service.getEntries({ batchId: 'batch-uuid-123' });

      const call = mocks.findMany.mock.calls[0];
      expect(call[0].batchId).toBe('batch-uuid-123');
    });

    it('should pass filter params for date range', async () => {
      mocks.findMany.mockResolvedValue({ data: [], total: 0 });

      await service.getEntries({
        dateFrom: '2025-01-01',
        dateTo: '2025-06-30',
      });

      const call = mocks.findMany.mock.calls[0];
      expect(call[0].dateFrom).toBe('2025-01-01');
      expect(call[0].dateTo).toBe('2025-06-30');
    });

    it('should pass filter params for result', async () => {
      mocks.findMany.mockResolvedValue({ data: [], total: 0 });

      await service.getEntries({ result: 'FAILURE' });

      const call = mocks.findMany.mock.calls[0];
      expect(call[0].result).toBe('FAILURE');
    });

    it('should handle multiple filters simultaneously', async () => {
      mocks.findMany.mockResolvedValue({ data: [], total: 0 });

      await service.getEntries({
        action: 'CREATE',
        actor: 'admin',
        result: 'SUCCESS',
        dateFrom: '2025-01-01',
        page: '1',
        pageSize: '50',
      });

      const [filters, pagination] = mocks.findMany.mock.calls[0];
      expect(filters.action).toBe('CREATE');
      expect(filters.actor).toBe('admin');
      expect(filters.result).toBe('SUCCESS');
      expect(filters.dateFrom).toBe('2025-01-01');
      expect(pagination.page).toBe(1);
      expect(pagination.pageSize).toBe(50);
    });

    it('should map entries to API format with ISO timestamps', async () => {
      const entries = [
        makeAuditLog({ timestamp: new Date('2025-06-01T12:00:00.500Z') }),
      ];
      mocks.findMany.mockResolvedValue({ data: entries, total: 1 });

      const result = await service.getEntries({});

      expect(result.data[0].timestamp).toBe('2025-06-01T12:00:00.500Z');
    });

    it('should include batchId in mapped entries', async () => {
      const entries = [makeAuditLog({ batchId: 'batch-abc' })];
      mocks.findMany.mockResolvedValue({ data: entries, total: 1 });

      const result = await service.getEntries({});

      expect(result.data[0].batchId).toBe('batch-abc');
    });

    it('should return empty response when no entries match', async () => {
      mocks.findMany.mockResolvedValue({ data: [], total: 0 });

      const result = await service.getEntries({ action: 'REVOKE' });

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(1);
    });
  });

  // ── getByBatchId() ──────────────────────────────────────────────────────

  describe('getByBatchId', () => {
    it('should return all entries for a batch', async () => {
      const batchId = 'batch-uuid-123';
      const entries = [
        makeAuditLog({ id: 'audit-1', batchId }),
        makeAuditLog({ id: 'audit-2', batchId, certCn: 'another.example.com' }),
        makeAuditLog({ id: 'audit-3', batchId, certCn: 'third.example.com' }),
      ];
      mocks.findByBatchId.mockResolvedValue(entries);

      const result = await service.getByBatchId(batchId);

      expect(mocks.findByBatchId).toHaveBeenCalledWith(batchId);
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('audit-1');
      expect(result[1].certCn).toBe('another.example.com');
      expect(result[2].certCn).toBe('third.example.com');
    });

    it('should return empty array when no entries found for batch', async () => {
      mocks.findByBatchId.mockResolvedValue([]);

      const result = await service.getByBatchId('nonexistent-batch');

      expect(result).toHaveLength(0);
    });

    it('should map all entries to API format', async () => {
      const entries = [
        makeAuditLog({
          timestamp: new Date('2025-06-01T12:00:00.100Z'),
          batchId: 'b',
        }),
      ];
      mocks.findByBatchId.mockResolvedValue(entries);

      const result = await service.getByBatchId('b');

      expect(result[0].timestamp).toBe('2025-06-01T12:00:00.100Z');
      expect(result[0].batchId).toBe('b');
      expect(typeof result[0].timestamp).toBe('string');
    });
  });
});
