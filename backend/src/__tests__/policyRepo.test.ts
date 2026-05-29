import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Prisma client ────────────────────────────────────────────────────

const {
  mockPolicyFindMany,
  mockPolicyFindUnique,
  mockPolicyFindFirst,
  mockPolicyCreate,
  mockPolicyUpdate,
  mockPolicyUpdateMany,
  mockWebhookFindUnique,
  mockWebhookCreate,
  mockWebhookCreateMany,
  mockWebhookUpdate,
  mockWebhookUpdateMany,
  mockWebhookDelete,
  mockWebhookFindMany,
  mockTransaction,
} = vi.hoisted(() => ({
  mockPolicyFindMany: vi.fn(),
  mockPolicyFindUnique: vi.fn(),
  mockPolicyFindFirst: vi.fn(),
  mockPolicyCreate: vi.fn(),
  mockPolicyUpdate: vi.fn(),
  mockPolicyUpdateMany: vi.fn(),
  mockWebhookFindUnique: vi.fn(),
  mockWebhookCreate: vi.fn(),
  mockWebhookCreateMany: vi.fn(),
  mockWebhookUpdate: vi.fn(),
  mockWebhookUpdateMany: vi.fn(),
  mockWebhookDelete: vi.fn(),
  mockWebhookFindMany: vi.fn(),
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

import { PolicyRepository } from '../repositories/policyRepo.js';
import prisma from '../prismaClient.js';

// ─── Test helpers ──────────────────────────────────────────────────────────

const NOW = new Date();

/** JSON-encoded ThresholdsMap for tests */
const THRESHOLDS_JSON = JSON.stringify({
  days_90: { enabled: true, channels: ['email'] },
  days_30: { enabled: true, channels: ['email', 'webhook'] },
  days_7: { enabled: true, channels: ['email', 'webhook'] },
  days_1: { enabled: true, channels: ['email', 'webhook'] },
});

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

describe('PolicyRepository', () => {
  let repo: PolicyRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new PolicyRepository(prisma as never);
  });

  describe('findAll', () => {
    it('should return all policies with webhooks', async () => {
      const policies = [makePolicy(), makePolicy({ id: 'pol-002', name: 'Zone A' })];
      mockPolicyFindMany.mockResolvedValue(policies);

      const result = await repo.findAll();

      expect(result).toHaveLength(2);
      expect(mockPolicyFindMany).toHaveBeenCalledWith({
        include: { webhooks: true },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findById', () => {
    it('should return policy by ID with webhooks', async () => {
      const policy = makePolicy();
      mockPolicyFindUnique.mockResolvedValue(policy);

      const result = await repo.findById('pol-001');

      expect(result).toEqual(policy);
      expect(mockPolicyFindUnique).toHaveBeenCalledWith({
        where: { id: 'pol-001' },
        include: { webhooks: true },
      });
    });

    it('should return null when not found', async () => {
      mockPolicyFindUnique.mockResolvedValue(null);

      const result = await repo.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByZoneId', () => {
    it('should return zone-specific policy', async () => {
      const policy = makePolicy({ zoneId: 'zone-a' });
      mockPolicyFindFirst.mockResolvedValue(policy);

      const result = await repo.findByZoneId('zone-a');

      expect(result).toEqual(policy);
      expect(mockPolicyFindFirst).toHaveBeenCalledWith({
        where: { zoneId: 'zone-a' },
        include: { webhooks: true },
      });
    });
  });

  describe('findDefault', () => {
    it('should return global default policy', async () => {
      const policy = makePolicy();
      mockPolicyFindFirst.mockResolvedValue(policy);

      const result = await repo.findDefault();

      expect(result).toEqual(policy);
      expect(mockPolicyFindFirst).toHaveBeenCalledWith({
        where: { zoneId: null, isDefault: true },
        include: { webhooks: true },
      });
    });
  });

  describe('findEffectivePolicy', () => {
    it('should return zone policy when it exists', async () => {
      const zonePolicy = makePolicy({ id: 'pol-zone', zoneId: 'zone-a' });
      mockPolicyFindFirst.mockResolvedValueOnce(zonePolicy);

      const result = await repo.findEffectivePolicy('zone-a');

      expect(result).toEqual(zonePolicy);
    });

    it('should fallback to global default when zone has no policy', async () => {
      const defaultPolicy = makePolicy();
      mockPolicyFindFirst
        .mockResolvedValueOnce(null) // no zone policy
        .mockResolvedValueOnce(defaultPolicy); // fallback to default

      const result = await repo.findEffectivePolicy('zone-no-policy');

      expect(result).toEqual(defaultPolicy);
    });
  });

  describe('createWebhook', () => {
    it('should create a webhook for an existing policy', async () => {
      const policy = makePolicy();
      mockPolicyFindUnique.mockResolvedValue(policy);
      const webhook = makeWebhook();
      mockWebhookCreate.mockResolvedValue(webhook);

      const result = await repo.createWebhook('pol-001', {
        url: 'https://hooks.example.com/alert',
      });

      expect(result).toEqual(webhook);
    });

    it('should return null when policy does not exist', async () => {
      mockPolicyFindUnique.mockResolvedValue(null);

      const result = await repo.createWebhook('nonexistent', {
        url: 'https://hooks.example.com/alert',
      });

      expect(result).toBeNull();
    });
  });

  describe('updateWebhook', () => {
    it('should update existing webhook', async () => {
      const webhook = makeWebhook();
      mockWebhookFindUnique.mockResolvedValue(webhook);
      const updated = makeWebhook({ url: 'https://new-url.example.com' });
      mockWebhookUpdate.mockResolvedValue(updated);

      const result = await repo.updateWebhook('wh-001', {
        url: 'https://new-url.example.com',
      });

      expect(result?.url).toBe('https://new-url.example.com');
    });

    it('should return null for nonexistent webhook', async () => {
      mockWebhookFindUnique.mockResolvedValue(null);

      const result = await repo.updateWebhook('nonexistent', { url: 'https://x.com' });

      expect(result).toBeNull();
    });
  });

  describe('deleteWebhook', () => {
    it('should delete an existing webhook', async () => {
      const webhook = makeWebhook();
      mockWebhookFindUnique.mockResolvedValue(webhook);
      mockWebhookDelete.mockResolvedValue(webhook);

      const result = await repo.deleteWebhook('wh-001');

      expect(result).toEqual(webhook);
    });

    it('should return null for nonexistent webhook', async () => {
      mockWebhookFindUnique.mockResolvedValue(null);

      const result = await repo.deleteWebhook('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('updateWebhookTestResult', () => {
    it('should update test result fields', async () => {
      const webhook = makeWebhook();
      mockWebhookFindUnique.mockResolvedValue(webhook);
      const updated = makeWebhook({ testResult: 'SUCCESS', lastTestAt: NOW });
      mockWebhookUpdate.mockResolvedValue(updated);

      const result = await repo.updateWebhookTestResult('wh-001', 'SUCCESS', NOW);

      expect(result?.testResult).toBe('SUCCESS');
    });
  });
});
