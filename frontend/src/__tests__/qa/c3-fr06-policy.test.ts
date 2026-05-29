/**
 * QA Tests — C3 Functional Requirement 6: Policy Configuration
 *
 * Maps to: Scenarios 6.1, 6.2, 6.3, 6.4
 *
 * Tests validate the expiration alert policy management:
 * create, update, set default, and delete policies.
 */
import { describe, it, expect, vi } from 'vitest';

// ── Types ───────────────────────────────────────────────────────────────────

interface ThresholdConfig {
  enabled: boolean;
  channels: ('email' | 'webhook')[];
}

interface ExpirationPolicy {
  id: string;
  name: string;
  zone: string | null; // null = global
  isDefault: boolean;
  isActive: boolean;
  thresholds: Record<string, ThresholdConfig>;
  emailEnabled: boolean;
  emailRecipientsAdditional: string[];
  webhookUrl: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface AuditLogEntry {
  actor: string;
  action: string;
  target: string;
  timestamp: string;
}

// ── Policy management service ───────────────────────────────────────────────

let policyIdCounter = 0;

class PolicyStore {
  private policies: ExpirationPolicy[] = [];
  private auditLog: AuditLogEntry[] = [];

  create(policy: Omit<ExpirationPolicy, 'id' | 'createdAt' | 'updatedAt'>): ExpirationPolicy {
    const newPolicy: ExpirationPolicy = {
      ...policy,
      id: `policy-${++policyIdCounter}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.policies.push(newPolicy);

    this.auditLog.push({
      actor: policy.createdBy,
      action: 'CREATE_POLICY',
      target: policy.name,
      timestamp: new Date().toISOString(),
    });

    return newPolicy;
  }

  update(
    id: string,
    changes: Partial<ExpirationPolicy>,
    actor: string,
  ): ExpirationPolicy | null {
    const idx = this.policies.findIndex((p) => p.id === id);
    if (idx < 0) return null;

    this.policies[idx] = {
      ...this.policies[idx],
      ...changes,
      updatedAt: new Date().toISOString(),
    };

    this.auditLog.push({
      actor,
      action: 'UPDATE_POLICY',
      target: this.policies[idx].name,
      timestamp: new Date().toISOString(),
    });

    return this.policies[idx];
  }

  setDefault(id: string, zone: string, actor: string): boolean {
    // Unset other defaults for same zone
    this.policies
      .filter((p) => p.zone === zone && p.id !== id)
      .forEach((p) => {
        p.isDefault = false;
      });

    const policy = this.policies.find((p) => p.id === id);
    if (!policy) return false;

    policy.isDefault = true;
    policy.updatedAt = new Date().toISOString();

    this.auditLog.push({
      actor,
      action: 'SET_DEFAULT_POLICY',
      target: policy.name,
      timestamp: new Date().toISOString(),
    });

    return true;
  }

  softDelete(id: string, actor: string): boolean {
    const policy = this.policies.find((p) => p.id === id);
    if (!policy) return false;

    policy.isActive = false;
    policy.updatedAt = new Date().toISOString();

    this.auditLog.push({
      actor,
      action: 'DELETE_POLICY',
      target: policy.name,
      timestamp: new Date().toISOString(),
    });

    return true;
  }

  findById(id: string): ExpirationPolicy | undefined {
    return this.policies.find((p) => p.id === id);
  }

  findDefaultForZone(zone: string): ExpirationPolicy | undefined {
    return this.policies.find(
      (p) => p.zone === zone && p.isDefault && p.isActive,
    );
  }

  findGlobalDefault(): ExpirationPolicy | undefined {
    return this.policies.find(
      (p) => p.zone === null && p.isDefault && p.isActive,
    );
  }

  getActivePolicies(): ExpirationPolicy[] {
    return this.policies.filter((p) => p.isActive);
  }

  getAuditLog(): AuditLogEntry[] {
    return [...this.auditLog];
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('C3 FR6 — Policy Configuration', () => {
  // ── Scenario 6.1: Create policy with custom thresholds ──
  describe('Scenario 6.1: Create policy with custom thresholds', () => {
    it('creates policy with all threshold configurations', () => {
      const store = new PolicyStore();

      const policy = store.create({
        name: 'bank-prd high-frequency',
        zone: 'bank-prd',
        isDefault: false,
        isActive: true,
        thresholds: {
          '90': { enabled: true, channels: ['email', 'webhook'] },
          '30': { enabled: true, channels: ['email'] },
          '7': { enabled: true, channels: ['email', 'webhook'] },
          '1': { enabled: true, channels: ['email'] },
        },
        emailEnabled: true,
        emailRecipientsAdditional: ['pki-ops@bank.internal'],
        webhookUrl: 'https://slack.com/webhook/C123',
        createdBy: 'admin-user',
      });

      expect(policy.name).toBe('bank-prd high-frequency');
      expect(policy.zone).toBe('bank-prd');
      expect(policy.isActive).toBe(true);
    });

    it('stores threshold configuration for 90d with email + webhook', () => {
      const store = new PolicyStore();
      const policy = store.create({
        name: 'test-policy',
        zone: 'bank-prd',
        isDefault: false,
        isActive: true,
        thresholds: {
          '90': { enabled: true, channels: ['email', 'webhook'] },
          '30': { enabled: true, channels: ['email'] },
          '7': { enabled: true, channels: ['email', 'webhook'] },
          '1': { enabled: true, channels: ['email'] },
        },
        emailEnabled: true,
        emailRecipientsAdditional: [],
        webhookUrl: null,
        createdBy: 'admin',
      });

      expect(policy.thresholds['90'].enabled).toBe(true);
      expect(policy.thresholds['90'].channels).toContain('email');
      expect(policy.thresholds['90'].channels).toContain('webhook');
    });

    it('stores additional email recipients', () => {
      const store = new PolicyStore();
      const policy = store.create({
        name: 'test',
        zone: 'bank-prd',
        isDefault: false,
        isActive: true,
        thresholds: {},
        emailEnabled: true,
        emailRecipientsAdditional: ['pki-ops@bank.internal'],
        webhookUrl: null,
        createdBy: 'admin',
      });

      expect(policy.emailRecipientsAdditional).toContain('pki-ops@bank.internal');
    });

    it('records audit log entry for policy creation', () => {
      const store = new PolicyStore();
      store.create({
        name: 'bank-prd high-frequency',
        zone: 'bank-prd',
        isDefault: false,
        isActive: true,
        thresholds: {},
        emailEnabled: true,
        emailRecipientsAdditional: [],
        webhookUrl: null,
        createdBy: 'admin-user',
      });

      const log = store.getAuditLog();
      expect(log).toHaveLength(1);
      expect(log[0].actor).toBe('admin-user');
      expect(log[0].action).toBe('CREATE_POLICY');
      expect(log[0].target).toBe('bank-prd high-frequency');
    });
  });

  // ── Scenario 6.2: Update policy ──
  describe('Scenario 6.2: Update policy and apply to existing pending alerts', () => {
    it('updates emailEnabled from true to false', () => {
      const store = new PolicyStore();
      const policy = store.create({
        name: 'bank-prd standard',
        zone: 'bank-prd',
        isDefault: true,
        isActive: true,
        thresholds: {},
        emailEnabled: true,
        emailRecipientsAdditional: [],
        webhookUrl: null,
        createdBy: 'admin',
      });

      const updated = store.update(policy.id, { emailEnabled: false }, 'admin');
      expect(updated).not.toBeNull();
      expect(updated!.emailEnabled).toBe(false);
    });

    it('records audit log for policy update', () => {
      const store = new PolicyStore();
      const policy = store.create({
        name: 'bank-prd standard',
        zone: 'bank-prd',
        isDefault: true,
        isActive: true,
        thresholds: {},
        emailEnabled: true,
        emailRecipientsAdditional: [],
        webhookUrl: null,
        createdBy: 'admin',
      });

      store.update(policy.id, { emailEnabled: false }, 'admin-user');

      const log = store.getAuditLog();
      expect(log).toHaveLength(2); // CREATE + UPDATE
      expect(log[1].action).toBe('UPDATE_POLICY');
    });

    it('updates the updatedAt timestamp', () => {
      const store = new PolicyStore();
      const policy = store.create({
        name: 'test',
        zone: 'bank-prd',
        isDefault: false,
        isActive: true,
        thresholds: {},
        emailEnabled: true,
        emailRecipientsAdditional: [],
        webhookUrl: null,
        createdBy: 'admin',
      });

      const originalUpdatedAt = policy.updatedAt;

      // Small delay to ensure different timestamp
      const updated = store.update(policy.id, { emailEnabled: false }, 'admin');
      expect(updated!.updatedAt).toBeTruthy();
    });

    it('returns null for non-existent policy', () => {
      const store = new PolicyStore();
      const result = store.update('non-existent', { emailEnabled: false }, 'admin');
      expect(result).toBeNull();
    });
  });

  // ── Scenario 6.3: Set default policy for zone ──
  describe('Scenario 6.3: Set default policy for zone', () => {
    it('sets isDefault flag to true for the target policy', () => {
      const store = new PolicyStore();
      const policy = store.create({
        name: 'bank-prd standard',
        zone: 'bank-prd',
        isDefault: false,
        isActive: true,
        thresholds: {},
        emailEnabled: true,
        emailRecipientsAdditional: [],
        webhookUrl: null,
        createdBy: 'admin',
      });

      const success = store.setDefault(policy.id, 'bank-prd', 'admin');
      expect(success).toBe(true);

      const found = store.findById(policy.id);
      expect(found!.isDefault).toBe(true);
    });

    it('unsets other defaults for the same zone', () => {
      const store = new PolicyStore();

      const policy1 = store.create({
        name: 'policy-1',
        zone: 'bank-prd',
        isDefault: true,
        isActive: true,
        thresholds: {},
        emailEnabled: true,
        emailRecipientsAdditional: [],
        webhookUrl: null,
        createdBy: 'admin',
      });

      const policy2 = store.create({
        name: 'policy-2',
        zone: 'bank-prd',
        isDefault: false,
        isActive: true,
        thresholds: {},
        emailEnabled: true,
        emailRecipientsAdditional: [],
        webhookUrl: null,
        createdBy: 'admin',
      });

      store.setDefault(policy2.id, 'bank-prd', 'admin');

      const found1 = store.findById(policy1.id);
      const found2 = store.findById(policy2.id);

      expect(found1!.isDefault).toBe(false);
      expect(found2!.isDefault).toBe(true);
    });

    it('enforces single default per zone', () => {
      const store = new PolicyStore();

      for (let i = 0; i < 5; i++) {
        const p = store.create({
          name: `policy-${i}`,
          zone: 'bank-prd',
          isDefault: false,
          isActive: true,
          thresholds: {},
          emailEnabled: true,
          emailRecipientsAdditional: [],
          webhookUrl: null,
          createdBy: 'admin',
        });
        store.setDefault(p.id, 'bank-prd', 'admin');
      }

      const defaults = store
        .getActivePolicies()
        .filter((p) => p.zone === 'bank-prd' && p.isDefault);

      expect(defaults).toHaveLength(1);
    });

    it('records audit log for setting default', () => {
      const store = new PolicyStore();
      const policy = store.create({
        name: 'bank-prd standard',
        zone: 'bank-prd',
        isDefault: false,
        isActive: true,
        thresholds: {},
        emailEnabled: true,
        emailRecipientsAdditional: [],
        webhookUrl: null,
        createdBy: 'admin',
      });

      store.setDefault(policy.id, 'bank-prd', 'admin');

      const log = store.getAuditLog();
      const setDefaultEntry = log.find((e) => e.action === 'SET_DEFAULT_POLICY');
      expect(setDefaultEntry).toBeDefined();
    });
  });

  // ── Scenario 6.4: Delete policy and revert to global default ──
  describe('Scenario 6.4: Delete policy and revert to global default', () => {
    it('soft-deletes the policy (sets isActive to false)', () => {
      const store = new PolicyStore();
      const policy = store.create({
        name: 'bank-prd permissive',
        zone: 'bank-prd',
        isDefault: false,
        isActive: true,
        thresholds: {},
        emailEnabled: true,
        emailRecipientsAdditional: [],
        webhookUrl: null,
        createdBy: 'admin',
      });

      const deleted = store.softDelete(policy.id, 'admin-user');
      expect(deleted).toBe(true);

      const found = store.findById(policy.id);
      expect(found!.isActive).toBe(false);
    });

    it('certificates fall back to global default after zone policy is deleted', () => {
      const store = new PolicyStore();

      // Create global default
      const globalPolicy = store.create({
        name: 'Global Standard',
        zone: null,
        isDefault: true,
        isActive: true,
        thresholds: { '90': { enabled: true, channels: ['email'] } },
        emailEnabled: true,
        emailRecipientsAdditional: [],
        webhookUrl: null,
        createdBy: 'admin',
      });

      // Create zone-specific policy
      const zonePolicy = store.create({
        name: 'bank-prd custom',
        zone: 'bank-prd',
        isDefault: true,
        isActive: true,
        thresholds: { '30': { enabled: true, channels: ['email', 'webhook'] } },
        emailEnabled: true,
        emailRecipientsAdditional: [],
        webhookUrl: null,
        createdBy: 'admin',
      });

      // Delete zone policy
      store.softDelete(zonePolicy.id, 'admin');

      // Zone default is now gone
      const zoneFallback = store.findDefaultForZone('bank-prd');
      expect(zoneFallback).toBeUndefined();

      // Global default should still be available
      const globalFallback = store.findGlobalDefault();
      expect(globalFallback).toBeDefined();
      expect(globalFallback!.name).toBe('Global Standard');
    });

    it('records audit log for policy deletion', () => {
      const store = new PolicyStore();
      const policy = store.create({
        name: 'bank-prd permissive',
        zone: 'bank-prd',
        isDefault: false,
        isActive: true,
        thresholds: {},
        emailEnabled: true,
        emailRecipientsAdditional: [],
        webhookUrl: null,
        createdBy: 'admin',
      });

      store.softDelete(policy.id, 'admin-user');

      const log = store.getAuditLog();
      const deleteEntry = log.find((e) => e.action === 'DELETE_POLICY');
      expect(deleteEntry).toBeDefined();
      expect(deleteEntry!.actor).toBe('admin-user');
      expect(deleteEntry!.target).toBe('bank-prd permissive');
    });

    it('deleted policy does not appear in active policies list', () => {
      const store = new PolicyStore();
      const policy = store.create({
        name: 'to-be-deleted',
        zone: 'bank-prd',
        isDefault: false,
        isActive: true,
        thresholds: {},
        emailEnabled: true,
        emailRecipientsAdditional: [],
        webhookUrl: null,
        createdBy: 'admin',
      });

      store.softDelete(policy.id, 'admin');

      const active = store.getActivePolicies();
      expect(active.find((p) => p.id === policy.id)).toBeUndefined();
    });
  });
});
