import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ThresholdsMap } from '@certificado-digital/shared';

// ─── Mock Prisma client with vi.hoisted ────────────────────────────────────

const {
  mockPolicyFindMany,
  mockPolicyFindUnique,
  mockPolicyFindFirst,
  mockPolicyCreate,
  mockPolicyUpdate,
  mockPolicyUpdateMany,
  mockWebhookFindMany,
  mockWebhookFindUnique,
  mockWebhookCreate,
  mockWebhookCreateMany,
  mockWebhookUpdate,
  mockWebhookUpdateMany,
  mockWebhookDelete,
  mockTransaction,
} = vi.hoisted(() => ({
  mockPolicyFindMany: vi.fn(),
  mockPolicyFindUnique: vi.fn(),
  mockPolicyFindFirst: vi.fn(),
  mockPolicyCreate: vi.fn(),
  mockPolicyUpdate: vi.fn(),
  mockPolicyUpdateMany: vi.fn(),
  mockWebhookFindMany: vi.fn(),
  mockWebhookFindUnique: vi.fn(),
  mockWebhookCreate: vi.fn(),
  mockWebhookCreateMany: vi.fn(),
  mockWebhookUpdate: vi.fn(),
  mockWebhookUpdateMany: vi.fn(),
  mockWebhookDelete: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock('../prismaClient.js', () => ({
  default: {
    expirationPolicy: {
      findMany: mockPolicyFindMany,
      findUnique: mockPolicyFindUnique,
      findFirst: mockPolicyFindFirst,
      create: mockPolicyCreate,
      update: mockPolicyUpdate,
      updateMany: mockPolicyUpdateMany,
    },
    expirationWebhook: {
      findMany: mockWebhookFindMany,
      findUnique: mockWebhookFindUnique,
      create: mockWebhookCreate,
      createMany: mockWebhookCreateMany,
      update: mockWebhookUpdate,
      updateMany: mockWebhookUpdateMany,
      delete: mockWebhookDelete,
    },
    $transaction: mockTransaction,
  },
}));

import { policyRoutes } from '../routes/policies.js';

// ─── Test helpers ──────────────────────────────────────────────────────────

const NOW = new Date();

const VALID_THRESHOLDS: ThresholdsMap = {
  days_90: { enabled: true, channels: ['email'] },
  days_30: { enabled: true, channels: ['email', 'webhook'] },
  days_7: { enabled: true, channels: ['email', 'webhook'] },
  days_1: { enabled: true, channels: ['email', 'webhook'] },
};

const THRESHOLDS_JSON = JSON.stringify(VALID_THRESHOLDS);

function makePolicy(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pol-001',
    name: 'Default Policy',
    description: 'Global default',
    zoneId: null,
    isDefault: true,
    thresholds: THRESHOLDS_JSON,
    emailEnabled: true,
    emailRecipientsAdditional: null,
    emailSubjectPrefix: null,
    createdBy: 'admin',
    updatedBy: null,
    createdAt: NOW,
    updatedAt: NOW,
    webhooks: [],
    ...overrides,
  };
}

function makeWebhook(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wh-001',
    policyId: 'pol-001',
    url: 'https://hooks.example.com/alert',
    headers: {},
    retryStrategy: null,
    maxRetries: 3,
    timeoutSeconds: 30,
    isActive: true,
    testResult: null,
    lastTestAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Policy Routes', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = Fastify();
    await server.register(policyRoutes);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  // ── GET /api/policies/expiration ──────────────────────────────────────────

  describe('GET /api/policies/expiration', () => {
    it('should return paginated list of policies', async () => {
      mockPolicyFindMany.mockResolvedValue([makePolicy()]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/policies/expiration',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data).toHaveLength(1);
      expect(body.total).toBe(1);
      expect(body.page).toBe(1);
      expect(body.data[0].name).toBe('Default Policy');
      expect(body.data[0].thresholds).toEqual(VALID_THRESHOLDS);
    });

    it('should return empty list when no policies exist', async () => {
      mockPolicyFindMany.mockResolvedValue([]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/policies/expiration',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data).toHaveLength(0);
      expect(body.total).toBe(0);
    });
  });

  // ── POST /api/policies/expiration ─────────────────────────────────────────

  describe('POST /api/policies/expiration', () => {
    it('should create a new policy', async () => {
      const policy = makePolicy();
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          expirationPolicy: {
            create: mockPolicyCreate.mockResolvedValue(policy),
            findUnique: mockPolicyFindUnique.mockResolvedValue(policy),
            updateMany: mockPolicyUpdateMany.mockResolvedValue({ count: 0 }),
          },
          expirationWebhook: {
            createMany: mockWebhookCreateMany,
          },
        });
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/policies/expiration',
        payload: {
          name: 'Default Policy',
          thresholds: VALID_THRESHOLDS,
          emailEnabled: true,
          isDefault: true,
          zoneId: null,
          createdBy: 'admin',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.data.name).toBe('Default Policy');
    });

    it('should return 400 for missing name', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/policies/expiration',
        payload: {
          thresholds: VALID_THRESHOLDS,
          emailEnabled: true,
          isDefault: false,
          zoneId: null,
          createdBy: 'admin',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('Bad Request');
    });

    it('should return 400 for invalid thresholds', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/policies/expiration',
        payload: {
          name: 'Test',
          thresholds: { days_90: 'invalid' },
          emailEnabled: true,
          isDefault: false,
          zoneId: null,
          createdBy: 'admin',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid webhook URL', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/policies/expiration',
        payload: {
          name: 'Test',
          thresholds: VALID_THRESHOLDS,
          emailEnabled: true,
          isDefault: false,
          zoneId: null,
          createdBy: 'admin',
          webhooks: [{ url: 'not-a-url' }],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('Invalid webhook URL');
    });
  });

  // ── GET /api/policies/expiration/:id ──────────────────────────────────────

  describe('GET /api/policies/expiration/:id', () => {
    it('should return policy detail with webhooks', async () => {
      const policy = makePolicy({ webhooks: [makeWebhook()] });
      mockPolicyFindUnique.mockResolvedValue(policy);

      const response = await server.inject({
        method: 'GET',
        url: '/api/policies/expiration/pol-001',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.id).toBe('pol-001');
      expect(body.data.webhooks).toHaveLength(1);
    });

    it('should return 404 for nonexistent policy', async () => {
      mockPolicyFindUnique.mockResolvedValue(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/policies/expiration/nonexistent',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('Not Found');
    });
  });

  // ── PUT /api/policies/expiration/:id ──────────────────────────────────────

  describe('PUT /api/policies/expiration/:id', () => {
    it('should update an existing policy', async () => {
      const original = makePolicy();
      const updated = makePolicy({ name: 'Updated Policy' });
      const findUniqueMock = vi.fn()
        .mockResolvedValueOnce(original) // first call: check existence
        .mockResolvedValueOnce(updated); // second call: return with webhooks
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          expirationPolicy: {
            findUnique: findUniqueMock,
            update: mockPolicyUpdate.mockResolvedValue(updated),
            updateMany: mockPolicyUpdateMany.mockResolvedValue({ count: 0 }),
          },
        });
      });

      const response = await server.inject({
        method: 'PUT',
        url: '/api/policies/expiration/pol-001',
        payload: {
          name: 'Updated Policy',
          updatedBy: 'admin',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.name).toBe('Updated Policy');
    });

    it('should return 404 for nonexistent policy', async () => {
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          expirationPolicy: {
            findUnique: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
            updateMany: vi.fn(),
          },
        });
      });

      const response = await server.inject({
        method: 'PUT',
        url: '/api/policies/expiration/nonexistent',
        payload: {
          name: 'Updated',
          updatedBy: 'admin',
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 for invalid name', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: '/api/policies/expiration/pol-001',
        payload: {
          name: '',
          updatedBy: 'admin',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ── DELETE /api/policies/expiration/:id ────────────────────────────────────

  describe('DELETE /api/policies/expiration/:id', () => {
    it('should soft-delete policy', async () => {
      const policy = makePolicy();
      mockPolicyFindUnique.mockResolvedValue(policy);
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          expirationPolicy: {
            update: mockPolicyUpdate.mockResolvedValue({ ...policy, isDefault: false }),
          },
          expirationWebhook: {
            updateMany: mockWebhookUpdateMany.mockResolvedValue({ count: 0 }),
            findMany: mockWebhookFindMany.mockResolvedValue([]),
          },
        });
      });

      const response = await server.inject({
        method: 'DELETE',
        url: '/api/policies/expiration/pol-001',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.isDefault).toBe(false);
    });

    it('should return 404 for nonexistent policy', async () => {
      mockPolicyFindUnique.mockResolvedValue(null);

      const response = await server.inject({
        method: 'DELETE',
        url: '/api/policies/expiration/nonexistent',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ── GET /api/zones/:zoneId/policies/expiration ────────────────────────────

  describe('GET /api/zones/:zoneId/policies/expiration', () => {
    it('should return zone-specific policy', async () => {
      const policy = makePolicy({ zoneId: 'zone-a' });
      mockPolicyFindFirst.mockResolvedValue(policy);

      const response = await server.inject({
        method: 'GET',
        url: '/api/zones/zone-a/policies/expiration',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.zoneId).toBe('zone-a');
    });

    it('should fallback to global default', async () => {
      const defaultPolicy = makePolicy();
      mockPolicyFindFirst
        .mockResolvedValueOnce(null) // no zone policy
        .mockResolvedValueOnce(defaultPolicy); // global default

      const response = await server.inject({
        method: 'GET',
        url: '/api/zones/zone-none/policies/expiration',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.isDefault).toBe(true);
    });

    it('should return 404 when no policy exists at all', async () => {
      mockPolicyFindFirst.mockResolvedValue(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/zones/zone-orphan/policies/expiration',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ── POST /api/policies/expiration/:id/test-webhook ────────────────────────

  describe('POST /api/policies/expiration/:id/test-webhook', () => {
    it('should return 404 when policy not found', async () => {
      mockPolicyFindUnique.mockResolvedValue(null);

      const response = await server.inject({
        method: 'POST',
        url: '/api/policies/expiration/nonexistent/test-webhook',
        payload: {},
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 when no active webhook found', async () => {
      const policy = makePolicy({ webhooks: [] });
      mockPolicyFindUnique.mockResolvedValue(policy);

      const response = await server.inject({
        method: 'POST',
        url: '/api/policies/expiration/pol-001/test-webhook',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('No active webhook');
    });

    it('should return 400 when webhookId does not belong to policy', async () => {
      const policy = makePolicy({
        webhooks: [makeWebhook({ id: 'wh-001' })],
      });
      mockPolicyFindUnique.mockResolvedValue(policy);

      const response = await server.inject({
        method: 'POST',
        url: '/api/policies/expiration/pol-001/test-webhook',
        payload: { webhookId: 'wh-other' },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('does not belong');
    });
  });
});
