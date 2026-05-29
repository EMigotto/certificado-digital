import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardService, _resetSnapshotCache } from '../services/dashboardService.js';
import type { DashboardRepository } from '../repositories/dashboardRepo.js';

// ─── Test helpers ────────────────────────────────────────────────────────────

function createMockRepo() {
  return {
    computeKpis: vi.fn(),
    computeHeatmap: vi.fn(),
    getCriticalAlerts: vi.fn(),
    computeTrends: vi.fn(),
    getLatestSnapshot: vi.fn(),
    saveSnapshot: vi.fn(),
  } as unknown as DashboardRepository;
}

function defaultKpis() {
  return {
    totalManaged: 100,
    validCount: 80,
    expiringLessThan30d: 15,
    expiredOrRevoked: 5,
  };
}

function defaultTrends() {
  return {
    totalManaged: { direction: 'up' as const, delta: 10 },
    validCount: { direction: 'up' as const, delta: 5 },
    expiringLessThan30d: { direction: 'stable' as const, delta: 0 },
    expiredOrRevoked: { direction: 'down' as const, delta: 3 },
  };
}

function defaultHeatmap() {
  return { 1: 2, 5: 3, 10: 1 };
}

function defaultAlerts() {
  return [
    { cn: 'api.example.com', owner: 'platform', env: 'PRD', daysLeft: 3, severity: 'critical' as const },
    { cn: 'web.example.com', owner: 'web-team', env: 'HML', daysLeft: 15, severity: 'warning' as const },
  ];
}

// ─── Unit tests: getSnapshot ────────────────────────────────────────────────

describe('DashboardService.getSnapshot', () => {
  let service: DashboardService;
  let mockRepo: ReturnType<typeof createMockRepo>;

  beforeEach(() => {
    _resetSnapshotCache();
    mockRepo = createMockRepo();
    service = new DashboardService(mockRepo);
  });

  it('should return a full snapshot with KPIs, heatmap, alerts, and trends', async () => {
    (mockRepo.computeKpis as ReturnType<typeof vi.fn>).mockResolvedValue(defaultKpis());
    (mockRepo.computeHeatmap as ReturnType<typeof vi.fn>).mockResolvedValue(defaultHeatmap());
    (mockRepo.getCriticalAlerts as ReturnType<typeof vi.fn>).mockResolvedValue(defaultAlerts());
    (mockRepo.computeTrends as ReturnType<typeof vi.fn>).mockResolvedValue(defaultTrends());

    const result = await service.getSnapshot();

    expect(result.kpis.totalManaged).toBe(100);
    expect(result.kpis.validCount).toBe(80);
    expect(result.kpis.expiringLessThan30d).toBe(15);
    expect(result.kpis.expiredOrRevoked).toBe(5);
    expect(result.kpis.trends.totalManaged.direction).toBe('up');
    expect(result.heatmap).toEqual(defaultHeatmap());
    expect(result.alerts).toHaveLength(2);
    expect(result.generatedAt).toBeTruthy();
  });

  it('should use default stable trends when no previous snapshot exists', async () => {
    (mockRepo.computeKpis as ReturnType<typeof vi.fn>).mockResolvedValue(defaultKpis());
    (mockRepo.computeHeatmap as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (mockRepo.getCriticalAlerts as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockRepo.computeTrends as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await service.getSnapshot();

    expect(result.kpis.trends.totalManaged).toEqual({ direction: 'stable', delta: 0 });
    expect(result.kpis.trends.validCount).toEqual({ direction: 'stable', delta: 0 });
    expect(result.kpis.trends.expiringLessThan30d).toEqual({ direction: 'stable', delta: 0 });
    expect(result.kpis.trends.expiredOrRevoked).toEqual({ direction: 'stable', delta: 0 });
  });

  it('should cache the snapshot and serve from cache on second call', async () => {
    (mockRepo.computeKpis as ReturnType<typeof vi.fn>).mockResolvedValue(defaultKpis());
    (mockRepo.computeHeatmap as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (mockRepo.getCriticalAlerts as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockRepo.computeTrends as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const first = await service.getSnapshot();
    const second = await service.getSnapshot();

    // Should only compute once
    expect(mockRepo.computeKpis).toHaveBeenCalledTimes(1);
    expect(first.generatedAt).toBe(second.generatedAt);
  });

  it('should recompute after cache is cleared', async () => {
    (mockRepo.computeKpis as ReturnType<typeof vi.fn>).mockResolvedValue(defaultKpis());
    (mockRepo.computeHeatmap as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (mockRepo.getCriticalAlerts as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockRepo.computeTrends as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await service.getSnapshot();
    service.clearCache();
    await service.getSnapshot();

    expect(mockRepo.computeKpis).toHaveBeenCalledTimes(2);
  });

  it('should call all repo methods in parallel', async () => {
    const resolveOrder: string[] = [];

    (mockRepo.computeKpis as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      resolveOrder.push('kpis');
      return defaultKpis();
    });
    (mockRepo.computeHeatmap as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      resolveOrder.push('heatmap');
      return {};
    });
    (mockRepo.getCriticalAlerts as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      resolveOrder.push('alerts');
      return [];
    });
    (mockRepo.computeTrends as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      resolveOrder.push('trends');
      return null;
    });

    await service.getSnapshot();

    // All 4 methods should have been called
    expect(resolveOrder).toContain('kpis');
    expect(resolveOrder).toContain('heatmap');
    expect(resolveOrder).toContain('alerts');
    expect(resolveOrder).toContain('trends');
  });
});

// ─── Unit tests: getHeatmap ─────────────────────────────────────────────────

describe('DashboardService.getHeatmap', () => {
  let service: DashboardService;
  let mockRepo: ReturnType<typeof createMockRepo>;

  beforeEach(() => {
    _resetSnapshotCache();
    mockRepo = createMockRepo();
    service = new DashboardService(mockRepo);
  });

  it('should call repo.computeHeatmap with specified days', async () => {
    (mockRepo.computeHeatmap as ReturnType<typeof vi.fn>).mockResolvedValue({ 5: 3 });

    const result = await service.getHeatmap(30);

    expect(mockRepo.computeHeatmap).toHaveBeenCalledWith(30);
    expect(result).toEqual({ 5: 3 });
  });

  it('should default to 90 days', async () => {
    (mockRepo.computeHeatmap as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await service.getHeatmap();

    expect(mockRepo.computeHeatmap).toHaveBeenCalledWith(90);
  });
});

// ─── Unit tests: getCriticalAlerts ──────────────────────────────────────────

describe('DashboardService.getCriticalAlerts', () => {
  let service: DashboardService;
  let mockRepo: ReturnType<typeof createMockRepo>;

  beforeEach(() => {
    _resetSnapshotCache();
    mockRepo = createMockRepo();
    service = new DashboardService(mockRepo);
  });

  it('should call repo.getCriticalAlerts with specified limit', async () => {
    (mockRepo.getCriticalAlerts as ReturnType<typeof vi.fn>).mockResolvedValue(defaultAlerts());

    const result = await service.getCriticalAlerts(10);

    expect(mockRepo.getCriticalAlerts).toHaveBeenCalledWith(10);
    expect(result).toHaveLength(2);
  });

  it('should default to 5 limit', async () => {
    (mockRepo.getCriticalAlerts as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await service.getCriticalAlerts();

    expect(mockRepo.getCriticalAlerts).toHaveBeenCalledWith(5);
  });
});

// ─── Unit tests: refreshSnapshot ────────────────────────────────────────────

describe('DashboardService.refreshSnapshot', () => {
  let service: DashboardService;
  let mockRepo: ReturnType<typeof createMockRepo>;

  beforeEach(() => {
    _resetSnapshotCache();
    mockRepo = createMockRepo();
    service = new DashboardService(mockRepo);
  });

  it('should invalidate cache, compute fresh data, persist, and return snapshot', async () => {
    // refreshSnapshot calls computeKpis + computeHeatmap for DB save
    (mockRepo.computeKpis as ReturnType<typeof vi.fn>).mockResolvedValue(defaultKpis());
    (mockRepo.computeHeatmap as ReturnType<typeof vi.fn>).mockResolvedValue(defaultHeatmap());
    (mockRepo.saveSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'snap-1' });
    (mockRepo.getCriticalAlerts as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockRepo.computeTrends as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await service.refreshSnapshot();

    // Should have saved to DB
    expect(mockRepo.saveSnapshot).toHaveBeenCalledWith({
      totalManaged: 100,
      validCount: 80,
      expiringLessThan30d: 15,
      expiredOrRevoked: 5,
      expirationsByDay: JSON.stringify(defaultHeatmap()),
    });

    // Should return a valid snapshot
    expect(result.kpis.totalManaged).toBe(100);
    expect(result.generatedAt).toBeTruthy();
  });

  it('should recompute even if cache was warm', async () => {
    // Warm up cache
    (mockRepo.computeKpis as ReturnType<typeof vi.fn>).mockResolvedValue(defaultKpis());
    (mockRepo.computeHeatmap as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (mockRepo.getCriticalAlerts as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockRepo.computeTrends as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await service.getSnapshot(); // warm up
    expect(mockRepo.computeKpis).toHaveBeenCalledTimes(1);

    // Refresh should bypass cache
    (mockRepo.saveSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'snap-1' });
    await service.refreshSnapshot();

    // computeKpis should have been called again (refresh + getSnapshot in refresh)
    expect((mockRepo.computeKpis as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1);
  });
});

// ─── Unit tests: clearCache ─────────────────────────────────────────────────

describe('DashboardService.clearCache', () => {
  let service: DashboardService;
  let mockRepo: ReturnType<typeof createMockRepo>;

  beforeEach(() => {
    _resetSnapshotCache();
    mockRepo = createMockRepo();
    service = new DashboardService(mockRepo);
  });

  it('should force recomputation on next getSnapshot', async () => {
    (mockRepo.computeKpis as ReturnType<typeof vi.fn>).mockResolvedValue(defaultKpis());
    (mockRepo.computeHeatmap as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (mockRepo.getCriticalAlerts as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockRepo.computeTrends as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await service.getSnapshot(); // fills cache
    service.clearCache();
    await service.getSnapshot(); // should recompute

    expect(mockRepo.computeKpis).toHaveBeenCalledTimes(2);
  });
});
