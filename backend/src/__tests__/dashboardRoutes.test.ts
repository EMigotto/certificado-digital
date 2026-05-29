import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

/**
 * Dashboard routes integration-style tests.
 *
 * We mock Prisma with vi.hoisted to avoid reference-before-init.
 */

// ─── Mock Prisma client with vi.hoisted ─────────────────────────────────────

const {
  mockCertCount,
  mockSnapshotFindUnique,
  mockSnapshotFindFirst,
  mockSnapshotUpsert,
  mockQueryRaw,
  mockTransaction,
} = vi.hoisted(() => ({
  mockCertCount: vi.fn(),
  mockSnapshotFindUnique: vi.fn(),
  mockSnapshotFindFirst: vi.fn(),
  mockSnapshotUpsert: vi.fn(),
  mockQueryRaw: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock('../prismaClient.js', () => ({
  default: {
    certificate: {
      count: mockCertCount,
    },
    expirationSnapshot: {
      findUnique: mockSnapshotFindUnique,
      findFirst: mockSnapshotFindFirst,
      upsert: mockSnapshotUpsert,
    },
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
    $queryRaw: mockQueryRaw,
    $transaction: mockTransaction,
  },
}));

// Must import after mock setup
import { dashboardRoutes } from '../routes/dashboard.js';
import { _resetSnapshotCache } from '../services/dashboardService.js';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Dashboard Routes', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    _resetSnapshotCache();
    server = Fastify();
    await server.register(dashboardRoutes);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  // ── GET /api/dashboard/snapshot ──────────────────────────────────────────

  describe('GET /api/dashboard/snapshot', () => {
    it('should return a full dashboard snapshot', async () => {
      // computeKpis uses $transaction
      mockTransaction.mockResolvedValue([100, 80, 15, 5]);
      // computeHeatmap uses $queryRaw
      mockQueryRaw.mockResolvedValue([]);
      // computeTrends calls snapshotFindFirst
      mockSnapshotFindFirst.mockResolvedValue(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/dashboard/snapshot',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.kpis).toBeDefined();
      expect(body.kpis.totalManaged).toBe(100);
      expect(body.kpis.validCount).toBe(80);
      expect(body.kpis.expiringLessThan30d).toBe(15);
      expect(body.kpis.expiredOrRevoked).toBe(5);
      expect(body.heatmap).toBeDefined();
      expect(body.alerts).toBeDefined();
      expect(body.generatedAt).toBeDefined();
    });

    it('should set Cache-Control: max-age=30 header', async () => {
      mockTransaction.mockResolvedValue([0, 0, 0, 0]);
      mockQueryRaw.mockResolvedValue([]);
      mockSnapshotFindFirst.mockResolvedValue(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/dashboard/snapshot',
      });

      expect(response.headers['cache-control']).toBe('max-age=30');
    });

    it('should return stable trends when no previous snapshot exists', async () => {
      mockTransaction.mockResolvedValue([50, 40, 8, 2]);
      mockQueryRaw.mockResolvedValue([]);
      mockSnapshotFindFirst.mockResolvedValue(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/dashboard/snapshot',
      });

      const body = JSON.parse(response.payload);
      expect(body.kpis.trends.totalManaged).toEqual({ direction: 'stable', delta: 0 });
      expect(body.kpis.trends.validCount).toEqual({ direction: 'stable', delta: 0 });
    });

    it('should include trend data when previous snapshot exists', async () => {
      // First call: computeKpis via $transaction (in getSnapshot → Promise.all)
      // computeTrends also calls computeKpis via $transaction
      mockTransaction.mockResolvedValue([100, 80, 15, 5]);
      mockQueryRaw.mockResolvedValue([]);
      mockSnapshotFindFirst.mockResolvedValue({
        id: 'snap-old',
        snapshotDate: new Date('2025-05-22'),
        totalManaged: 90,
        validCount: 70,
        expiringLessThan30d: 10,
        expiredOrRevoked: 10,
        expirationsByDay: '{}',
        createdAt: new Date('2025-05-22'),
      });

      const response = await server.inject({
        method: 'GET',
        url: '/api/dashboard/snapshot',
      });

      const body = JSON.parse(response.payload);
      expect(body.kpis.trends.totalManaged.direction).toBe('up');
      expect(body.kpis.trends.totalManaged.delta).toBe(10);
    });
  });

  // ── GET /api/dashboard/heatmap ──────────────────────────────────────────

  describe('GET /api/dashboard/heatmap', () => {
    it('should return heatmap with default 90 days', async () => {
      mockQueryRaw.mockResolvedValue([]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/dashboard/heatmap',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.days).toBe(90);
      expect(body.heatmap).toBeDefined();
    });

    it('should accept custom days parameter', async () => {
      mockQueryRaw.mockResolvedValue([]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/dashboard/heatmap?days=30',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.days).toBe(30);
    });

    it('should cap days at 365', async () => {
      mockQueryRaw.mockResolvedValue([]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/dashboard/heatmap?days=1000',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.days).toBe(365);
    });

    it('should default to 90 for invalid days value', async () => {
      mockQueryRaw.mockResolvedValue([]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/dashboard/heatmap?days=abc',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.days).toBe(90);
    });

    it('should default to 90 for negative days value', async () => {
      mockQueryRaw.mockResolvedValue([]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/dashboard/heatmap?days=-5',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.days).toBe(90);
    });

    it('should set Cache-Control header', async () => {
      mockQueryRaw.mockResolvedValue([]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/dashboard/heatmap',
      });

      expect(response.headers['cache-control']).toBe('max-age=30');
    });
  });

  // ── GET /api/dashboard/critical-alerts ──────────────────────────────────

  describe('GET /api/dashboard/critical-alerts', () => {
    it('should return critical alerts with default limit 5', async () => {
      mockQueryRaw.mockResolvedValue([
        {
          certificate_cn: 'api.example.com',
          owner: 'platform-team',
          environment: 'PRD',
          days_until_expiry_at_alert: 3,
        },
      ]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/dashboard/critical-alerts',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.alerts).toHaveLength(1);
      expect(body.alerts[0].cn).toBe('api.example.com');
      expect(body.alerts[0].severity).toBe('critical');
      expect(body.alerts[0].daysLeft).toBe(3);
      expect(body.total).toBe(1);
    });

    it('should accept custom limit parameter', async () => {
      mockQueryRaw.mockResolvedValue([]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/dashboard/critical-alerts?limit=10',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.alerts).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('should cap limit at 50', async () => {
      mockQueryRaw.mockResolvedValue([]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/dashboard/critical-alerts?limit=100',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should default limit for invalid value', async () => {
      mockQueryRaw.mockResolvedValue([]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/dashboard/critical-alerts?limit=abc',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return empty alerts array when no critical alerts exist', async () => {
      mockQueryRaw.mockResolvedValue([]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/dashboard/critical-alerts',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.alerts).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('should classify severity correctly', async () => {
      mockQueryRaw.mockResolvedValue([
        {
          certificate_cn: 'critical.example.com',
          owner: 'ops',
          environment: 'PRD',
          days_until_expiry_at_alert: 2,
        },
        {
          certificate_cn: 'warning.example.com',
          owner: 'ops',
          environment: 'HML',
          days_until_expiry_at_alert: 20,
        },
        {
          certificate_cn: 'info.example.com',
          owner: 'ops',
          environment: 'DEV',
          days_until_expiry_at_alert: 60,
        },
      ]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/dashboard/critical-alerts?limit=10',
      });

      const body = JSON.parse(response.payload);
      expect(body.alerts[0].severity).toBe('critical');
      expect(body.alerts[1].severity).toBe('warning');
      expect(body.alerts[2].severity).toBe('info');
    });
  });
});
