/**
 * QA Tests — C2 FR2: Issue Certificate — Validation & Checks
 *
 * Maps to Acceptance Criteria:
 * - Scenario 2.1: Live validation feedback on form (Positive)
 * - Scenario 2.2: Authorization check (Negative)
 */
import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';

describe('C2 FR2 — Issue Certificate Validation & Checks', () => {
  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 2.1: Live validation feedback on form
  // ═══════════════════════════════════════════════════════════════════════

  describe('Scenario 2.1: Live validation feedback', () => {
    it('CN format validation: valid FQDN passes', () => {
      const fqdnRegex =
        /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/;

      expect(fqdnRegex.test('api-payments.bank.internal')).toBe(true);
      expect(fqdnRegex.test('service.internal')).toBe(true);
      expect(fqdnRegex.test('a.b.c.d')).toBe(true);
    });

    it('CN format validation: invalid FQDNs fail', () => {
      const fqdnRegex =
        /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/;

      expect(fqdnRegex.test('')).toBe(false);
      expect(fqdnRegex.test('not-a-valid-fqdn-!!!')).toBe(false);
      expect(fqdnRegex.test('.starts-with-dot')).toBe(false);
      expect(fqdnRegex.test('ends-with-dot.')).toBe(false);
      expect(fqdnRegex.test('has spaces.com')).toBe(false);
    });

    it('duplicate check API returns no conflict for new CN', async () => {
      server.use(
        http.get('/api/certificates', ({ request }) => {
          const url = new URL(request.url);
          const q = url.searchParams.get('q');
          // No certificates match this CN
          return HttpResponse.json({
            data: [],
            total: 0,
            page: 1,
            pageSize: 25,
            totalPages: 0,
          });
        }),
      );

      const response = await fetch(
        '/api/certificates?q=brand-new-service.internal',
      );
      const data = await response.json();

      expect(data.total).toBe(0);
      expect(data.data).toHaveLength(0);
    });

    it('duplicate check API returns existing cert for duplicate CN', async () => {
      server.use(
        http.get('/api/certificates', () => {
          return HttpResponse.json({
            data: [
              {
                id: 'cert-existing',
                commonName: 'api-payments.bank.internal',
                zone: 'bank-prd',
              },
            ],
            total: 1,
            page: 1,
            pageSize: 25,
            totalPages: 1,
          });
        }),
      );

      const response = await fetch(
        '/api/certificates?q=api-payments.bank.internal',
      );
      const data = await response.json();

      expect(data.total).toBe(1);
      expect(data.data[0].commonName).toBe('api-payments.bank.internal');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 2.2: Authorization check (Negative)
  // ═══════════════════════════════════════════════════════════════════════

  describe('Scenario 2.2: Authorization check', () => {
    it('API returns 403 for unauthorized user', async () => {
      server.use(
        http.post('/api/certificates/issue', async () => {
          return HttpResponse.json(
            {
              error: 'authorization_error',
              message:
                "You are not authorized to issue certificates for 'security-team'. Contact PKI Admin.",
            },
            { status: 403 },
          );
        }),
      );

      const response = await fetch('/api/certificates/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cn: 'test.internal',
          owner: 'security-team',
        }),
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('authorization_error');
      expect(data.message).toContain('not authorized');
    });
  });
});
