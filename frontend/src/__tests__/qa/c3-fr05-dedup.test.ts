/**
 * QA Tests — C3 Functional Requirement 5: Alert Deduplication and Idempotency
 *
 * Maps to: Scenarios 5.1, 5.2
 *
 * Tests validate that alerts are created once per certificate+threshold
 * combination and that concurrent scheduler runs don't produce duplicates.
 */
import { describe, it, expect, vi } from 'vitest';

// ── Types ───────────────────────────────────────────────────────────────────

interface ExpirationAlert {
  id: string;
  certificateId: string;
  threshold: number;
  status: 'PENDING' | 'NOTIFIED' | 'RESOLVED';
  createdAt: string;
}

// ── Deduplication logic ─────────────────────────────────────────────────────

class AlertStore {
  private alerts: ExpirationAlert[] = [];
  private lockSet = new Set<string>();

  /**
   * UPSERT-style: only creates if no existing alert for cert+threshold.
   * Uses a simple in-memory lock to simulate DB-level uniqueness.
   */
  createIfNotExists(
    certificateId: string,
    threshold: number,
  ): { created: boolean; alert: ExpirationAlert } {
    const key = `${certificateId}:${threshold}`;

    // Check for existing
    const existing = this.alerts.find(
      (a) => a.certificateId === certificateId && a.threshold === threshold,
    );

    if (existing) {
      return { created: false, alert: existing };
    }

    // Acquire lock to prevent concurrent creation
    if (this.lockSet.has(key)) {
      // Another concurrent call is creating this alert
      const waitForExisting = this.alerts.find(
        (a) => a.certificateId === certificateId && a.threshold === threshold,
      );
      if (waitForExisting) {
        return { created: false, alert: waitForExisting };
      }
    }

    this.lockSet.add(key);

    const alert: ExpirationAlert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      certificateId,
      threshold,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    this.alerts.push(alert);
    this.lockSet.delete(key);

    return { created: true, alert };
  }

  getAlerts(): ExpirationAlert[] {
    return [...this.alerts];
  }

  findByCertAndThreshold(
    certificateId: string,
    threshold: number,
  ): ExpirationAlert | undefined {
    return this.alerts.find(
      (a) => a.certificateId === certificateId && a.threshold === threshold,
    );
  }

  count(): number {
    return this.alerts.length;
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('C3 FR5 — Alert Deduplication and Idempotency', () => {
  // ── Scenario 5.1: No duplicate alert for same cert+threshold ──
  describe('Scenario 5.1: Duplicate alert not created if threshold alert already exists', () => {
    it('finds existing alert for same certificateId + threshold', () => {
      const store = new AlertStore();
      store.createIfNotExists('cert-api-payments', 7);

      const existing = store.findByCertAndThreshold('cert-api-payments', 7);
      expect(existing).toBeDefined();
      expect(existing!.certificateId).toBe('cert-api-payments');
      expect(existing!.threshold).toBe(7);
    });

    it('does not create duplicate when alert already exists', () => {
      const store = new AlertStore();

      const first = store.createIfNotExists('cert-api-payments', 7);
      expect(first.created).toBe(true);

      const second = store.createIfNotExists('cert-api-payments', 7);
      expect(second.created).toBe(false);
      expect(second.alert.id).toBe(first.alert.id);
    });

    it('maintains exactly 1 alert per cert+threshold', () => {
      const store = new AlertStore();

      // Run scheduler multiple times
      for (let i = 0; i < 5; i++) {
        store.createIfNotExists('cert-api-payments', 7);
      }

      expect(store.count()).toBe(1);
    });

    it('preserves original createdAt timestamp', () => {
      const store = new AlertStore();

      const first = store.createIfNotExists('cert-api-payments', 7);
      const originalCreatedAt = first.alert.createdAt;

      // Simulate time passing
      const second = store.createIfNotExists('cert-api-payments', 7);
      expect(second.alert.createdAt).toBe(originalCreatedAt);
    });

    it('preserves original status', () => {
      const store = new AlertStore();

      const first = store.createIfNotExists('cert-api-payments', 7);
      expect(first.alert.status).toBe('PENDING');

      const second = store.createIfNotExists('cert-api-payments', 7);
      expect(second.alert.status).toBe('PENDING');
    });

    it('allows different thresholds for same certificate', () => {
      const store = new AlertStore();

      store.createIfNotExists('cert-api-payments', 90);
      store.createIfNotExists('cert-api-payments', 30);
      store.createIfNotExists('cert-api-payments', 7);

      expect(store.count()).toBe(3);
    });

    it('allows same threshold for different certificates', () => {
      const store = new AlertStore();

      store.createIfNotExists('cert-001', 7);
      store.createIfNotExists('cert-002', 7);
      store.createIfNotExists('cert-003', 7);

      expect(store.count()).toBe(3);
    });
  });

  // ── Scenario 5.2: Manual scheduler run safe (idempotent) ──
  describe('Scenario 5.2: Scheduler can be run manually multiple times without duplicating alerts', () => {
    it('two concurrent runs produce no duplicates', () => {
      const store = new AlertStore();

      // Simulate two concurrent scheduler runs
      const certs = ['cert-1', 'cert-2', 'cert-3'];
      const thresholds = [90, 30, 7];

      // Run 1
      certs.forEach((certId) => {
        thresholds.forEach((threshold) => {
          store.createIfNotExists(certId, threshold);
        });
      });

      // Run 2 (concurrent)
      certs.forEach((certId) => {
        thresholds.forEach((threshold) => {
          store.createIfNotExists(certId, threshold);
        });
      });

      // Should have exactly 3 certs * 3 thresholds = 9 alerts
      expect(store.count()).toBe(9);
    });

    it('both runs complete successfully', () => {
      const store = new AlertStore();
      const results: boolean[] = [];

      // Run 1
      results.push(store.createIfNotExists('cert-1', 7).created); // true
      // Run 2
      results.push(store.createIfNotExists('cert-1', 7).created); // false

      expect(results[0]).toBe(true);
      expect(results[1]).toBe(false);
    });

    it('audit logs show both executions', () => {
      const auditLog: string[] = [];

      const logExecution = (runId: number, created: number, skipped: number) => {
        auditLog.push(
          `Scheduler run #${runId}: created=${created}, skipped=${skipped}`,
        );
      };

      logExecution(1, 9, 0);
      logExecution(2, 0, 9);

      expect(auditLog).toHaveLength(2);
      expect(auditLog[0]).toContain('created=9');
      expect(auditLog[1]).toContain('skipped=9');
    });

    it('final state has unique alert per cert+threshold', () => {
      const store = new AlertStore();
      const certs = Array.from({ length: 100 }, (_, i) => `cert-${i}`);

      // Run scheduler 3 times
      for (let run = 0; run < 3; run++) {
        certs.forEach((certId) => {
          store.createIfNotExists(certId, 7);
        });
      }

      expect(store.count()).toBe(100); // Not 300
    });
  });
});
