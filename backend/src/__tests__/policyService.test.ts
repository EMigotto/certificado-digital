import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ThresholdsMap } from '@certificado-digital/shared';
import { PolicyService } from '../services/policyService.js';
import type { PolicyRepository, PolicyWithWebhooks } from '../repositories/policyRepo.js';

// ─── Test helpers ──────────────────────────────────────────────────────────

const NOW = new Date();

const VALID_THRESHOLDS: ThresholdsMap = {
  days_90: { enabled: true, channels: ['email'] },
  days_30: { enabled: true, channels: ['email', 'webhook'] },
  days_7: { enabled: true, channels: ['email', 'webhook'] },
  days_1: { enabled: true, channels: ['email', 'webhook'] },
};

const THRESHOLDS_JSON = JSON.stringify(VALID_THRESHOLDS);

function makePolicyWithWebhooks(
  overrides: Record<string, unknown> = {},
): PolicyWithWebhooks {
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
  } as PolicyWithWebhooks;
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

function createMockRepo(): {
  repo: PolicyRepository;
  mocks: Record<string, ReturnType<typeof vi.fn>>;
} {
  const mocks = {
    findAll: vi.fn(),
    findById: vi.fn(),
    findByZoneId: vi.fn(),
    findDefault: vi.fn(),
    findEffectivePolicy: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    createWebhook: vi.fn(),
    updateWebhook: vi.fn(),
    deleteWebhook: vi.fn(),
    findWebhookById: vi.fn(),
    updateWebhookTestResult: vi.fn(),
  };

  return { repo: mocks as unknown as PolicyRepository, mocks };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('PolicyService', () => {
  let service: PolicyService;
  let mocks: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();
    const { repo, mocks: m } = createMockRepo();
    mocks = m;
    service = new PolicyService(repo);
  });

  // ── listPolicies ───────────────────────────────────────────────────────────

  describe('listPolicies', () => {
    it('should return paginated list of policies', async () => {
      const policies = [
        makePolicyWithWebhooks(),
        makePolicyWithWebhooks({ id: 'pol-002', name: 'Zone A' }),
      ];
      mocks.findAll.mockResolvedValue(policies);

      const result = await service.listPolicies({});

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.data[0].id).toBe('pol-001');
      expect(result.data[0].thresholds).toEqual(VALID_THRESHOLDS);
    });

    it('should apply pagination', async () => {
      const policies = Array.from({ length: 5 }, (_, i) =>
        makePolicyWithWebhooks({ id: `pol-${i}`, name: `Policy ${i}` }),
      );
      mocks.findAll.mockResolvedValue(policies);

      const result = await service.listPolicies({ page: '2', pageSize: '2' });

      expect(result.data).toHaveLength(2);
      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(2);
      expect(result.total).toBe(5);
    });

    it('should return ISO date strings', async () => {
      mocks.findAll.mockResolvedValue([makePolicyWithWebhooks()]);

      const result = await service.listPolicies({});

      expect(result.data[0].createdAt).toBe(NOW.toISOString());
      expect(result.data[0].updatedAt).toBe(NOW.toISOString());
    });
  });

  // ── getPolicy ──────────────────────────────────────────────────────────────

  describe('getPolicy', () => {
    it('should return policy with webhooks', async () => {
      const policy = makePolicyWithWebhooks({
        webhooks: [makeWebhook()],
      });
      mocks.findById.mockResolvedValue(policy);

      const result = await service.getPolicy('pol-001');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('pol-001');
      expect(result!.webhooks).toHaveLength(1);
      expect(result!.webhooks[0].url).toBe('https://hooks.example.com/alert');
    });

    it('should return null for nonexistent policy', async () => {
      mocks.findById.mockResolvedValue(null);

      const result = await service.getPolicy('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ── createPolicy ───────────────────────────────────────────────────────────

  describe('createPolicy', () => {
    it('should create a valid policy', async () => {
      const created = makePolicyWithWebhooks();
      mocks.create.mockResolvedValue(created);

      const result = await service.createPolicy({
        name: 'Default Policy',
        thresholds: VALID_THRESHOLDS,
        emailEnabled: true,
        isDefault: true,
        zoneId: null,
        createdBy: 'admin',
      });

      expect('data' in result).toBe(true);
      if ('data' in result) {
        expect(result.data.name).toBe('Default Policy');
      }
    });

    it('should serialize thresholds as JSON', async () => {
      const created = makePolicyWithWebhooks();
      mocks.create.mockResolvedValue(created);

      await service.createPolicy({
        name: 'Test',
        thresholds: VALID_THRESHOLDS,
        emailEnabled: true,
        isDefault: false,
        zoneId: null,
        createdBy: 'admin',
      });

      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          thresholds: THRESHOLDS_JSON,
        }),
      );
    });

    it('should reject empty name', async () => {
      const result = await service.createPolicy({
        name: '',
        thresholds: VALID_THRESHOLDS,
        emailEnabled: true,
        isDefault: false,
        zoneId: null,
        createdBy: 'admin',
      });

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('name');
      }
    });

    it('should reject invalid thresholds - missing key', async () => {
      const badThresholds = {
        days_90: { enabled: true, channels: ['email'] },
        days_30: { enabled: true, channels: ['email'] },
        days_7: { enabled: true, channels: ['email'] },
        // missing days_1
      } as unknown as ThresholdsMap;

      const result = await service.createPolicy({
        name: 'Test',
        thresholds: badThresholds,
        emailEnabled: true,
        isDefault: false,
        zoneId: null,
        createdBy: 'admin',
      });

      expect('error' in result).toBe(true);
    });

    it('should reject invalid thresholds - bad channel', async () => {
      const badThresholds = {
        days_90: { enabled: true, channels: ['email'] },
        days_30: { enabled: true, channels: ['sms'] }, // invalid channel
        days_7: { enabled: true, channels: ['email'] },
        days_1: { enabled: true, channels: ['email'] },
      } as unknown as ThresholdsMap;

      const result = await service.createPolicy({
        name: 'Test',
        thresholds: badThresholds,
        emailEnabled: true,
        isDefault: false,
        zoneId: null,
        createdBy: 'admin',
      });

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('invalid channel');
      }
    });

    it('should reject invalid webhook URL', async () => {
      const result = await service.createPolicy({
        name: 'Test',
        thresholds: VALID_THRESHOLDS,
        emailEnabled: true,
        isDefault: false,
        zoneId: null,
        createdBy: 'admin',
        webhooks: [{ url: 'not-a-url' }],
      });

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('Invalid webhook URL');
      }
    });

    it('should accept valid webhook URL', async () => {
      const created = makePolicyWithWebhooks({
        webhooks: [makeWebhook()],
      });
      mocks.create.mockResolvedValue(created);

      const result = await service.createPolicy({
        name: 'Test',
        thresholds: VALID_THRESHOLDS,
        emailEnabled: true,
        isDefault: false,
        zoneId: null,
        createdBy: 'admin',
        webhooks: [{ url: 'https://hooks.example.com/alert' }],
      });

      expect('data' in result).toBe(true);
    });

    it('should reject name over 200 characters', async () => {
      const result = await service.createPolicy({
        name: 'a'.repeat(201),
        thresholds: VALID_THRESHOLDS,
        emailEnabled: true,
        isDefault: false,
        zoneId: null,
        createdBy: 'admin',
      });

      expect('error' in result).toBe(true);
    });
  });

  // ── updatePolicy ───────────────────────────────────────────────────────────

  describe('updatePolicy', () => {
    it('should update an existing policy', async () => {
      const updated = makePolicyWithWebhooks({ name: 'Updated' });
      mocks.update.mockResolvedValue(updated);

      const result = await service.updatePolicy('pol-001', {
        name: 'Updated',
        updatedBy: 'admin',
      });

      expect('data' in result).toBe(true);
      if ('data' in result) {
        expect(result.data.name).toBe('Updated');
      }
    });

    it('should return 404 for nonexistent policy', async () => {
      mocks.update.mockResolvedValue(null);

      const result = await service.updatePolicy('nonexistent', {
        name: 'Test',
        updatedBy: 'admin',
      });

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.statusCode).toBe(404);
      }
    });

    it('should validate thresholds on update', async () => {
      const badThresholds = { days_90: 'invalid' } as unknown as ThresholdsMap;
      const result = await service.updatePolicy('pol-001', {
        thresholds: badThresholds,
        updatedBy: 'admin',
      });

      expect('error' in result).toBe(true);
    });

    it('should validate name on update', async () => {
      const result = await service.updatePolicy('pol-001', {
        name: '',
        updatedBy: 'admin',
      });

      expect('error' in result).toBe(true);
    });
  });

  // ── deletePolicy ───────────────────────────────────────────────────────────

  describe('deletePolicy', () => {
    it('should soft-delete policy', async () => {
      const deleted = makePolicyWithWebhooks({ isDefault: false });
      mocks.softDelete.mockResolvedValue(deleted);

      const result = await service.deletePolicy('pol-001');

      expect(result).not.toBeNull();
      expect(result!.isDefault).toBe(false);
    });

    it('should return null for nonexistent policy', async () => {
      mocks.softDelete.mockResolvedValue(null);

      const result = await service.deletePolicy('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ── getZonePolicy ──────────────────────────────────────────────────────────

  describe('getZonePolicy', () => {
    it('should return effective policy for zone', async () => {
      const zonePolicy = makePolicyWithWebhooks({ zoneId: 'zone-a' });
      mocks.findEffectivePolicy.mockResolvedValue(zonePolicy);

      const result = await service.getZonePolicy('zone-a');

      expect(result).not.toBeNull();
      expect(result!.zoneId).toBe('zone-a');
    });

    it('should return null when no policy found', async () => {
      mocks.findEffectivePolicy.mockResolvedValue(null);

      const result = await service.getZonePolicy('zone-none');

      expect(result).toBeNull();
    });
  });

  // ── testWebhook ────────────────────────────────────────────────────────────

  describe('testWebhook', () => {
    it('should return null for nonexistent webhook', async () => {
      mocks.findWebhookById.mockResolvedValue(null);

      const result = await service.testWebhook('nonexistent');

      expect(result).toBeNull();
    });

    it('should handle fetch failure gracefully', async () => {
      const webhook = makeWebhook();
      mocks.findWebhookById.mockResolvedValue(webhook);
      mocks.updateWebhookTestResult.mockResolvedValue(webhook);

      // Mock global fetch to simulate failure
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const result = await service.testWebhook('wh-001');

      expect(result).not.toBeNull();
      expect(result!.success).toBe(false);
      expect(result!.errorMessage).toContain('Connection refused');

      globalThis.fetch = originalFetch;
    });

    it('should handle successful webhook test', async () => {
      const webhook = makeWebhook();
      mocks.findWebhookById.mockResolvedValue(webhook);
      mocks.updateWebhookTestResult.mockResolvedValue(webhook);

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      const result = await service.testWebhook('wh-001');

      expect(result).not.toBeNull();
      expect(result!.success).toBe(true);
      expect(result!.statusCode).toBe(200);
      expect(result!.errorMessage).toBeNull();

      globalThis.fetch = originalFetch;
    });
  });

  // ── thresholds parsing ─────────────────────────────────────────────────────

  describe('thresholds parsing', () => {
    it('should parse valid JSON thresholds', async () => {
      mocks.findAll.mockResolvedValue([makePolicyWithWebhooks()]);

      const result = await service.listPolicies({});

      expect(result.data[0].thresholds).toEqual(VALID_THRESHOLDS);
    });

    it('should handle invalid JSON thresholds with defaults', async () => {
      mocks.findAll.mockResolvedValue([
        makePolicyWithWebhooks({ thresholds: 'invalid-json' }),
      ]);

      const result = await service.listPolicies({});

      // Should return default thresholds for invalid JSON
      expect(result.data[0].thresholds).toHaveProperty('days_90');
      expect(result.data[0].thresholds).toHaveProperty('days_30');
      expect(result.data[0].thresholds).toHaveProperty('days_7');
      expect(result.data[0].thresholds).toHaveProperty('days_1');
    });
  });
});
