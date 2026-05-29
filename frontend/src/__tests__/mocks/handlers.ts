import { http, HttpResponse } from 'msw';
import type { AuditAction } from '@certificado-digital/shared';
import {
  createCertificate,
  createCertificateList,
  createPaginatedResponse,
  createAuditEntry,
  createSampleTimeline,
  createLifecycleAuditEntry,
} from './data';

/**
 * MSW request handlers for all API endpoints.
 * Used by the shared MSW server in tests.
 */

const sampleCertificates = createCertificateList(10);
const sampleCertDetail = createCertificate({
  id: 'cert-detail-1',
  commonName: 'api-payments.bank.internal',
  sans: ['payments-v2.bank.internal', 'payments-canary.bank.internal'],
  owner: 'time-pagamentos',
  environment: 'prd',
  zone: 'bank-prd',
  caProvider: 'Vault PKI',
  algorithm: 'RSA 2048',
});

export const handlers = [
  // GET /api/certificates — list with pagination
  http.get('/api/certificates', ({ request }) => {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') ?? '1', 10);
    const pageSize = parseInt(url.searchParams.get('pageSize') ?? '25', 10);
    const search = url.searchParams.get('search') ?? '';

    let filtered = sampleCertificates;
    if (search) {
      filtered = sampleCertificates.filter(
        (c) =>
          c.commonName.toLowerCase().includes(search.toLowerCase()) ||
          c.owner.toLowerCase().includes(search.toLowerCase()),
      );
    }

    const start = (page - 1) * pageSize;
    const paged = filtered.slice(start, start + pageSize);

    return HttpResponse.json(createPaginatedResponse(paged, page, pageSize, filtered.length));
  }),

  // GET /api/certificates/:id/timeline — certificate lifecycle timeline
  http.get('/api/certificates/:id/timeline', ({ params }) => {
    const { id } = params;
    if (id === 'no-timeline') {
      return HttpResponse.json([]);
    }
    return HttpResponse.json(createSampleTimeline(id as string));
  }),

  // GET /api/certificates/:id — single certificate detail
  http.get('/api/certificates/:id', ({ params }) => {
    const { id } = params;
    if (id === 'not-found') {
      return HttpResponse.json(
        { statusCode: 404, error: 'Not Found', message: 'Certificado não encontrado.' },
        { status: 404 },
      );
    }
    return HttpResponse.json({ ...sampleCertDetail, id });
  }),

  // POST /api/certificates — create certificate
  http.post('/api/certificates', async ({ request }) => {
    const body = await request.json();
    const cert = createCertificate(body as Record<string, unknown>);
    return HttpResponse.json(cert, { status: 201 });
  }),

  // PUT /api/certificates/:id — update certificate
  http.put('/api/certificates/:id', async ({ params, request }) => {
    const body = await request.json();
    const cert = createCertificate({ ...(body as Record<string, unknown>), id: params.id as string });
    return HttpResponse.json(cert);
  }),

  // DELETE /api/certificates/:id — delete certificate
  http.delete('/api/certificates/:id', () => {
    return HttpResponse.json({ success: true });
  }),

  // PATCH /api/certificates/:id/revoke — revoke certificate (simple + with reason)
  http.patch('/api/certificates/:id/revoke', async ({ params, request }) => {
    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      // Simple revoke without body
    }
    const cert = createCertificate({
      id: params.id as string,
      revoked: true,
      revokedAt: new Date().toISOString(),
      revocationReason: body.reasonCode !== undefined
        ? `RFC5280:${body.reasonCode}`
        : 'Unspecified',
    });
    return HttpResponse.json(cert);
  }),

  // POST /api/certificates/:id/revoke — legacy revoke endpoint
  http.post('/api/certificates/:id/revoke', ({ params }) => {
    const cert = createCertificate({ id: params.id as string, revoked: true });
    return HttpResponse.json(cert);
  }),

  // POST /api/certificates/:id/renew — renew certificate
  http.post('/api/certificates/:id/renew', ({ params }) => {
    const newId = `renewed-${params.id as string}`;
    return HttpResponse.json({ newCertificateId: newId });
  }),

  // POST /api/import/certificate — single cert import
  http.post('/api/import/certificate', () => {
    const cert = createCertificate({ id: 'imported-1' });
    return HttpResponse.json(cert, { status: 201 });
  }),

  // POST /api/import/csv — bulk CSV import
  http.post('/api/import/csv', () => {
    return HttpResponse.json({
      imported: 5,
      skipped: 1,
      errors: [],
    });
  }),

  // GET /api/audit — audit log (includes lifecycle events)
  http.get('/api/audit', ({ request }) => {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') ?? '1', 10);
    const pageSize = parseInt(url.searchParams.get('pageSize') ?? '25', 10);

    const actions: AuditAction[] = [
      'CREATE',
      'ISSUE',
      'RENEW',
      'REVOKE',
      'KEY_ROTATED',
      'NOTIFICATION_SENT',
      'UPDATE',
      'DELETE',
    ];

    const entries = actions.map((action, i) => {
      if (action === 'ISSUE') {
        return createLifecycleAuditEntry({
          id: `audit-${i + 1}`,
          action: 'ISSUE',
          certCn: `service-${i + 1}.bank.internal`,
          lifecycleDetails: {
            caName: 'Vault PKI',
            algorithm: 'RSA 2048',
            cn: `service-${i + 1}.bank.internal`,
          },
        });
      }
      if (action === 'RENEW') {
        return createLifecycleAuditEntry({
          id: `audit-${i + 1}`,
          action: 'RENEW',
          certCn: `service-${i + 1}.bank.internal`,
          lifecycleDetails: {
            oldCertId: 'cert-old-123',
            newCertId: 'cert-new-456',
            rotateKey: true,
          },
        });
      }
      if (action === 'REVOKE') {
        return createLifecycleAuditEntry({
          id: `audit-${i + 1}`,
          action: 'REVOKE',
          certCn: `service-${i + 1}.bank.internal`,
          lifecycleDetails: {
            reasonCode: 'keyCompromise',
            justification: 'Key exposed in log files',
          },
        });
      }
      if (action === 'KEY_ROTATED') {
        return createLifecycleAuditEntry({
          id: `audit-${i + 1}`,
          action: 'KEY_ROTATED',
          certCn: `service-${i + 1}.bank.internal`,
          lifecycleDetails: {
            oldAlgorithm: 'RSA 2048',
            newAlgorithm: 'ECDSA P-256',
          },
        });
      }
      if (action === 'NOTIFICATION_SENT') {
        return createLifecycleAuditEntry({
          id: `audit-${i + 1}`,
          action: 'NOTIFICATION_SENT',
          certCn: `service-${i + 1}.bank.internal`,
          lifecycleDetails: {
            recipient: 'team-platform@bank.internal',
            subject: 'Certificate expiring in 7 days',
          },
        });
      }
      return createAuditEntry({
        id: `audit-${i + 1}`,
        action,
        certCn: `service-${i + 1}.bank.internal`,
      });
    });

    return HttpResponse.json(createPaginatedResponse(entries, page, pageSize, entries.length));
  }),

  // GET /api/audit/export — export audit log as CSV/JSON blob
  http.get('/api/audit/export', () => {
    return HttpResponse.text('id,action,certCn,actor,result,timestamp\n');
  }),
];
