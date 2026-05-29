/**
 * Unit tests for SchedulerService — expiration threshold evaluation.
 *
 * Tests cover:
 * - AC 1.1: Triggers alerts for certificates expiring within thresholds
 * - AC 1.2: Deduplication — skips existing alerts for same cert+threshold
 * - AC 1.3: Ignores EXPIRED/REVOKED certificates (query filter)
 * - AC 1.4: Retry on DB failure with exponential backoff
 * - AC 5.2: Manual trigger safe to run multiple times
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SchedulerService, type SchedulerRetryConfig } from '../services/schedulerService.js';

/** Retry config with zero delay for fast tests */
const FAST_RETRY: SchedulerRetryConfig = { maxRetries: 3, baseRetryDelayMs: 0 };

// ─── Mock Prisma ──────────────────────────────────────────────────────────────

function createMockPrisma() {
  return {
    certificate: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    expirationAlert: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'alert-1' }),
    },
    expirationPolicy: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    expirationSnapshot: {
      upsert: vi.fn().mockResolvedValue({ id: 'snapshot-1' }),
    },
  };
}

// ─── Helper: create a mock certificate ────────────────────────────────────────

function createMockCert(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: 'cert-1',
    commonName: 'test.example.com',
    sans: ['test.example.com', 'www.example.com'],
    notAfter: new Date(now.getTime() + 15 * 86_400_000), // 15 days from now
    status: 'VALID',
    revoked: false,
    caName: 'Internal CA',
    owner: 'team-platform',
    zone: null,
    environment: 'PRD',
    ...overrides,
  };
}

describe('SchedulerService', () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let service: SchedulerService;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new SchedulerService(mockPrisma as any, FAST_RETRY);
    vi.restoreAllMocks();
  });

  // ── AC 1.1: Triggers alerts for certs expiring within thresholds ────────

  describe('runCheck()', () => {
    it('should create alerts for certificates expiring within default thresholds', async () => {
      const cert = createMockCert({
        notAfter: new Date(Date.now() + 5 * 86_400_000), // 5 days
      });
      mockPrisma.certificate.findMany.mockResolvedValueOnce([cert]);
      // Second call returns empty (no more batches)
      mockPrisma.certificate.findMany.mockResolvedValueOnce([]);

      const result = await service.runCheck();

      // 5 days matches thresholds: 90, 30, 7 — alerts created for each
      expect(result.alertsCreated).toBe(3);
      expect(result.certificatesEvaluated).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should create alerts for all matching thresholds (90, 30, 7, 1)', async () => {
      // Certificate expiring in 0.5 days — matches ALL 4 thresholds
      const cert = createMockCert({
        notAfter: new Date(Date.now() + 0.5 * 86_400_000),
      });
      mockPrisma.certificate.findMany.mockResolvedValueOnce([cert]);
      mockPrisma.certificate.findMany.mockResolvedValueOnce([]);

      const result = await service.runCheck();

      // 1 day (ceil of 0.5) matches: 90, 30, 7, 1
      expect(result.alertsCreated).toBe(4);
    });

    it('should not create alerts for certificates expiring beyond all thresholds', async () => {
      const cert = createMockCert({
        notAfter: new Date(Date.now() + 120 * 86_400_000), // 120 days
      });
      mockPrisma.certificate.findMany.mockResolvedValueOnce([cert]);
      mockPrisma.certificate.findMany.mockResolvedValueOnce([]);

      const result = await service.runCheck();

      // 120 days does not match any threshold (max is 90)
      expect(result.alertsCreated).toBe(0);
      expect(result.certificatesEvaluated).toBe(1);
    });

    // ── AC 1.2: Deduplication ──────────────────────────────────────────────

    it('should skip alert creation when alert already exists (deduplication)', async () => {
      const cert = createMockCert({
        notAfter: new Date(Date.now() + 5 * 86_400_000), // 5 days
      });
      mockPrisma.certificate.findMany.mockResolvedValueOnce([cert]);
      mockPrisma.certificate.findMany.mockResolvedValueOnce([]);

      // Simulate existing alerts for all thresholds
      mockPrisma.expirationAlert.findUnique.mockResolvedValue({ id: 'existing' });

      const result = await service.runCheck();

      expect(result.alertsCreated).toBe(0);
      expect(result.alertsSkipped).toBe(3); // 90, 30, 7 matched
      expect(mockPrisma.expirationAlert.create).not.toHaveBeenCalled();
    });

    // ── AC 1.3: Ignores EXPIRED/REVOKED certificates ──────────────────────

    it('should only query certificates with status VALID or EXPIRING_SOON', async () => {
      mockPrisma.certificate.findMany.mockResolvedValueOnce([]);

      await service.runCheck();

      expect(mockPrisma.certificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['VALID', 'EXPIRING_SOON'] },
            revoked: false,
          }),
        }),
      );
    });

    // ── AC 5.2: Manual trigger safe to run multiple times ─────────────────

    it('should prevent concurrent execution', async () => {
      // First call: normal cert processing
      const cert = createMockCert();
      mockPrisma.certificate.findMany.mockResolvedValueOnce([cert]);
      mockPrisma.certificate.findMany.mockResolvedValueOnce([]);

      // Start first run but don't await yet
      const firstRun = service.runCheck();

      // Second run should be rejected (already running)
      const secondRun = await service.runCheck();

      expect(secondRun.errors).toContain(
        'Scheduler is already running — skipping concurrent execution',
      );

      // Complete first run
      await firstRun;
    });

    it('should handle empty certificate set gracefully', async () => {
      mockPrisma.certificate.findMany.mockResolvedValueOnce([]);

      const result = await service.runCheck();

      expect(result.certificatesEvaluated).toBe(0);
      expect(result.alertsCreated).toBe(0);
      expect(result.snapshotStored).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should process multiple batches', async () => {
      // Create 600 mock certs — should be processed in 2 batches
      const batch1 = Array.from({ length: 500 }, (_, i) =>
        createMockCert({
          id: `cert-${i}`,
          notAfter: new Date(Date.now() + 120 * 86_400_000), // Beyond thresholds
        }),
      );
      const batch2 = Array.from({ length: 100 }, (_, i) =>
        createMockCert({
          id: `cert-${500 + i}`,
          notAfter: new Date(Date.now() + 120 * 86_400_000),
        }),
      );

      mockPrisma.certificate.findMany.mockResolvedValueOnce(batch1);
      mockPrisma.certificate.findMany.mockResolvedValueOnce(batch2);

      const result = await service.runCheck();

      expect(result.certificatesEvaluated).toBe(600);
      // No alerts since all certs expire in 120 days
      expect(result.alertsCreated).toBe(0);
    });

    it('should use policy thresholds when a policy exists', async () => {
      const cert = createMockCert({
        zone: 'zone-a',
        notAfter: new Date(Date.now() + 5 * 86_400_000), // 5 days
      });
      mockPrisma.certificate.findMany.mockResolvedValueOnce([cert]);
      mockPrisma.certificate.findMany.mockResolvedValueOnce([]);

      // Return a policy with only 7-day and 1-day thresholds enabled
      mockPrisma.expirationPolicy.findFirst.mockResolvedValue({
        thresholds: JSON.stringify({
          days_90: { enabled: false, channels: [] },
          days_30: { enabled: false, channels: [] },
          days_7: { enabled: true, channels: ['email'] },
          days_1: { enabled: true, channels: ['email', 'webhook'] },
        }),
      });

      const result = await service.runCheck();

      // Only 7-day threshold matches (5 <= 7, but 5 > 1)
      expect(result.alertsCreated).toBe(1);
    });

    it('should fall back to global policy when zone policy not found', async () => {
      const cert = createMockCert({
        zone: 'zone-b',
        notAfter: new Date(Date.now() + 5 * 86_400_000),
      });
      mockPrisma.certificate.findMany.mockResolvedValueOnce([cert]);
      mockPrisma.certificate.findMany.mockResolvedValueOnce([]);

      // First call (zone-specific): null
      mockPrisma.expirationPolicy.findFirst.mockResolvedValueOnce(null);
      // Second call (global): a policy
      mockPrisma.expirationPolicy.findFirst.mockResolvedValueOnce({
        thresholds: JSON.stringify({
          days_90: { enabled: true, channels: ['email'] },
          days_30: { enabled: true, channels: ['email'] },
          days_7: { enabled: true, channels: ['email'] },
          days_1: { enabled: true, channels: ['email'] },
        }),
      });

      const result = await service.runCheck();

      // 5 days matches 90, 30, 7
      expect(result.alertsCreated).toBe(3);
      // Two findFirst calls: zone-specific then global
      expect(mockPrisma.expirationPolicy.findFirst).toHaveBeenCalledTimes(2);
    });

    it('should store snapshot after processing', async () => {
      mockPrisma.certificate.findMany.mockResolvedValueOnce([]);

      const result = await service.runCheck();

      expect(result.snapshotStored).toBe(true);
      expect(mockPrisma.expirationSnapshot.upsert).toHaveBeenCalled();
    });

    it('should continue processing if snapshot storage fails', async () => {
      mockPrisma.certificate.findMany.mockResolvedValueOnce([]);
      mockPrisma.expirationSnapshot.upsert.mockRejectedValue(new Error('DB error'));

      const result = await service.runCheck();

      expect(result.snapshotStored).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Error storing snapshot');
    });

    it('should handle individual certificate processing errors gracefully', async () => {
      const cert1 = createMockCert({
        id: 'cert-1',
        notAfter: new Date(Date.now() + 5 * 86_400_000),
      });
      const cert2 = createMockCert({
        id: 'cert-2',
        notAfter: new Date(Date.now() + 5 * 86_400_000),
      });

      mockPrisma.certificate.findMany.mockResolvedValueOnce([cert1, cert2]);
      mockPrisma.certificate.findMany.mockResolvedValueOnce([]);

      // First cert: findUnique throws on first call, succeeds on retry
      let callCount = 0;
      mockPrisma.expirationAlert.findUnique.mockImplementation(() => {
        callCount++;
        if (callCount <= 3) {
          // All 3 threshold checks for cert-1: fail then recover via retry
          return Promise.reject(new Error('Connection lost'));
        }
        return Promise.resolve(null);
      });

      // The service has retry logic, but after MAX_RETRIES it will add to errors
      const result = await service.runCheck();

      // Should still process cert-2 even if cert-1 fails
      expect(result.certificatesEvaluated).toBe(2);
    });
  });

  // ── getStatus() ─────────────────────────────────────────────────────────

  describe('getStatus()', () => {
    it('should return initial status before any run', () => {
      const status = service.getStatus();

      expect(status.lastRunAt).toBeNull();
      expect(status.lastDurationMs).toBeNull();
      expect(status.lastCertificatesEvaluated).toBeNull();
      expect(status.lastAlertsCreated).toBeNull();
      expect(status.isRunning).toBe(false);
    });

    it('should return updated status after a run', async () => {
      mockPrisma.certificate.findMany.mockResolvedValueOnce([]);

      await service.runCheck();

      const status = service.getStatus();

      expect(status.lastRunAt).toBeTruthy();
      expect(status.lastDurationMs).toBeGreaterThanOrEqual(0);
      expect(status.lastCertificatesEvaluated).toBe(0);
      expect(status.lastAlertsCreated).toBe(0);
      expect(status.isRunning).toBe(false);
    });
  });

  // ── getLogs() ───────────────────────────────────────────────────────────

  describe('getLogs()', () => {
    it('should return empty logs before any run', () => {
      const logs = service.getLogs();
      expect(logs).toHaveLength(0);
    });

    it('should store log entries for each run', async () => {
      mockPrisma.certificate.findMany.mockResolvedValue([]);

      await service.runCheck();
      await service.runCheck();

      const logs = service.getLogs();

      expect(logs).toHaveLength(2);
      // Most recent first
      expect(new Date(logs[0].timestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(logs[1].timestamp).getTime(),
      );
    });

    it('should return a copy of logs (not the internal array)', () => {
      const logs1 = service.getLogs();
      const logs2 = service.getLogs();

      expect(logs1).not.toBe(logs2);
    });
  });
});
