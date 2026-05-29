/**
 * QA Tests — C2 FR3: Renew Certificate — Manual Renewal with Key Rotation
 *
 * Maps to Acceptance Criteria:
 * - Scenario 3.1: Renew with key rotation within 60s (Positive)
 * - Scenario 3.2: Renew with same key (faster option) (Positive)
 * - Scenario 3.3: Renewal rejected if cert not expiring soon enough (Negative)
 * - Scenario 3.4: Renewal can be initiated earlier for admin (Positive)
 * - Scenario 3.5: Old and new certificates are tracked (Positive)
 */
import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createCertificate } from '../mocks/data';

describe('C2 FR3 — Renew Certificate', () => {
  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 3.1: Renew with key rotation within 60s (Positive)
  // ═══════════════════════════════════════════════════════════════════════

  describe('Scenario 3.1: Renew with key rotation', () => {
    it('POST /api/certificates/:id/renew returns new certificate with rotate_key=true', async () => {
      server.use(
        http.post('/api/certificates/:id/renew', async ({ params, request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          const newCert = createCertificate({
            id: 'cert-new-renewed',
            commonName: 'api-payments.bank.internal',
            owner: 'time-pagamentos',
          });
          return HttpResponse.json({
            old_id: params.id,
            new_id: newCert.id,
            new_status: 'ISSUED',
            rotate_key: body.rotate_key,
            notification_sent: true,
            certificate: newCert,
          });
        }),
      );

      const response = await fetch('/api/certificates/cert-old-1/renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rotate_key: true,
          validity_days: 365,
        }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.old_id).toBe('cert-old-1');
      expect(data.new_id).toBe('cert-new-renewed');
      expect(data.new_status).toBe('ISSUED');
      expect(data.rotate_key).toBe(true);
      expect(data.notification_sent).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 3.2: Renew with same key (faster option)
  // ═══════════════════════════════════════════════════════════════════════

  describe('Scenario 3.2: Renew with same key', () => {
    it('POST /api/certificates/:id/renew with rotate_key=false skips notification', async () => {
      server.use(
        http.post('/api/certificates/:id/renew', async ({ params, request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          const newCert = createCertificate({
            id: 'cert-new-samekey',
            commonName: 'gateway.internal',
          });
          return HttpResponse.json({
            old_id: params.id,
            new_id: newCert.id,
            new_status: 'ISSUED',
            rotate_key: body.rotate_key,
            notification_sent: false, // no notification for same-key renewal
          });
        }),
      );

      const response = await fetch('/api/certificates/cert-gateway-1/renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rotate_key: false,
          validity_days: 365,
        }),
      });

      const data = await response.json();

      expect(data.rotate_key).toBe(false);
      expect(data.notification_sent).toBe(false);
      expect(data.new_status).toBe('ISSUED');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 3.3: Renewal rejected if cert not expiring soon (Negative)
  // ═══════════════════════════════════════════════════════════════════════

  describe('Scenario 3.3: Renewal rejected if cert not expiring soon enough', () => {
    it('returns 422 when certificate has >30 days until expiry', async () => {
      server.use(
        http.post('/api/certificates/:id/renew', async () => {
          return HttpResponse.json(
            {
              error: 'renewal_not_allowed',
              message:
                'Renewal available when < 30 days until expiry. Current: 120 days.',
            },
            { status: 422 },
          );
        }),
      );

      const response = await fetch('/api/certificates/cert-120days/renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rotate_key: true, validity_days: 365 }),
      });

      expect(response.status).toBe(422);
      const data = await response.json();
      expect(data.error).toBe('renewal_not_allowed');
      expect(data.message).toContain('120 days');
    });

    it('renewal threshold check: 30-day boundary logic', () => {
      const checkRenewalAllowed = (daysUntilExpiry: number, isAdmin: boolean): boolean => {
        if (isAdmin) return daysUntilExpiry <= 90; // admin can renew up to 90 days
        return daysUntilExpiry <= 30;
      };

      expect(checkRenewalAllowed(12, false)).toBe(true); // 12 days, regular user
      expect(checkRenewalAllowed(120, false)).toBe(false); // 120 days, regular user
      expect(checkRenewalAllowed(30, false)).toBe(true); // exact boundary
      expect(checkRenewalAllowed(31, false)).toBe(false); // just over
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 3.4: Renewal can be initiated earlier for admin (Positive)
  // ═══════════════════════════════════════════════════════════════════════

  describe('Scenario 3.4: Admin can initiate early renewal', () => {
    it('admin override allows renewal at 45 days', async () => {
      server.use(
        http.post('/api/certificates/:id/renew', async () => {
          return HttpResponse.json({
            old_id: 'cert-45days',
            new_id: 'cert-new-early',
            new_status: 'ISSUED',
            early_renewal: true,
            note: 'Early renewal — new cert will not be used until old cert expires or is revoked',
          });
        }),
      );

      const response = await fetch('/api/certificates/cert-45days/renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rotate_key: true,
          validity_days: 365,
          admin_override: true,
        }),
      });

      const data = await response.json();
      expect(data.early_renewal).toBe(true);
      expect(data.note).toContain('Early renewal');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 3.5: Old and new certificates are tracked (Positive)
  // ═══════════════════════════════════════════════════════════════════════

  describe('Scenario 3.5: Old and new certificates are tracked', () => {
    it('old certificate shows renewal_pending flag after renewal', async () => {
      server.use(
        http.get('/api/certificates/cert-old-1', () => {
          return HttpResponse.json({
            ...createCertificate({
              id: 'cert-old-1',
              commonName: 'api-payments.bank.internal',
            }),
            renewal_pending: true,
            renewed_to: 'cert-new-1',
          });
        }),
        http.get('/api/certificates/cert-new-1', () => {
          return HttpResponse.json({
            ...createCertificate({
              id: 'cert-new-1',
              commonName: 'api-payments.bank.internal',
            }),
            status: 'ISSUED',
            renewal_of: 'cert-old-1',
          });
        }),
      );

      // Check old cert
      const oldResponse = await fetch('/api/certificates/cert-old-1');
      const oldData = await oldResponse.json();
      expect(oldData.renewal_pending).toBe(true);
      expect(oldData.renewed_to).toBe('cert-new-1');

      // Check new cert
      const newResponse = await fetch('/api/certificates/cert-new-1');
      const newData = await newResponse.json();
      expect(newData.status).toBe('ISSUED');
      expect(newData.renewal_of).toBe('cert-old-1');
    });
  });
});
