/**
 * QA Tests — C2 Lifecycle: Audit Logging
 *
 * Maps to Acceptance Criteria:
 * - FR6 Scenario 6.1: Audit log entries for issue (CREATED action)
 * - FR6 Scenario 6.2: Audit log entries for renewal (RENEWED action)
 * - FR6 Scenario 6.3: Audit log entries for revocation (REVOKED action)
 * - FR6 Scenario 6.4: Audit log shows failures
 */
import { describe, it, expect } from 'vitest';
import {
  sanitizeForAudit,
  mapToApiAuditEntry,
} from '../services/auditService.js';

// ─── Helper: create a Prisma-like audit entry ──────────────────────────────

function makeAuditEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'audit-1',
    certificateId: 'cert-1',
    certCn: 'api-payments.bank.internal',
    action: 'CREATE',
    actor: 'rafael.costa',
    result: 'SUCCESS',
    detail: 'Certificate created via UI',
    changes: null,
    batchId: null,
    timestamp: new Date('2026-05-28T14:32:08Z'),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FR6 Scenario 6.1: Audit log entries for issue
// ═══════════════════════════════════════════════════════════════════════════

describe('FR6 — Audit Logging for Lifecycle', () => {
  describe('Scenario 6.1: Audit log entries for issue (CREATED)', () => {
    it('maps a CREATE audit entry to API format with ISO timestamp', () => {
      const prismaEntry = makeAuditEntry({
        action: 'CREATE',
        detail: JSON.stringify({
          ca: 'Vault PKI',
          cn: 'api-payments.bank.internal',
          algorithm: 'RSA2048',
          validity_days: 365,
        }),
      });

      const apiEntry = mapToApiAuditEntry(prismaEntry as never);

      expect(apiEntry.action).toBe('CREATE');
      expect(apiEntry.actor).toBe('rafael.costa');
      expect(apiEntry.result).toBe('SUCCESS');
      expect(apiEntry.certCn).toBe('api-payments.bank.internal');
      expect(apiEntry.timestamp).toBe('2026-05-28T14:32:08.000Z');
    });

    it('audit entry preserves certificate ID reference', () => {
      const prismaEntry = makeAuditEntry({ certificateId: 'cert-abc123' });
      const apiEntry = mapToApiAuditEntry(prismaEntry as never);

      expect(apiEntry.certificateId).toBe('cert-abc123');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FR6 Scenario 6.3: Audit log entries for revocation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Scenario 6.3: Audit log entries for revocation (REVOKE)', () => {
    it('maps a REVOKE audit entry correctly', () => {
      const prismaEntry = makeAuditEntry({
        action: 'REVOKE',
        detail: JSON.stringify({
          reason_code: 'keyCompromise',
          justification: 'Private key exposed in code repo commit',
          notify_owner: true,
        }),
        result: 'SUCCESS',
      });

      const apiEntry = mapToApiAuditEntry(prismaEntry as never);

      expect(apiEntry.action).toBe('REVOKE');
      expect(apiEntry.result).toBe('SUCCESS');
      expect(apiEntry.detail).toContain('keyCompromise');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FR6 Scenario 6.4: Audit log shows failures
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Scenario 6.4: Audit log shows failures', () => {
    it('maps a FAILURE audit entry correctly', () => {
      const prismaEntry = makeAuditEntry({
        action: 'CREATE',
        result: 'FAILURE',
        detail: 'ca_error_invalid_csr: CSR parsing failed at CA',
      });

      const apiEntry = mapToApiAuditEntry(prismaEntry as never);

      expect(apiEntry.result).toBe('FAILURE');
      expect(apiEntry.detail).toContain('ca_error_invalid_csr');
    });

    it('maps null detail gracefully', () => {
      const prismaEntry = makeAuditEntry({ detail: null });
      const apiEntry = mapToApiAuditEntry(prismaEntry as never);

      expect(apiEntry.detail).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // sanitizeForAudit — NF.3: No sensitive data in audit logs
  // ═══════════════════════════════════════════════════════════════════════════

  describe('sanitizeForAudit — sensitive data redaction', () => {
    it('redacts password field', () => {
      const input = { cn: 'test.internal', password: 'supersecret123' };
      const output = sanitizeForAudit(input);

      expect(output.cn).toBe('test.internal');
      expect(output.password).toBe('[REDACTED]');
    });

    it('redacts privateKey field', () => {
      const input = { cn: 'test.internal', privateKey: '-----BEGIN RSA PRIVATE KEY-----' };
      const output = sanitizeForAudit(input);

      expect(output.privateKey).toBe('[REDACTED]');
    });

    it('redacts pemData field', () => {
      const input = { cn: 'test.internal', pemData: '-----BEGIN CERTIFICATE-----' };
      const output = sanitizeForAudit(input);

      expect(output.pemData).toBe('[REDACTED]');
    });

    it('redacts nested sensitive fields', () => {
      const input = {
        cn: 'test.internal',
        credentials: { password: 'secret', username: 'admin' },
      };
      const output = sanitizeForAudit(input);
      const nested = output.credentials as Record<string, unknown>;

      expect(nested.password).toBe('[REDACTED]');
      expect(nested.username).toBe('admin');
    });

    it('preserves non-sensitive fields unchanged', () => {
      const input = {
        cn: 'test.internal',
        algorithm: 'RSA2048',
        owner: 'time-infra',
        zone: 'bank-prd',
      };
      const output = sanitizeForAudit(input);

      expect(output).toEqual(input);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Audit entry immutability — entries should not be modifiable
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Audit entry immutability', () => {
    it('mapToApiAuditEntry creates a new object (not mutating original)', () => {
      const original = makeAuditEntry();
      const mapped = mapToApiAuditEntry(original as never);

      // They should be different objects
      expect(mapped).not.toBe(original);
      // Changing mapped shouldn't affect original
      (mapped as Record<string, unknown>).action = 'DELETE';
      expect(original.action).toBe('CREATE');
    });
  });
});
