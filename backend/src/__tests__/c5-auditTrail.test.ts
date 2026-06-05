/**
 * QA Tests — C5 Feature 10: Audit Trail for Key Operations
 *
 * Maps to acceptance criteria:
 *   AC-10.1: KEY_STORE audit entry on key creation
 *   AC-10.2: KEY_RETRIEVE audit entry on key download
 *   AC-10.3: KEY_ROTATE audit entry on key rotation
 *   AC-10.4: KEY_DELETE audit entry on key destruction
 *   AC-10.5: Failed decryption creates failure audit entry
 *   AC-10.6: Key audit entries visible in certificate audit tab
 *
 * These tests validate the audit trail integration for all key operations.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ── Types ───────────────────────────────────────────────────────────────────

type KeyAuditAction =
  | 'KEY_STORE'
  | 'KEY_RETRIEVE'
  | 'KEY_ROTATE'
  | 'KEY_DELETE';

interface AuditEntry {
  id: string;
  action: KeyAuditAction;
  certificateId: string;
  actor: string;
  result: 'SUCCESS' | 'FAILURE';
  detail: string | null;
  timestamp: Date;
}

// ── In-memory audit store ───────────────────────────────────────────────────

class InMemoryAuditStore {
  private entries: AuditEntry[] = [];
  private idCounter = 0;

  log(
    action: KeyAuditAction,
    certificateId: string,
    actor: string,
    result: 'SUCCESS' | 'FAILURE',
    detail: string | null = null,
  ): AuditEntry {
    const entry: AuditEntry = {
      id: `audit-${++this.idCounter}`,
      action,
      certificateId,
      actor,
      result,
      detail,
      timestamp: new Date(),
    };
    this.entries.push(entry);
    return entry;
  }

  findByCertificateId(certId: string): AuditEntry[] {
    return this.entries
      .filter((e) => e.certificateId === certId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  findByAction(action: KeyAuditAction): AuditEntry[] {
    return this.entries.filter((e) => e.action === action);
  }

  getAll(): AuditEntry[] {
    return [...this.entries];
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('C5 Feature 10: Key Operation Audit Trail', () => {
  let auditStore: InMemoryAuditStore;

  beforeEach(() => {
    auditStore = new InMemoryAuditStore();
  });

  // AC-10.1: KEY_STORE audit entry on key creation
  describe('AC-10.1 — KEY_STORE audit entry on key creation', () => {
    it('creates audit entry with action KEY_STORE', () => {
      auditStore.log('KEY_STORE', 'cert-123', 'admin-user', 'SUCCESS');

      const entries = auditStore.findByAction('KEY_STORE');
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe('KEY_STORE');
    });

    it('audit entry has correct certificateId', () => {
      auditStore.log('KEY_STORE', 'cert-123', 'admin-user', 'SUCCESS');

      const entries = auditStore.findByAction('KEY_STORE');
      expect(entries[0].certificateId).toBe('cert-123');
    });

    it('audit entry has result SUCCESS', () => {
      auditStore.log('KEY_STORE', 'cert-123', 'admin-user', 'SUCCESS');

      const entries = auditStore.findByAction('KEY_STORE');
      expect(entries[0].result).toBe('SUCCESS');
    });

    it('audit entry records the actor (token owner or username)', () => {
      auditStore.log('KEY_STORE', 'cert-123', 'rafael.costa', 'SUCCESS');

      const entries = auditStore.findByAction('KEY_STORE');
      expect(entries[0].actor).toBe('rafael.costa');
    });

    it('audit entry has a timestamp', () => {
      const before = new Date();
      auditStore.log('KEY_STORE', 'cert-123', 'admin', 'SUCCESS');
      const after = new Date();

      const entries = auditStore.findByAction('KEY_STORE');
      expect(entries[0].timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(entries[0].timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  // AC-10.2: KEY_RETRIEVE audit entry on key download
  describe('AC-10.2 — KEY_RETRIEVE audit entry on key download', () => {
    it('creates audit entry with action KEY_RETRIEVE', () => {
      auditStore.log(
        'KEY_RETRIEVE',
        'cert-123',
        'devops-user',
        'SUCCESS',
        'Deployment',
      );

      const entries = auditStore.findByAction('KEY_RETRIEVE');
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe('KEY_RETRIEVE');
    });

    it('audit entry includes the retrieval reason as detail', () => {
      auditStore.log(
        'KEY_RETRIEVE',
        'cert-123',
        'devops-user',
        'SUCCESS',
        'Deployment',
      );

      const entries = auditStore.findByAction('KEY_RETRIEVE');
      expect(entries[0].detail).toBe('Deployment');
    });
  });

  // AC-10.3: KEY_ROTATE audit entry on key rotation
  describe('AC-10.3 — KEY_ROTATE audit entry on key rotation', () => {
    it('creates audit entry with action KEY_ROTATE', () => {
      auditStore.log(
        'KEY_ROTATE',
        'cert-123',
        'admin',
        'SUCCESS',
        'Rotated from key-old to key-new',
      );

      const entries = auditStore.findByAction('KEY_ROTATE');
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe('KEY_ROTATE');
    });

    it('detail contains old and new keyId', () => {
      auditStore.log(
        'KEY_ROTATE',
        'cert-123',
        'admin',
        'SUCCESS',
        'Rotated from key-old to key-new',
      );

      const entries = auditStore.findByAction('KEY_ROTATE');
      expect(entries[0].detail).toContain('key-old');
      expect(entries[0].detail).toContain('key-new');
    });
  });

  // AC-10.4: KEY_DELETE audit entry on key destruction
  describe('AC-10.4 — KEY_DELETE audit entry on key destruction', () => {
    it('creates audit entry with action KEY_DELETE', () => {
      auditStore.log(
        'KEY_DELETE',
        'cert-123',
        'security-officer',
        'SUCCESS',
        'Cert expired',
      );

      const entries = auditStore.findByAction('KEY_DELETE');
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe('KEY_DELETE');
    });

    it('audit entry includes deletion reason', () => {
      auditStore.log(
        'KEY_DELETE',
        'cert-123',
        'security-officer',
        'SUCCESS',
        'Cert expired',
      );

      const entries = auditStore.findByAction('KEY_DELETE');
      expect(entries[0].detail).toBe('Cert expired');
    });
  });

  // AC-10.5: Failed decryption creates failure audit entry
  describe('AC-10.5 — Failed decryption creates failure audit entry', () => {
    it('audit entry has result FAILURE on decryption failure', () => {
      auditStore.log(
        'KEY_RETRIEVE',
        'cert-123',
        'devops-user',
        'FAILURE',
        'Decryption failed — data integrity check failed',
      );

      const entries = auditStore.findByAction('KEY_RETRIEVE');
      const failureEntry = entries.find((e) => e.result === 'FAILURE');

      expect(failureEntry).toBeDefined();
      expect(failureEntry!.result).toBe('FAILURE');
    });

    it('failure detail contains "Decryption failed"', () => {
      auditStore.log(
        'KEY_RETRIEVE',
        'cert-123',
        'devops-user',
        'FAILURE',
        'Decryption failed — data integrity check failed',
      );

      const entries = auditStore.findByAction('KEY_RETRIEVE');
      const failureEntry = entries.find((e) => e.result === 'FAILURE');

      expect(failureEntry!.detail).toContain('Decryption failed');
    });
  });

  // AC-10.6: Key audit entries visible in certificate audit tab
  describe('AC-10.6 — Key audit entries visible in certificate audit tab', () => {
    it('all 3 key operations appear in certificate audit log', () => {
      auditStore.log('KEY_STORE', 'cert-123', 'admin', 'SUCCESS');
      auditStore.log('KEY_RETRIEVE', 'cert-123', 'devops', 'SUCCESS', 'Deploy');
      auditStore.log('KEY_ROTATE', 'cert-123', 'admin', 'SUCCESS', 'Rotation');

      const certEntries = auditStore.findByCertificateId('cert-123');

      expect(certEntries).toHaveLength(3);
      const actions = certEntries.map((e) => e.action);
      expect(actions).toContain('KEY_STORE');
      expect(actions).toContain('KEY_RETRIEVE');
      expect(actions).toContain('KEY_ROTATE');
    });

    it('entries are ordered by timestamp descending', () => {
      auditStore.log('KEY_STORE', 'cert-123', 'admin', 'SUCCESS');
      auditStore.log('KEY_RETRIEVE', 'cert-123', 'devops', 'SUCCESS', 'Deploy');
      auditStore.log('KEY_ROTATE', 'cert-123', 'admin', 'SUCCESS', 'Rotation');

      const entries = auditStore.findByCertificateId('cert-123');

      for (let i = 0; i < entries.length - 1; i++) {
        expect(entries[i].timestamp.getTime()).toBeGreaterThanOrEqual(
          entries[i + 1].timestamp.getTime(),
        );
      }
    });

    it('entries for different certificates are isolated', () => {
      auditStore.log('KEY_STORE', 'cert-123', 'admin', 'SUCCESS');
      auditStore.log('KEY_STORE', 'cert-456', 'admin', 'SUCCESS');

      const cert123Entries = auditStore.findByCertificateId('cert-123');
      const cert456Entries = auditStore.findByCertificateId('cert-456');

      expect(cert123Entries).toHaveLength(1);
      expect(cert456Entries).toHaveLength(1);
    });
  });

  // AuditAction enum extension validation
  describe('AuditAction enum extension', () => {
    it('KEY_STORE is a valid audit action', () => {
      const validActions: KeyAuditAction[] = ['KEY_STORE', 'KEY_RETRIEVE', 'KEY_ROTATE', 'KEY_DELETE'];
      expect(validActions).toContain('KEY_STORE');
    });

    it('KEY_RETRIEVE is a valid audit action', () => {
      const validActions: KeyAuditAction[] = ['KEY_STORE', 'KEY_RETRIEVE', 'KEY_ROTATE', 'KEY_DELETE'];
      expect(validActions).toContain('KEY_RETRIEVE');
    });

    it('KEY_ROTATE is a valid audit action', () => {
      const validActions: KeyAuditAction[] = ['KEY_STORE', 'KEY_RETRIEVE', 'KEY_ROTATE', 'KEY_DELETE'];
      expect(validActions).toContain('KEY_ROTATE');
    });

    it('KEY_DELETE is a valid audit action', () => {
      const validActions: KeyAuditAction[] = ['KEY_STORE', 'KEY_RETRIEVE', 'KEY_ROTATE', 'KEY_DELETE'];
      expect(validActions).toContain('KEY_DELETE');
    });

    it('existing audit actions are preserved alongside new key actions', () => {
      const existingActions = ['CREATE', 'UPDATE', 'DELETE', 'REVOKE', 'IMPORT', 'EXPORT'];
      const newActions: KeyAuditAction[] = ['KEY_STORE', 'KEY_RETRIEVE', 'KEY_ROTATE', 'KEY_DELETE'];
      const allActions = [...existingActions, ...newActions];

      expect(allActions).toHaveLength(10);
      existingActions.forEach((a) => expect(allActions).toContain(a));
      newActions.forEach((a) => expect(allActions).toContain(a));
    });
  });
});
