import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardRepository, computeSeverity, buildTrend } from '../repositories/dashboardRepo.js';
import type { PrismaClient } from '@prisma/client';

// ─── Test helpers ────────────────────────────────────────────────────────────

function createMockPrisma() {
  const mockCertificateCount = vi.fn();
  const mockSnapshotFindUnique = vi.fn();
  const mockSnapshotFindFirst = vi.fn();
  const mockSnapshotUpsert = vi.fn();
  const mockQueryRaw = vi.fn();
  const mockTransaction = vi.fn();

  const prisma = {
    certificate: {
      count: mockCertificateCount,
    },
    expirationSnapshot: {
      findUnique: mockSnapshotFindUnique,
      findFirst: mockSnapshotFindFirst,
      upsert: mockSnapshotUpsert,
    },
    $queryRaw: mockQueryRaw,
    $transaction: mockTransaction,
  } as unknown as PrismaClient;

  return {
    prisma,
    mocks: {
      certificateCount: mockCertificateCount,
      snapshotFindUnique: mockSnapshotFindUnique,
      snapshotFindFirst: mockSnapshotFindFirst,
      snapshotUpsert: mockSnapshotUpsert,
      queryRaw: mockQueryRaw,
      transaction: mockTransaction,
    },
  };
}

// ─── Unit tests: computeSeverity ────────────────────────────────────────────

describe('computeSeverity', () => {
  it('should return "critical" for 0 days', () => {
    expect(computeSeverity(0)).toBe('critical');
  });

  it('should return "critical" for negative days (expired)', () => {
    expect(computeSeverity(-5)).toBe('critical');
  });

  it('should return "critical" for 7 days', () => {
    expect(computeSeverity(7)).toBe('critical');
  });

  it('should return "warning" for 8 days', () => {
    expect(computeSeverity(8)).toBe('warning');
  });

  it('should return "warning" for 30 days', () => {
    expect(computeSeverity(30)).toBe('warning');
  });

  it('should return "info" for 31 days', () => {
    expect(computeSeverity(31)).toBe('info');
  });

  it('should return "info" for 90 days', () => {
    expect(computeSeverity(90)).toBe('info');
  });
});

// ─── Unit tests: buildTrend ─────────────────────────────────────────────────

describe('buildTrend', () => {
  it('should return "up" when current > previous', () => {
    const trend = buildTrend(100, 80);
    expect(trend.direction).toBe('up');
    expect(trend.delta).toBe(20);
  });

  it('should return "down" when current < previous', () => {
    const trend = buildTrend(80, 100);
    expect(trend.direction).toBe('down');
    expect(trend.delta).toBe(20); // absolute value
  });

  it('should return "stable" when current === previous', () => {
    const trend = buildTrend(100, 100);
    expect(trend.direction).toBe('stable');
    expect(trend.delta).toBe(0);
  });

  it('should handle zero values', () => {
    const trend = buildTrend(0, 0);
    expect(trend.direction).toBe('stable');
    expect(trend.delta).toBe(0);
  });

  it('should handle transition from zero', () => {
    const trend = buildTrend(10, 0);
    expect(trend.direction).toBe('up');
    expect(trend.delta).toBe(10);
  });
});

// ─── Unit tests: getLatestSnapshot ──────────────────────────────────────────

describe('DashboardRepository.getLatestSnapshot', () => {
  let repo: DashboardRepository;
  let mocks: ReturnType<typeof createMockPrisma>['mocks'];

  beforeEach(() => {
    const mock = createMockPrisma();
    repo = new DashboardRepository(mock.prisma);
    mocks = mock.mocks;
  });

  it('should query for today\'s snapshot', async () => {
    mocks.snapshotFindUnique.mockResolvedValue(null);

    const result = await repo.getLatestSnapshot();

    expect(mocks.snapshotFindUnique).toHaveBeenCalledTimes(1);
    const call = mocks.snapshotFindUnique.mock.calls[0][0];
    expect(call.where).toHaveProperty('snapshotDate');
    expect(result).toBeNull();
  });

  it('should return snapshot when found', async () => {
    const snapshot = {
      id: 'snap-1',
      snapshotDate: new Date(),
      totalManaged: 100,
      validCount: 80,
      expiringLessThan30d: 15,
      expiredOrRevoked: 5,
      expirationsByDay: '{}',
      createdAt: new Date(),
    };
    mocks.snapshotFindUnique.mockResolvedValue(snapshot);

    const result = await repo.getLatestSnapshot();

    expect(result).toEqual(snapshot);
  });
});

// ─── Unit tests: saveSnapshot ───────────────────────────────────────────────

describe('DashboardRepository.saveSnapshot', () => {
  let repo: DashboardRepository;
  let mocks: ReturnType<typeof createMockPrisma>['mocks'];

  beforeEach(() => {
    const mock = createMockPrisma();
    repo = new DashboardRepository(mock.prisma);
    mocks = mock.mocks;
  });

  it('should upsert a snapshot for today', async () => {
    const data = {
      totalManaged: 100,
      validCount: 80,
      expiringLessThan30d: 15,
      expiredOrRevoked: 5,
      expirationsByDay: '{"1":2,"5":3}',
    };
    const saved = { id: 'snap-new', ...data, snapshotDate: new Date(), createdAt: new Date() };
    mocks.snapshotUpsert.mockResolvedValue(saved);

    const result = await repo.saveSnapshot(data);

    expect(mocks.snapshotUpsert).toHaveBeenCalledTimes(1);
    expect(result.totalManaged).toBe(100);
  });
});

// ─── Unit tests: computeKpis ────────────────────────────────────────────────

describe('DashboardRepository.computeKpis', () => {
  let repo: DashboardRepository;
  let mocks: ReturnType<typeof createMockPrisma>['mocks'];

  beforeEach(() => {
    const mock = createMockPrisma();
    repo = new DashboardRepository(mock.prisma);
    mocks = mock.mocks;
  });

  it('should run 4 count queries in a transaction', async () => {
    // $transaction receives an array of promises
    mocks.transaction.mockResolvedValue([100, 80, 15, 5]);

    const result = await repo.computeKpis();

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      totalManaged: 100,
      validCount: 80,
      expiringLessThan30d: 15,
      expiredOrRevoked: 5,
    });
  });

  it('should return zeros when no certificates exist', async () => {
    mocks.transaction.mockResolvedValue([0, 0, 0, 0]);

    const result = await repo.computeKpis();

    expect(result).toEqual({
      totalManaged: 0,
      validCount: 0,
      expiringLessThan30d: 0,
      expiredOrRevoked: 0,
    });
  });
});

// ─── Unit tests: computeHeatmap ─────────────────────────────────────────────

describe('DashboardRepository.computeHeatmap', () => {
  let repo: DashboardRepository;
  let mocks: ReturnType<typeof createMockPrisma>['mocks'];

  beforeEach(() => {
    const mock = createMockPrisma();
    repo = new DashboardRepository(mock.prisma);
    mocks = mock.mocks;
  });

  it('should return empty heatmap when no certs are expiring', async () => {
    mocks.queryRaw.mockResolvedValue([]);

    const result = await repo.computeHeatmap(90);

    expect(result).toEqual({});
  });

  it('should map date rows to day-offset buckets', async () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const in5d = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    const in10d = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);

    mocks.queryRaw.mockResolvedValue([
      { expiry_date: in5d, count: BigInt(3) },
      { expiry_date: in10d, count: BigInt(7) },
    ]);

    const result = await repo.computeHeatmap(90);

    expect(result[5]).toBe(3);
    expect(result[10]).toBe(7);
  });

  it('should use default 90 days when not specified', async () => {
    mocks.queryRaw.mockResolvedValue([]);

    await repo.computeHeatmap();

    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
  });
});

// ─── Unit tests: getCriticalAlerts ──────────────────────────────────────────

describe('DashboardRepository.getCriticalAlerts', () => {
  let repo: DashboardRepository;
  let mocks: ReturnType<typeof createMockPrisma>['mocks'];

  beforeEach(() => {
    const mock = createMockPrisma();
    repo = new DashboardRepository(mock.prisma);
    mocks = mock.mocks;
  });

  it('should return critical alert objects', async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        certificate_cn: 'api.example.com',
        owner: 'platform-team',
        environment: 'PRD',
        days_until_expiry_at_alert: 3,
      },
      {
        certificate_cn: 'web.example.com',
        owner: 'web-team',
        environment: 'HML',
        days_until_expiry_at_alert: 15,
      },
    ]);

    const result = await repo.getCriticalAlerts(5);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      cn: 'api.example.com',
      owner: 'platform-team',
      env: 'PRD',
      daysLeft: 3,
      severity: 'critical',
    });
    expect(result[1]).toEqual({
      cn: 'web.example.com',
      owner: 'web-team',
      env: 'HML',
      daysLeft: 15,
      severity: 'warning',
    });
  });

  it('should default env to empty string when null', async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        certificate_cn: 'api.example.com',
        owner: 'ops',
        environment: null,
        days_until_expiry_at_alert: 5,
      },
    ]);

    const result = await repo.getCriticalAlerts(5);

    expect(result[0].env).toBe('');
  });

  it('should return empty array when no alerts', async () => {
    mocks.queryRaw.mockResolvedValue([]);

    const result = await repo.getCriticalAlerts(5);

    expect(result).toEqual([]);
  });

  it('should default limit to 5', async () => {
    mocks.queryRaw.mockResolvedValue([]);

    await repo.getCriticalAlerts();

    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
  });
});

// ─── Unit tests: computeTrends ──────────────────────────────────────────────

describe('DashboardRepository.computeTrends', () => {
  let repo: DashboardRepository;
  let mocks: ReturnType<typeof createMockPrisma>['mocks'];

  beforeEach(() => {
    const mock = createMockPrisma();
    repo = new DashboardRepository(mock.prisma);
    mocks = mock.mocks;
  });

  it('should return null when no previous snapshot exists', async () => {
    mocks.snapshotFindFirst.mockResolvedValue(null);

    const result = await repo.computeTrends(7);

    expect(result).toBeNull();
  });

  it('should compute trends relative to previous snapshot', async () => {
    const previousSnapshot = {
      id: 'snap-old',
      snapshotDate: new Date('2025-05-22'),
      totalManaged: 90,
      validCount: 70,
      expiringLessThan30d: 10,
      expiredOrRevoked: 10,
      expirationsByDay: '{}',
      createdAt: new Date('2025-05-22'),
    };
    mocks.snapshotFindFirst.mockResolvedValue(previousSnapshot);

    // computeKpis is called internally — mock $transaction
    mocks.transaction.mockResolvedValue([100, 80, 15, 5]);

    const result = await repo.computeTrends(7);

    expect(result).not.toBeNull();
    expect(result!.totalManaged).toEqual({ direction: 'up', delta: 10 });
    expect(result!.validCount).toEqual({ direction: 'up', delta: 10 });
    expect(result!.expiringLessThan30d).toEqual({ direction: 'up', delta: 5 });
    expect(result!.expiredOrRevoked).toEqual({ direction: 'down', delta: 5 });
  });

  it('should return stable trends when counts are unchanged', async () => {
    const previousSnapshot = {
      id: 'snap-old',
      snapshotDate: new Date('2025-05-22'),
      totalManaged: 100,
      validCount: 80,
      expiringLessThan30d: 15,
      expiredOrRevoked: 5,
      expirationsByDay: '{}',
      createdAt: new Date('2025-05-22'),
    };
    mocks.snapshotFindFirst.mockResolvedValue(previousSnapshot);
    mocks.transaction.mockResolvedValue([100, 80, 15, 5]);

    const result = await repo.computeTrends(7);

    expect(result!.totalManaged.direction).toBe('stable');
    expect(result!.validCount.direction).toBe('stable');
  });
});
