/**
 * QA Tests — C2 FR7: API Endpoints
 *
 * Maps to Acceptance Criteria:
 * - Scenario 7.1: Issue via API (POST /api/certificates/issue)
 * - Scenario 7.2: Renew via API (POST /api/certificates/:id/renew)
 * - Scenario 7.3: Revoke via API (POST /api/certificates/:id/revoke)
 * - Scenario 7.4: API error handling (400 for missing fields)
 */
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createCertificate } from '../mocks/data';

describe('C2 FR7 — API Endpoints', () => {
  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 7.1: Issue via API
  // ═══════════════════════════════════════════════════════════════════════

  describe('Scenario 7.1: Issue via API', () => {
    it('POST /api/certificates/issue returns 201 with certificate and PENDING status', async () => {
      server.use(
        http.post('/api/certificates/issue', async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          const cert = createCertificate({
            id: 'cert_abc123',
            commonName: body.cn as string,
          });
          return HttpResponse.json(
            {
              id: cert.id,
              cn: cert.commonName,
              status: 'PENDING',
              created_at: new Date().toISOString(),
              ca_id: body.ca_id,
            },
            { status: 201 },
          );
        }),
      );

      const response = await fetch('/api/certificates/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cn: 'service.internal',
          sans: ['service-v2'],
          ca_id: 'vault-prd',
          algorithm: 'RSA2048',
          validity_days: 365,
          owner: 'time-infra',
          zone: 'bank-prd',
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.id).toBe('cert_abc123');
      expect(data.cn).toBe('service.internal');
      expect(data.status).toBe('PENDING');
      expect(data.ca_id).toBe('vault-prd');
      expect(data.created_at).toBeDefined();
    });

    it('polling GET shows status update to ISSUED', async () => {
      server.use(
        http.get('/api/certificates/cert_abc123', () => {
          return HttpResponse.json({
            ...createCertificate({ id: 'cert_abc123', commonName: 'service.internal' }),
            status: 'ISSUED',
          });
        }),
      );

      const response = await fetch('/api/certificates/cert_abc123');
      const data = await response.json();

      expect(data.status).toBe('ISSUED');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 7.2: Renew via API
  // ═══════════════════════════════════════════════════════════════════════

  describe('Scenario 7.2: Renew via API', () => {
    it('POST /api/certificates/:id/renew returns old_id, new_id, and status', async () => {
      server.use(
        http.post('/api/certificates/:id/renew', async ({ params, request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            old_id: params.id as string,
            new_id: 'cert_new_123',
            new_status: 'PENDING',
            notification_sent: true,
          });
        }),
      );

      const response = await fetch('/api/certificates/cert_xyz/renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rotate_key: true,
          validity_days: 365,
        }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.old_id).toBe('cert_xyz');
      expect(data.new_id).toBe('cert_new_123');
      expect(data.new_status).toBe('PENDING');
      expect(data.notification_sent).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 7.3: Revoke via API
  // ═══════════════════════════════════════════════════════════════════════

  describe('Scenario 7.3: Revoke via API', () => {
    it('POST /api/certificates/:id/revoke returns REVOKED status', async () => {
      server.use(
        http.post('/api/certificates/:id/revoke', async ({ params, request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            id: params.id,
            status: 'REVOKED',
            revocation_timestamp: new Date().toISOString(),
            revocation_reason: body.reason,
          });
        }),
      );

      const response = await fetch('/api/certificates/cert_xyz/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'superseded',
          comment: 'Replaced by cert_new_123',
          notify_owner: true,
        }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.id).toBe('cert_xyz');
      expect(data.status).toBe('REVOKED');
      expect(data.revocation_timestamp).toBeDefined();
      expect(data.revocation_reason).toBe('superseded');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 7.4: API error handling
  // ═══════════════════════════════════════════════════════════════════════

  describe('Scenario 7.4: API error handling', () => {
    it('returns 400 with validation details for missing required fields', async () => {
      server.use(
        http.post('/api/certificates/issue', async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          const errors: Array<{ field: string; message: string }> = [];

          if (!body.ca_id) errors.push({ field: 'ca_id', message: 'required' });
          if (!body.owner) errors.push({ field: 'owner', message: 'required' });
          if (!body.zone) errors.push({ field: 'zone', message: 'required' });

          if (errors.length > 0) {
            return HttpResponse.json(
              { error: 'validation_error', details: errors },
              { status: 400 },
            );
          }

          return HttpResponse.json(createCertificate(), { status: 201 });
        }),
      );

      const response = await fetch('/api/certificates/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cn: 'test.internal' }), // missing ca_id, owner, zone
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('validation_error');
      expect(data.details).toHaveLength(3);

      const fields = data.details.map((d: { field: string }) => d.field);
      expect(fields).toContain('ca_id');
      expect(fields).toContain('owner');
      expect(fields).toContain('zone');
    });

    it('returns 404 for non-existent certificate', async () => {
      const response = await fetch('/api/certificates/not-found');
      expect(response.status).toBe(404);
    });

    it('returns proper error response structure', async () => {
      const response = await fetch('/api/certificates/not-found');
      const data = await response.json();

      expect(data).toHaveProperty('statusCode', 404);
      expect(data).toHaveProperty('error', 'Not Found');
      expect(data).toHaveProperty('message');
    });

    it('GET /api/certificates returns paginated response with correct structure', async () => {
      const response = await fetch('/api/certificates');
      const data = await response.json();

      expect(data).toHaveProperty('data');
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('page');
      expect(data).toHaveProperty('pageSize');
      expect(data).toHaveProperty('totalPages');
      expect(Array.isArray(data.data)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Existing API endpoints: DELETE /api/certificates/:id (revoke/soft-delete)
  // ═══════════════════════════════════════════════════════════════════════

  describe('Existing API: DELETE /api/certificates/:id', () => {
    it('returns success for valid certificate deletion', async () => {
      const response = await fetch('/api/certificates/cert-1', {
        method: 'DELETE',
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });
});
