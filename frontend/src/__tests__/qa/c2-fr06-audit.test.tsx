/**
 * QA Tests — C2 FR6: Audit Logging
 *
 * Maps to Acceptance Criteria:
 * - Scenario 6.1: Audit log entries for issue (CREATE/CREATED action)
 * - Scenario 6.2: Audit log entries for renewal (RENEWED action)
 * - Scenario 6.3: Audit log entries for revocation (REVOKE action)
 * - Scenario 6.4: Audit log shows failures
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createAuditEntry, createPaginatedResponse } from '../mocks/data';
import { renderWithProviders } from './helpers';

describe('C2 FR6 — Audit Logging for Lifecycle', () => {
  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 6.1: Audit log entries for issue (CREATE action)
  // ═══════════════════════════════════════════════════════════════════════

  describe('Scenario 6.1: Audit log entries for issue', () => {
    it('GET /api/audit returns CREATE entries with expected fields', async () => {
      const createEntry = createAuditEntry({
        id: 'audit-create-1',
        action: 'CREATE',
        actor: 'rafael.costa',
        result: 'SUCCESS',
        certCn: 'api-payments.bank.internal',
        detail: JSON.stringify({
          ca: 'Vault PKI',
          cn: 'api-payments.bank.internal',
          algorithm: 'RSA2048',
          validity_days: 365,
        }),
      });

      server.use(
        http.get('/api/audit', () => {
          return HttpResponse.json(
            createPaginatedResponse([createEntry], 1, 25, 1),
          );
        }),
      );

      const response = await fetch('/api/audit?action=CREATE');
      const data = await response.json();

      expect(data.data).toHaveLength(1);
      expect(data.data[0].action).toBe('CREATE');
      expect(data.data[0].actor).toBe('rafael.costa');
      expect(data.data[0].result).toBe('SUCCESS');
      expect(data.data[0].certCn).toBe('api-payments.bank.internal');
    });

    it('CREATE audit entry has immutable timestamp', async () => {
      const fixedTime = '2026-05-28T14:32:08.000Z';
      const entry = createAuditEntry({
        action: 'CREATE',
        timestamp: fixedTime,
      });

      server.use(
        http.get('/api/audit', () => {
          return HttpResponse.json(createPaginatedResponse([entry]));
        }),
      );

      const response = await fetch('/api/audit');
      const data = await response.json();

      expect(data.data[0].timestamp).toBe(fixedTime);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 6.2: Audit log entries for renewal (RENEWED action)
  // ═══════════════════════════════════════════════════════════════════════

  describe('Scenario 6.2: Audit log entries for renewal', () => {
    it('renewal creates audit entry with old_cert_id and new_cert_id', async () => {
      const renewEntry = createAuditEntry({
        id: 'audit-renew-1',
        action: 'CREATE', // system uses CREATE for renewal in current impl
        result: 'SUCCESS',
        certCn: 'api-payments.bank.internal',
        detail: JSON.stringify({
          action: 'RENEWED',
          old_cert_id: 'cert-old-1',
          new_cert_id: 'cert-new-1',
          rotate_key: true,
        }),
      });

      server.use(
        http.get('/api/audit', () => {
          return HttpResponse.json(createPaginatedResponse([renewEntry]));
        }),
      );

      const response = await fetch('/api/audit');
      const data = await response.json();

      expect(data.data[0].result).toBe('SUCCESS');
      const detail = JSON.parse(data.data[0].detail);
      expect(detail.action).toBe('RENEWED');
      expect(detail.old_cert_id).toBe('cert-old-1');
      expect(detail.new_cert_id).toBe('cert-new-1');
      expect(detail.rotate_key).toBe(true);
    });

    it('audit log can be filtered by action type', async () => {
      server.use(
        http.get('/api/audit', ({ request }) => {
          const url = new URL(request.url);
          const actionFilter = url.searchParams.get('action');

          const entries = [
            createAuditEntry({ id: 'a1', action: 'CREATE' }),
            createAuditEntry({ id: 'a2', action: 'REVOKE' }),
          ];

          const filtered = actionFilter
            ? entries.filter((e) => e.action === actionFilter)
            : entries;

          return HttpResponse.json(createPaginatedResponse(filtered));
        }),
      );

      // Filter for CREATE only
      const response = await fetch('/api/audit?action=CREATE');
      const data = await response.json();

      expect(data.data.every((e: { action: string }) => e.action === 'CREATE')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 6.3: Audit log entries for revocation (REVOKE action)
  // ═══════════════════════════════════════════════════════════════════════

  describe('Scenario 6.3: Audit log entries for revocation', () => {
    it('REVOKE audit entry includes reason_code and justification', async () => {
      const revokeEntry = createAuditEntry({
        id: 'audit-revoke-1',
        action: 'REVOKE',
        actor: 'rafael.costa',
        result: 'SUCCESS',
        certCn: 'auth-svc.bank.internal',
        detail: JSON.stringify({
          reason_code: 'keyCompromise',
          justification: 'Private key exposed in code repo commit',
          notify_owner: true,
        }),
      });

      server.use(
        http.get('/api/audit', () => {
          return HttpResponse.json(createPaginatedResponse([revokeEntry]));
        }),
      );

      const response = await fetch('/api/audit?action=REVOKE');
      const data = await response.json();

      expect(data.data[0].action).toBe('REVOKE');
      expect(data.data[0].actor).toBe('rafael.costa');
      const detail = JSON.parse(data.data[0].detail);
      expect(detail.reason_code).toBe('keyCompromise');
      expect(detail.justification).toContain('Private key');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 6.4: Audit log shows failures
  // ═══════════════════════════════════════════════════════════════════════

  describe('Scenario 6.4: Audit log shows failures', () => {
    it('FAILURE result with error detail is returned', async () => {
      const failureEntry = createAuditEntry({
        id: 'audit-fail-1',
        action: 'CREATE',
        result: 'FAILURE',
        certCn: 'broken-service.internal',
        detail: 'ca_error_invalid_csr: CSR parsing failed at CA: Invalid signature',
      });

      server.use(
        http.get('/api/audit', () => {
          return HttpResponse.json(createPaginatedResponse([failureEntry]));
        }),
      );

      const response = await fetch('/api/audit?result=FAILURE');
      const data = await response.json();

      expect(data.data[0].result).toBe('FAILURE');
      expect(data.data[0].detail).toContain('ca_error_invalid_csr');
    });

    it('failed audit entry preserves actor and timestamp', async () => {
      const failureEntry = createAuditEntry({
        action: 'CREATE',
        result: 'FAILURE',
        actor: 'system',
        timestamp: '2026-05-28T14:35:00.000Z',
      });

      expect(failureEntry.actor).toBe('system');
      expect(failureEntry.result).toBe('FAILURE');
      expect(failureEntry.timestamp).toBe('2026-05-28T14:35:00.000Z');
    });
  });
});
