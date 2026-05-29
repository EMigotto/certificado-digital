/**
 * Unit tests for scheduler routes.
 *
 * Tests cover:
 * - POST /api/internal/scheduler/expiration-check — manual trigger
 * - GET  /api/internal/scheduler/expiration-check/status — last status
 * - GET  /api/internal/scheduler/logs — recent logs
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock scheduler service ──────────────────────────────────────────────────

const mockRunCheck = vi.fn();
const mockGetStatus = vi.fn();
const mockGetLogs = vi.fn();

vi.mock('../scheduler/cronJob.js', () => ({
  getSchedulerService: () => ({
    runCheck: mockRunCheck,
    getStatus: mockGetStatus,
    getLogs: mockGetLogs,
  }),
  startScheduler: vi.fn(),
  stopScheduler: vi.fn(),
}));

// ─── Mock config ──────────────────────────────────────────────────────────────

vi.mock('../config.js', () => ({
  config: {
    PORT: 3000,
    HOST: '0.0.0.0',
    NODE_ENV: 'test',
    CORS_ORIGIN: 'http://localhost:5173',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    EXPIRATION_SCHEDULER_ENABLED: false,
    EXPIRATION_SCHEDULER_CRON: '0 2 * * *',
  },
}));

// ─── Mock prismaClient ───────────────────────────────────────────────────────

vi.mock('../prismaClient.js', () => ({
  default: {},
}));

// ─── Build minimal Fastify for route testing ──────────────────────────────────

import Fastify from 'fastify';
import { schedulerRoutes } from '../routes/scheduler.js';

describe('Scheduler Routes', () => {
  let server: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    server = Fastify();
    await server.register(schedulerRoutes);
    await server.ready();

    vi.resetAllMocks();
  });

  // ── POST /api/internal/scheduler/expiration-check ───────────────────────

  describe('POST /api/internal/scheduler/expiration-check', () => {
    it('should trigger expiration check and return result', async () => {
      mockGetStatus.mockReturnValue({ isRunning: false });
      mockRunCheck.mockResolvedValue({
        certificatesEvaluated: 100,
        alertsCreated: 5,
        alertsSkipped: 10,
        snapshotStored: true,
        durationMs: 1234,
        errors: [],
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/internal/scheduler/expiration-check',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Expiration check completed');
      expect(body.data.certificatesEvaluated).toBe(100);
      expect(body.data.alertsCreated).toBe(5);
    });

    it('should return 409 when scheduler is already running', async () => {
      mockGetStatus.mockReturnValue({ isRunning: true });

      const response = await server.inject({
        method: 'POST',
        url: '/api/internal/scheduler/expiration-check',
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Conflict');
    });
  });

  // ── GET /api/internal/scheduler/expiration-check/status ─────────────────

  describe('GET /api/internal/scheduler/expiration-check/status', () => {
    it('should return current scheduler status', async () => {
      mockGetStatus.mockReturnValue({
        lastRunAt: '2026-01-01T02:00:00.000Z',
        lastDurationMs: 500,
        lastCertificatesEvaluated: 42,
        lastAlertsCreated: 3,
        isRunning: false,
      });

      const response = await server.inject({
        method: 'GET',
        url: '/api/internal/scheduler/expiration-check/status',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.lastCertificatesEvaluated).toBe(42);
      expect(body.data.isRunning).toBe(false);
    });
  });

  // ── GET /api/internal/scheduler/logs ────────────────────────────────────

  describe('GET /api/internal/scheduler/logs', () => {
    it('should return recent execution logs', async () => {
      mockGetLogs.mockReturnValue([
        {
          timestamp: '2026-01-01T02:00:00.000Z',
          certificatesEvaluated: 42,
          alertsCreated: 3,
          alertsSkipped: 2,
          durationMs: 500,
          snapshotStored: true,
          errors: [],
        },
      ]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/internal/scheduler/logs',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(1);
      expect(body.total).toBe(1);
    });

    it('should return empty array when no logs exist', async () => {
      mockGetLogs.mockReturnValue([]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/internal/scheduler/logs',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(0);
      expect(body.total).toBe(0);
    });
  });
});
