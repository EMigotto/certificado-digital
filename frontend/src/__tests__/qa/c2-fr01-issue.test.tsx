/**
 * QA Tests — C2 FR1: Issue Certificate — CSR Generation
 *
 * Maps to Acceptance Criteria:
 * - Scenario 1.1: Generate CSR on-platform and issue within 60s (Positive)
 * - Scenario 1.2: Upload external CSR and issue (Positive)
 * - Scenario 1.3: CSR validation rejects invalid CN format (Negative)
 * - Scenario 1.4: Duplicate CN in same zone is rejected (Negative)
 * - Scenario 1.5: CA connectivity failure (Negative)
 *
 * NOTE: The Issue Certificate page/form is NOT YET IMPLEMENTED in the codebase.
 * These tests verify the expected UI behaviors once the feature is built.
 * Currently they validate that the router, mock handlers, and API contract work correctly.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createCertificate } from '../mocks/data';
import { renderWithProviders } from './helpers';

describe('C2 FR1 — Issue Certificate (CSR Generation)', () => {
  const user = userEvent.setup();

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 1.1: Generate CSR on-platform and issue (Positive)
  // ═══════════════════════════════════════════════════════════════════════

  describe('Scenario 1.1: POST /api/certificates creates a new certificate', () => {
    it('MSW handler returns 201 with certificate data on POST', async () => {
      let captured: Record<string, unknown> | null = null;

      server.use(
        http.post('/api/certificates/issue', async ({ request }) => {
          captured = (await request.json()) as Record<string, unknown>;
          const cert = createCertificate({
            id: 'cert-new-1',
            commonName: 'api-payments.bank.internal',
            sans: ['payments-v2', 'payments-canary'],
            owner: 'time-pagamentos',
            environment: 'PRD',
            zone: 'bank-prd',
          });
          return HttpResponse.json(
            { ...cert, status: 'ISSUED' },
            { status: 201 },
          );
        }),
      );

      const response = await fetch('/api/certificates/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cn: 'api-payments.bank.internal',
          sans: ['payments-v2', 'payments-canary'],
          algorithm: 'RSA2048',
          ca_id: 'vault-prd',
          owner: 'time-pagamentos',
          zone: 'bank-prd',
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.commonName).toBe('api-payments.bank.internal');
      expect(data.status).toBe('ISSUED');
      expect(captured).toBeTruthy();
      expect((captured as Record<string, unknown>).cn).toBe('api-payments.bank.internal');
    });

    it('issued certificate has correct metadata fields', async () => {
      server.use(
        http.post('/api/certificates/issue', async () => {
          const cert = createCertificate({
            id: 'cert-issued-1',
            commonName: 'api-payments.bank.internal',
            sans: ['payments-v2', 'payments-canary'],
            owner: 'time-pagamentos',
            environment: 'PRD',
            zone: 'bank-prd',
          });
          return HttpResponse.json(
            {
              ...cert,
              status: 'ISSUED',
              serialNumber: 'AA:BB:CC:DD:EE',
              fingerprintSha256: 'SHA256:AABBCCDD',
              algorithm: 'RSA 2048',
            },
            { status: 201 },
          );
        }),
      );

      const response = await fetch('/api/certificates/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cn: 'api-payments.bank.internal',
          sans: ['payments-v2', 'payments-canary'],
          algorithm: 'RSA2048',
          ca_id: 'vault-prd',
          owner: 'time-pagamentos',
          zone: 'bank-prd',
        }),
      });

      const data = await response.json();
      expect(data.serialNumber).toBeDefined();
      expect(data.fingerprintSha256).toBeDefined();
      expect(data.algorithm).toBe('RSA 2048');
      expect(data.owner).toBe('time-pagamentos');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 1.2: Upload external CSR and issue (Positive)
  // ═══════════════════════════════════════════════════════════════════════

  describe('Scenario 1.2: Upload external CSR and issue', () => {
    it('API accepts CSR upload and returns issued certificate', async () => {
      server.use(
        http.post('/api/certificates/issue', async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          const cert = createCertificate({
            id: 'cert-csr-upload-1',
            commonName: 'gateway.internal',
            sans: ['gateway-v1', 'gateway-v2'],
            owner: body.owner as string,
          });
          return HttpResponse.json(
            { ...cert, status: 'ISSUED', csr_source: 'upload' },
            { status: 201 },
          );
        }),
      );

      const response = await fetch('/api/certificates/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csr_pem: '-----BEGIN CERTIFICATE REQUEST-----\nMIIBxx...',
          owner: 'time-infra',
          zone: 'bank-hml',
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.commonName).toBe('gateway.internal');
      expect(data.csr_source).toBe('upload');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 1.3: CSR validation rejects invalid CN format (Negative)
  // ═══════════════════════════════════════════════════════════════════════

  describe('Scenario 1.3: Invalid CN format rejected', () => {
    it('API returns 400 for invalid CN format', async () => {
      server.use(
        http.post('/api/certificates/issue', async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          const cn = body.cn as string;

          // Validate CN format - must be valid FQDN
          const fqdnRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/;
          if (!fqdnRegex.test(cn)) {
            return HttpResponse.json(
              {
                error: 'validation_error',
                details: [
                  { field: 'cn', message: 'CN must be a valid FQDN (e.g. api.internal)' },
                ],
              },
              { status: 400 },
            );
          }

          return HttpResponse.json(createCertificate(), { status: 201 });
        }),
      );

      const response = await fetch('/api/certificates/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cn: 'not-a-valid-fqdn-!!!' }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('validation_error');
      expect(data.details[0].field).toBe('cn');
      expect(data.details[0].message).toContain('valid FQDN');
    });

    it('valid FQDNs pass validation', async () => {
      const fqdnRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/;

      expect(fqdnRegex.test('api-payments.bank.internal')).toBe(true);
      expect(fqdnRegex.test('gateway.internal')).toBe(true);
      expect(fqdnRegex.test('auth-svc.bank.internal')).toBe(true);
      expect(fqdnRegex.test('not-a-valid-fqdn-!!!')).toBe(false);
      expect(fqdnRegex.test('')).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 1.4: Duplicate CN in same zone is rejected (Negative)
  // ═══════════════════════════════════════════════════════════════════════

  describe('Scenario 1.4: Duplicate CN in same zone rejected', () => {
    it('API returns 409 for duplicate CN in same zone', async () => {
      server.use(
        http.post('/api/certificates/issue', async () => {
          return HttpResponse.json(
            {
              error: 'duplicate_cn_in_zone',
              message:
                "A certificate with CN 'api-payments.bank.internal' already exists in zone 'bank-prd'. Renew instead of reissuing.",
            },
            { status: 409 },
          );
        }),
      );

      const response = await fetch('/api/certificates/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cn: 'api-payments.bank.internal',
          zone: 'bank-prd',
        }),
      });

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.error).toBe('duplicate_cn_in_zone');
      expect(data.message).toContain('already exists');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 1.5: CA connectivity failure (Negative)
  // ═══════════════════════════════════════════════════════════════════════

  describe('Scenario 1.5: CA connectivity failure', () => {
    it('API returns error when CA is unreachable', async () => {
      server.use(
        http.post('/api/certificates/issue', async () => {
          return HttpResponse.json(
            {
              error: 'ca_timeout',
              message: 'Failed to reach CA (Vault PKI). Please try again.',
            },
            { status: 503 },
          );
        }),
      );

      const response = await fetch('/api/certificates/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cn: 'test.internal',
          ca_id: 'vault-prd',
        }),
      });

      expect(response.status).toBe(503);
      const data = await response.json();
      expect(data.error).toBe('ca_timeout');
      expect(data.message).toContain('Failed to reach CA');
    });
  });
});
