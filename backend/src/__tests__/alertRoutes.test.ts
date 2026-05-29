import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

/**
 * Alert routes integration-style tests.
 *
 * We mock Prisma with vi.hoisted to avoid reference-before-init.
 */

// ─── Mock Prisma client with vi.hoisted ─────────────────────────────────────

const {
  mockAlertFindMany,
  mockAlertFindUnique,
  mockAlertCount,
  mockAlertUpdate,
  mockTransaction,
} = vi.hoisted(() => ({
  mockAlertFindMany: vi.fn(),
  mockAlertFindUnique: vi.fn(),
  mockAlertCount: vi.fn(),
  mockAlertUpdate: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock('../prismaClient.js', () => ({
  default: {
    expirationAlert: {
      findMany: mockAlertFindMany,
      findUnique: mockAlertFindUnique,
      count: mockAlertCount,
      update: mockAlertUpdate,
      create: vi.fn(),
      upsert: vi.fn(),
    },
    notificationRecord: {
      create: vi.fn(),
    },
    $transaction: mockTransaction,
  },
}));

import { alertRoutes } from '../routes/alerts.js';

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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Alert Routes', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = Fastify();
    await server.register(alertRoutes);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  // ── GET /api/alerts/expiration ──────────────────────────────────────────

  describe('GET /api/alerts/expiration', () => {
    it('should return paginated alerts with defaults', async () => {
      const alerts = [makeAlertRow()];
      mockTransaction.mockResolvedValue([alerts, 1]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/alerts/expiration',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(25);
      expect(body.total).toBe(1);
      expect(body.totalPages).toBe(1);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe('alert-001');
      expect(body.data[0].status).toBe('PENDING');
      expect(body.data[0].triggeredAt).toBe('2025-06-01T10:00:00.000Z');
    });

    it('should accept pagination query params', async () => {
      mockTransaction.mockResolvedValue([[], 0]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/alerts/expiration?page=2&pageSize=5',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.page).toBe(2);
      expect(body.pageSize).toBe(5);
    });

    it('should accept status filter', async () => {
      const alerts = [makeAlertRow({ status: 'NOTIFIED' })];
      mockTransaction.mockResolvedValue([alerts, 1]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/alerts/expiration?status=NOTIFIED',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].status).toBe('NOTIFIED');
    });

    it('should accept threshold filter', async () => {
      mockTransaction.mockResolvedValue([[], 0]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/alerts/expiration?threshold=30',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should accept date range filters', async () => {
      mockTransaction.mockResolvedValue([[], 0]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/alerts/expiration?dateFrom=2025-01-01&dateTo=2025-12-31',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data).toEqual([]);
    });

    it('should accept certificateId filter', async () => {
      const alerts = [makeAlertRow()];
      mockTransaction.mockResolvedValue([alerts, 1]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/alerts/expiration?certificateId=cert-001',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data).toHaveLength(1);
    });

    it('should return empty result when no alerts match', async () => {
      mockTransaction.mockResolvedValue([[], 0]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/alerts/expiration?status=ACKNOWLEDGED',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data).toEqual([]);
      expect(body.total).toBe(0);
    });
  });

  // ── GET /api/alerts/expiration/:id ──────────────────────────────────────

  describe('GET /api/alerts/expiration/:id', () => {
    it('should return alert detail with notifications', async () => {
      const alert = {
        ...makeAlertRow(),
        notifications: [
          {
            id: 'notif-001',
            alertId: 'alert-001',
            channel: 'EMAIL',
            sentAt: new Date('2025-06-01T10:05:00.000Z'),
            status: 'SUCCESS',
            errorMessage: null,
            webhookId: null,
            attemptNumber: 1,
          },
        ],
      };
      mockAlertFindUnique.mockResolvedValue(alert);

      const response = await server.inject({
        method: 'GET',
        url: '/api/alerts/expiration/alert-001',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.id).toBe('alert-001');
      expect(body.notifications).toHaveLength(1);
      expect(body.notifications[0].channel).toBe('EMAIL');
      expect(body.notifications[0].sentAt).toBe('2025-06-01T10:05:00.000Z');
    });

    it('should return 404 when alert not found', async () => {
      mockAlertFindUnique.mockResolvedValue(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/alerts/expiration/nonexistent',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('Not Found');
    });
  });

  // ── PUT /api/alerts/expiration/:id ──────────────────────────────────────

  describe('PUT /api/alerts/expiration/:id', () => {
    it('should acknowledge a PENDING alert', async () => {
      const existing = { ...makeAlertRow(), notifications: [] };
      const updated = makeAlertRow({
        status: 'ACKNOWLEDGED',
        acknowledgedBy: 'admin',
        acknowledgedAt: new Date('2025-06-02T12:00:00.000Z'),
      });

      mockAlertFindUnique.mockResolvedValue(existing);
      mockAlertUpdate.mockResolvedValue(updated);

      const response = await server.inject({
        method: 'PUT',
        url: '/api/alerts/expiration/alert-001',
        payload: { actor: 'admin' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('ACKNOWLEDGED');
      expect(body.acknowledgedBy).toBe('admin');
    });

    it('should default actor to system when not provided', async () => {
      const existing = { ...makeAlertRow(), notifications: [] };
      const updated = makeAlertRow({
        status: 'ACKNOWLEDGED',
        acknowledgedBy: 'system',
        acknowledgedAt: new Date(),
      });

      mockAlertFindUnique.mockResolvedValue(existing);
      mockAlertUpdate.mockResolvedValue(updated);

      const response = await server.inject({
        method: 'PUT',
        url: '/api/alerts/expiration/alert-001',
        payload: {},
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return 404 when alert not found', async () => {
      mockAlertFindUnique.mockResolvedValue(null);

      const response = await server.inject({
        method: 'PUT',
        url: '/api/alerts/expiration/nonexistent',
        payload: { actor: 'admin' },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('Not Found');
    });

    it('should return 409 when alert is already acknowledged', async () => {
      const existing = {
        ...makeAlertRow({
          status: 'ACKNOWLEDGED',
          acknowledgedBy: 'admin',
          acknowledgedAt: new Date(),
        }),
        notifications: [],
      };

      mockAlertFindUnique.mockResolvedValue(existing);

      const response = await server.inject({
        method: 'PUT',
        url: '/api/alerts/expiration/alert-001',
        payload: { actor: 'user2' },
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('Conflict');
    });
  });

  // ── GET /api/certificates/:id/alerts ────────────────────────────────────

  describe('GET /api/certificates/:id/alerts', () => {
    it('should return all alerts for a certificate', async () => {
      const alerts = [
        makeAlertRow({ id: 'a-1', threshold: 7 }),
        makeAlertRow({ id: 'a-2', threshold: 30 }),
      ];
      mockAlertFindMany.mockResolvedValue(alerts);

      const response = await server.inject({
        method: 'GET',
        url: '/api/certificates/cert-001/alerts',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data).toHaveLength(2);
      expect(body.total).toBe(2);
    });

    it('should return empty array when no alerts for certificate', async () => {
      mockAlertFindMany.mockResolvedValue([]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/certificates/cert-no-alerts/alerts',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data).toEqual([]);
      expect(body.total).toBe(0);
    });
  });

  // ── Unsupported methods ─────────────────────────────────────────────────

  describe('Unsupported methods', () => {
    it('should NOT expose POST /api/alerts/expiration', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/alerts/expiration',
        payload: {},
      });

      expect(response.statusCode).toBe(404);
    });

    it('should NOT expose DELETE /api/alerts/expiration/:id', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: '/api/alerts/expiration/alert-001',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should NOT expose PATCH /api/alerts/expiration/:id', async () => {
      const response = await server.inject({
        method: 'PATCH',
        url: '/api/alerts/expiration/alert-001',
        payload: {},
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
