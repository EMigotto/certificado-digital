import { http, HttpResponse } from 'msw';
import {
  createCertificate,
  createCertificateList,
  createPaginatedResponse,
  createAuditEntry,
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

  // GET /api/audit — audit log
  http.get('/api/audit', ({ request }) => {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') ?? '1', 10);
    const pageSize = parseInt(url.searchParams.get('pageSize') ?? '25', 10);

    const entries = Array.from({ length: 5 }, (_, i) =>
      createAuditEntry({
        id: `audit-${i + 1}`,
        action: (['CREATE', 'UPDATE', 'DELETE', 'REVOKE'] as const)[i % 4],
        certCn: `service-${i + 1}.bank.internal`,
      }),
    );

    return HttpResponse.json(createPaginatedResponse(entries, page, pageSize, 5));
  }),
];
