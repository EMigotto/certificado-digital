import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlertRepository } from '../repositories/alertRepo.js';
import type { PrismaClient } from '@prisma/client';

// ─── Test helpers ────────────────────────────────────────────────────────────

function createMockPrisma() {
  const mockAlertFindMany = vi.fn();
  const mockAlertFindUnique = vi.fn();
  const mockAlertCount = vi.fn();
  const mockAlertCreate = vi.fn();
  const mockAlertUpdate = vi.fn();
  const mockAlertUpsert = vi.fn();
  const mockNotificationCreate = vi.fn();
  const mockTransaction = vi.fn();

  const prisma = {
    expirationAlert: {
      findMany: mockAlertFindMany,
      findUnique: mockAlertFindUnique,
      count: mockAlertCount,
      create: mockAlertCreate,
      update: mockAlertUpdate,
      upsert: mockAlertUpsert,
    },
    notificationRecord: {
      create: mockNotificationCreate,
    },
    $transaction: mockTransaction,
  } as unknown as PrismaClient;

  return {
    prisma,
    mocks: {
      alertFindMany: mockAlertFindMany,
      alertFindUnique: mockAlertFindUnique,
      alertCount: mockAlertCount,
      alertCreate: mockAlertCreate,
      alertUpdate: mockAlertUpdate,
      alertUpsert: mockAlertUpsert,
      notificationCreate: mockNotificationCreate,
      transaction: mockTransaction,
    },
  };
}

// ─── Unit tests: buildWhereClause ───────────────────────────────────────────

describe('AlertRepository.buildWhereClause', () => {
  let repo: AlertRepository;

  beforeEach(() => {
    const { prisma } = createMockPrisma();
    repo = new AlertRepository(prisma);
  });

  it('should return empty object for no filters', () => {
    const where = repo.buildWhereClause({});
    expect(where).toEqual({});
  });

  it('should filter by status', () => {
    const where = repo.buildWhereClause({ status: 'PENDING' });
    expect(where).toEqual({ status: 'PENDING' });
  });

  it('should normalize status to uppercase', () => {
    const where = repo.buildWhereClause({ status: 'notified' });
    expect(where).toEqual({ status: 'NOTIFIED' });
  });

  it('should ignore invalid status values', () => {
    const where = repo.buildWhereClause({ status: 'INVALID' });
    expect(where).toEqual({});
  });

  it('should filter by threshold (exact match)', () => {
    const where = repo.buildWhereClause({ threshold: 30 });
    expect(where).toEqual({ threshold: 30 });
  });

  it('should filter by certificateId (exact match)', () => {
    const where = repo.buildWhereClause({ certificateId: 'cert-001' });
    expect(where).toEqual({ certificateId: 'cert-001' });
  });

  it('should ignore empty certificateId', () => {
    const where = repo.buildWhereClause({ certificateId: '   ' });
    expect(where).toEqual({});
  });

  it('should filter by dateFrom', () => {
    const where = repo.buildWhereClause({ dateFrom: '2025-01-01' });
    expect(where).toHaveProperty('triggeredAt');
    const ts = where.triggeredAt as { gte: Date };
    expect(ts.gte).toBeInstanceOf(Date);
    expect(ts.gte.toISOString()).toContain('2025-01-01');
  });

  it('should filter by dateTo (end of day)', () => {
    const where = repo.buildWhereClause({ dateTo: '2025-12-31' });
    expect(where).toHaveProperty('triggeredAt');
    const ts = where.triggeredAt as { lte: Date };
    expect(ts.lte).toBeInstanceOf(Date);
    expect(ts.lte.getHours()).toBe(23);
    expect(ts.lte.getMinutes()).toBe(59);
  });

  it('should skip invalid date strings', () => {
    const where = repo.buildWhereClause({ dateFrom: 'not-a-date' });
    expect(where).toEqual({});
  });

  it('should combine multiple filters with AND', () => {
    const where = repo.buildWhereClause({
      status: 'PENDING',
      threshold: 30,
      certificateId: 'cert-001',
    });

    expect(where).toHaveProperty('AND');
    const and = (where as { AND: unknown[] }).AND;
    expect(and).toHaveLength(3);
  });

  it('should return single condition without AND wrapper', () => {
    const where = repo.buildWhereClause({ status: 'FAILED' });
    expect(where).not.toHaveProperty('AND');
    expect(where).toEqual({ status: 'FAILED' });
  });
});

// ─── Unit tests: findAll ─────────────────────────────────────────────────────

describe('AlertRepository.findAll', () => {
  let repo: AlertRepository;
  let mocks: ReturnType<typeof createMockPrisma>['mocks'];

  beforeEach(() => {
    const mock = createMockPrisma();
    repo = new AlertRepository(mock.prisma);
    mocks = mock.mocks;
  });

  it('should call $transaction with findMany and count', async () => {
    const alerts = [{ id: 'alert-1' }];
    mocks.transaction.mockResolvedValue([alerts, 1]);

    const result = await repo.findAll({}, { page: 1, pageSize: 25, skip: 0, take: 25 });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual(alerts);
    expect(result.total).toBe(1);
  });

  it('should pass pagination skip/take', async () => {
    mocks.transaction.mockResolvedValue([[], 0]);

    await repo.findAll({}, { page: 2, pageSize: 10, skip: 10, take: 10 });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});

// ─── Unit tests: findById ────────────────────────────────────────────────────

describe('AlertRepository.findById', () => {
  let repo: AlertRepository;
  let mocks: ReturnType<typeof createMockPrisma>['mocks'];

  beforeEach(() => {
    const mock = createMockPrisma();
    repo = new AlertRepository(mock.prisma);
    mocks = mock.mocks;
  });

  it('should include notification records', async () => {
    const alert = { id: 'alert-1', notifications: [] };
    mocks.alertFindUnique.mockResolvedValue(alert);

    const result = await repo.findById('alert-1');

    expect(mocks.alertFindUnique).toHaveBeenCalledWith({
      where: { id: 'alert-1' },
      include: { notifications: { orderBy: { sentAt: 'desc' } } },
    });
    expect(result).toEqual(alert);
  });

  it('should return null when not found', async () => {
    mocks.alertFindUnique.mockResolvedValue(null);

    const result = await repo.findById('nonexistent');

    expect(result).toBeNull();
  });
});

// ─── Unit tests: findByCertificateAndThreshold ──────────────────────────────

describe('AlertRepository.findByCertificateAndThreshold', () => {
  let repo: AlertRepository;
  let mocks: ReturnType<typeof createMockPrisma>['mocks'];

  beforeEach(() => {
    const mock = createMockPrisma();
    repo = new AlertRepository(mock.prisma);
    mocks = mock.mocks;
  });

  it('should query using the composite unique key', async () => {
    mocks.alertFindUnique.mockResolvedValue(null);

    await repo.findByCertificateAndThreshold('cert-001', 30);

    expect(mocks.alertFindUnique).toHaveBeenCalledWith({
      where: {
        uq_alert_cert_threshold: {
          certificateId: 'cert-001',
          threshold: 30,
        },
      },
    });
  });

  it('should return existing alert for dedup check', async () => {
    const alert = { id: 'alert-1', certificateId: 'cert-001', threshold: 30 };
    mocks.alertFindUnique.mockResolvedValue(alert);

    const result = await repo.findByCertificateAndThreshold('cert-001', 30);

    expect(result).toEqual(alert);
  });
});

// ─── Unit tests: create ─────────────────────────────────────────────────────

describe('AlertRepository.create', () => {
  let repo: AlertRepository;
  let mocks: ReturnType<typeof createMockPrisma>['mocks'];

  beforeEach(() => {
    const mock = createMockPrisma();
    repo = new AlertRepository(mock.prisma);
    mocks = mock.mocks;
  });

  it('should create an alert with all fields', async () => {
    const data = {
      certificateId: 'cert-001',
      threshold: 30,
      triggeredAt: new Date('2025-06-01'),
      certificateCn: 'test.example.com',
      certificateSans: ['test.example.com', 'www.test.example.com'],
      daysUntilExpiryAtAlert: 28,
      caName: 'DigiCert',
      owner: 'platform-team',
      zone: 'us-east-1',
      environment: 'PRD',
    };

    const created = { id: 'alert-new', ...data, status: 'PENDING' };
    mocks.alertCreate.mockResolvedValue(created);

    const result = await repo.create(data);

    expect(mocks.alertCreate).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('alert-new');
  });

  it('should default status to PENDING', async () => {
    const data = {
      certificateId: 'cert-001',
      threshold: 7,
      triggeredAt: new Date(),
      certificateCn: 'api.example.com',
      daysUntilExpiryAtAlert: 5,
      caName: 'LetsEncrypt',
      owner: 'ops',
    };

    mocks.alertCreate.mockResolvedValue({ id: 'a-1', ...data, status: 'PENDING' });

    await repo.create(data);

    const call = mocks.alertCreate.mock.calls[0][0];
    expect(call.data.status).toBe('PENDING');
  });
});

// ─── Unit tests: upsertAlert ────────────────────────────────────────────────

describe('AlertRepository.upsertAlert', () => {
  let repo: AlertRepository;
  let mocks: ReturnType<typeof createMockPrisma>['mocks'];

  beforeEach(() => {
    const mock = createMockPrisma();
    repo = new AlertRepository(mock.prisma);
    mocks = mock.mocks;
  });

  it('should upsert using composite unique key', async () => {
    const data = {
      triggeredAt: new Date('2025-06-01'),
      certificateCn: 'test.example.com',
      daysUntilExpiryAtAlert: 28,
      caName: 'DigiCert',
      owner: 'team-a',
    };

    mocks.alertUpsert.mockResolvedValue({ id: 'a-1', certificateId: 'cert-001', threshold: 30 });

    await repo.upsertAlert('cert-001', 30, data);

    expect(mocks.alertUpsert).toHaveBeenCalledTimes(1);
    const call = mocks.alertUpsert.mock.calls[0][0];
    expect(call.where.uq_alert_cert_threshold).toEqual({
      certificateId: 'cert-001',
      threshold: 30,
    });
    expect(call.create.certificateId).toBe('cert-001');
    expect(call.create.threshold).toBe(30);
    expect(call.update.certificateCn).toBe('test.example.com');
  });
});

// ─── Unit tests: acknowledge ────────────────────────────────────────────────

describe('AlertRepository.acknowledge', () => {
  let repo: AlertRepository;
  let mocks: ReturnType<typeof createMockPrisma>['mocks'];

  beforeEach(() => {
    const mock = createMockPrisma();
    repo = new AlertRepository(mock.prisma);
    mocks = mock.mocks;
  });

  it('should update status to ACKNOWLEDGED with actor and timestamp', async () => {
    mocks.alertUpdate.mockResolvedValue({
      id: 'alert-1',
      status: 'ACKNOWLEDGED',
      acknowledgedBy: 'admin',
      acknowledgedAt: new Date(),
    });

    const result = await repo.acknowledge('alert-1', 'admin');

    expect(mocks.alertUpdate).toHaveBeenCalledTimes(1);
    const call = mocks.alertUpdate.mock.calls[0][0];
    expect(call.where.id).toBe('alert-1');
    expect(call.data.status).toBe('ACKNOWLEDGED');
    expect(call.data.acknowledgedBy).toBe('admin');
    expect(call.data.acknowledgedAt).toBeInstanceOf(Date);
    expect(result.status).toBe('ACKNOWLEDGED');
  });
});

// ─── Unit tests: findByCertificateId ────────────────────────────────────────

describe('AlertRepository.findByCertificateId', () => {
  let repo: AlertRepository;
  let mocks: ReturnType<typeof createMockPrisma>['mocks'];

  beforeEach(() => {
    const mock = createMockPrisma();
    repo = new AlertRepository(mock.prisma);
    mocks = mock.mocks;
  });

  it('should query by certificateId ordered by threshold asc', async () => {
    const alerts = [
      { id: 'a-1', threshold: 7 },
      { id: 'a-2', threshold: 30 },
      { id: 'a-3', threshold: 90 },
    ];
    mocks.alertFindMany.mockResolvedValue(alerts);

    const result = await repo.findByCertificateId('cert-001');

    expect(mocks.alertFindMany).toHaveBeenCalledWith({
      where: { certificateId: 'cert-001' },
      orderBy: { threshold: 'asc' },
    });
    expect(result).toHaveLength(3);
  });
});

// ─── Unit tests: createNotificationRecord ───────────────────────────────────

describe('AlertRepository.createNotificationRecord', () => {
  let repo: AlertRepository;
  let mocks: ReturnType<typeof createMockPrisma>['mocks'];

  beforeEach(() => {
    const mock = createMockPrisma();
    repo = new AlertRepository(mock.prisma);
    mocks = mock.mocks;
  });

  it('should create a notification record', async () => {
    const data = {
      alertId: 'alert-1',
      channel: 'EMAIL' as const,
      sentAt: new Date(),
      status: 'SUCCESS' as const,
      attemptNumber: 1,
    };

    const created = { id: 'notif-1', ...data };
    mocks.notificationCreate.mockResolvedValue(created);

    const result = await repo.createNotificationRecord(data);

    expect(mocks.notificationCreate).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('notif-1');
  });

  it('should create a notification record with error message', async () => {
    const data = {
      alertId: 'alert-1',
      channel: 'WEBHOOK' as const,
      sentAt: new Date(),
      status: 'FAILED' as const,
      errorMessage: 'Connection timeout',
      webhookId: 'wh-1',
      attemptNumber: 2,
    };

    const created = { id: 'notif-2', ...data };
    mocks.notificationCreate.mockResolvedValue(created);

    const result = await repo.createNotificationRecord(data);

    const call = mocks.notificationCreate.mock.calls[0][0];
    expect(call.data.errorMessage).toBe('Connection timeout');
    expect(call.data.webhookId).toBe('wh-1');
    expect(result.id).toBe('notif-2');
  });
});
