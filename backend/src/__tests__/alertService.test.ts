import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AlertService,
  AlertServiceError,
  mapAlertToResponse,
  mapNotificationToResponse,
  mapAlertToDetailResponse,
} from '../services/alertService.js';
import { AlertRepository } from '../repositories/alertRepo.js';
import type { PrismaClient } from '@prisma/client';

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeAlertRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'alert-001',
    certificateId: 'cert-001',
    threshold: 30,
    triggeredAt: new Date('2025-06-01T10:00:00.000Z'),
    status: 'PENDING',
    certificateCn: 'test.example.com',
    certificateSans: ['test.example.com'],
    daysUntilExpiryAtAlert: 28,
    caName: 'DigiCert',
    owner: 'platform-team',
    zone: 'us-east-1',
    environment: 'PRD',
    acknowledgedAt: null,
    acknowledgedBy: null,
    createdAt: new Date('2025-06-01T10:00:00.000Z'),
    updatedAt: new Date('2025-06-01T10:00:00.000Z'),
    ...overrides,
  };
}

function makeNotificationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'notif-001',
    alertId: 'alert-001',
    channel: 'EMAIL',
    sentAt: new Date('2025-06-01T10:05:00.000Z'),
    status: 'SUCCESS',
    errorMessage: null,
    webhookId: null,
    attemptNumber: 1,
    ...overrides,
  };
}

function createMockPrisma() {
  return {
    expirationAlert: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    notificationRecord: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  } as unknown as PrismaClient;
}

// ─── Unit tests: mapAlertToResponse ─────────────────────────────────────────

describe('mapAlertToResponse', () => {
  it('should map Prisma alert to API response with ISO dates', () => {
    const alert = makeAlertRow();
    const result = mapAlertToResponse(alert as never);

    expect(result.id).toBe('alert-001');
    expect(result.triggeredAt).toBe('2025-06-01T10:00:00.000Z');
    expect(result.createdAt).toBe('2025-06-01T10:00:00.000Z');
    expect(result.acknowledgedAt).toBeNull();
    expect(result.acknowledgedBy).toBeNull();
  });

  it('should include acknowledgedAt when set', () => {
    const alert = makeAlertRow({
      status: 'ACKNOWLEDGED',
      acknowledgedAt: new Date('2025-06-02T12:00:00.000Z'),
      acknowledgedBy: 'admin',
    });

    const result = mapAlertToResponse(alert as never);

    expect(result.acknowledgedAt).toBe('2025-06-02T12:00:00.000Z');
    expect(result.acknowledgedBy).toBe('admin');
  });
});

describe('mapNotificationToResponse', () => {
  it('should map notification to API response with ISO dates', () => {
    const notif = makeNotificationRow();
    const result = mapNotificationToResponse(notif as never);

    expect(result.id).toBe('notif-001');
    expect(result.sentAt).toBe('2025-06-01T10:05:00.000Z');
    expect(result.channel).toBe('EMAIL');
    expect(result.status).toBe('SUCCESS');
    expect(result.errorMessage).toBeNull();
  });
});

describe('mapAlertToDetailResponse', () => {
  it('should include notifications array', () => {
    const alert = {
      ...makeAlertRow(),
      notifications: [makeNotificationRow()],
    };

    const result = mapAlertToDetailResponse(alert as never);

    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].id).toBe('notif-001');
    expect(result.notifications[0].sentAt).toBe('2025-06-01T10:05:00.000Z');
  });

  it('should handle empty notifications', () => {
    const alert = {
      ...makeAlertRow(),
      notifications: [],
    };

    const result = mapAlertToDetailResponse(alert as never);

    expect(result.notifications).toEqual([]);
  });
});

// ─── Unit tests: AlertService ───────────────────────────────────────────────

describe('AlertService.listAlerts', () => {
  let service: AlertService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    const repo = new AlertRepository(mockPrisma);
    service = new AlertService(repo);
  });

  it('should return paginated alerts with defaults', async () => {
    const alerts = [makeAlertRow()];
    (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([alerts, 1]);

    const result = await service.listAlerts({});

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(result.total).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('alert-001');
    expect(result.data[0].triggeredAt).toBe('2025-06-01T10:00:00.000Z');
  });

  it('should accept pagination query params', async () => {
    (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([[], 0]);

    const result = await service.listAlerts({ page: '2', pageSize: '10' });

    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(10);
  });

  it('should parse threshold filter', async () => {
    (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([[], 0]);

    const result = await service.listAlerts({ threshold: '30' });

    expect(result.data).toEqual([]);
  });

  it('should ignore invalid threshold', async () => {
    (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([[], 0]);

    const result = await service.listAlerts({ threshold: 'abc' });

    expect(result.data).toEqual([]);
  });

  it('should return empty result when no alerts', async () => {
    (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([[], 0]);

    const result = await service.listAlerts({ status: 'PENDING' });

    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe('AlertService.getAlert', () => {
  let service: AlertService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    const repo = new AlertRepository(mockPrisma);
    service = new AlertService(repo);
  });

  it('should return alert with notifications', async () => {
    const alert = {
      ...makeAlertRow(),
      notifications: [makeNotificationRow()],
    };
    (mockPrisma.expirationAlert.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(alert);

    const result = await service.getAlert('alert-001');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('alert-001');
    expect(result!.notifications).toHaveLength(1);
  });

  it('should return null when alert not found', async () => {
    (mockPrisma.expirationAlert.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await service.getAlert('nonexistent');

    expect(result).toBeNull();
  });
});

describe('AlertService.acknowledgeAlert', () => {
  let service: AlertService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    const repo = new AlertRepository(mockPrisma);
    service = new AlertService(repo);
  });

  it('should acknowledge a PENDING alert', async () => {
    const existing = { ...makeAlertRow(), notifications: [] };
    const updated = makeAlertRow({
      status: 'ACKNOWLEDGED',
      acknowledgedBy: 'admin',
      acknowledgedAt: new Date('2025-06-02T12:00:00.000Z'),
    });

    (mockPrisma.expirationAlert.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (mockPrisma.expirationAlert.update as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

    const result = await service.acknowledgeAlert('alert-001', 'admin');

    expect(result.status).toBe('ACKNOWLEDGED');
    expect(result.acknowledgedBy).toBe('admin');
  });

  it('should throw 404 when alert not found', async () => {
    (mockPrisma.expirationAlert.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(service.acknowledgeAlert('nonexistent', 'admin')).rejects.toThrow(
      AlertServiceError,
    );

    try {
      await service.acknowledgeAlert('nonexistent', 'admin');
    } catch (err) {
      expect((err as AlertServiceError).statusCode).toBe(404);
    }
  });

  it('should throw 409 when alert is already acknowledged', async () => {
    const existing = {
      ...makeAlertRow({
        status: 'ACKNOWLEDGED',
        acknowledgedBy: 'admin',
        acknowledgedAt: new Date(),
      }),
      notifications: [],
    };

    (mockPrisma.expirationAlert.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    await expect(service.acknowledgeAlert('alert-001', 'user2')).rejects.toThrow(
      AlertServiceError,
    );

    try {
      await service.acknowledgeAlert('alert-001', 'user2');
    } catch (err) {
      expect((err as AlertServiceError).statusCode).toBe(409);
    }
  });

  it('should throw 400 when actor is empty', async () => {
    await expect(service.acknowledgeAlert('alert-001', '')).rejects.toThrow(AlertServiceError);

    try {
      await service.acknowledgeAlert('alert-001', '');
    } catch (err) {
      expect((err as AlertServiceError).statusCode).toBe(400);
    }
  });

  it('should throw 400 when actor is whitespace only', async () => {
    await expect(service.acknowledgeAlert('alert-001', '   ')).rejects.toThrow(AlertServiceError);

    try {
      await service.acknowledgeAlert('alert-001', '   ');
    } catch (err) {
      expect((err as AlertServiceError).statusCode).toBe(400);
    }
  });
});

describe('AlertService.getAlertsByCertificate', () => {
  let service: AlertService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    const repo = new AlertRepository(mockPrisma);
    service = new AlertService(repo);
  });

  it('should return all alerts for a certificate', async () => {
    const alerts = [
      makeAlertRow({ id: 'a-1', threshold: 7 }),
      makeAlertRow({ id: 'a-2', threshold: 30 }),
      makeAlertRow({ id: 'a-3', threshold: 90 }),
    ];
    (mockPrisma.expirationAlert.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(alerts);

    const result = await service.getAlertsByCertificate('cert-001');

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('a-1');
    expect(result[2].id).toBe('a-3');
  });

  it('should return empty array when no alerts found', async () => {
    (mockPrisma.expirationAlert.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await service.getAlertsByCertificate('cert-no-alerts');

    expect(result).toEqual([]);
  });
});
