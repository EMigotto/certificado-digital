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
import type {
  CaConfig,
  CertificateTimeline,
  RenewalOptions,
  RevocationReasonCode,
  RevocationReasonOption,
  CsrSource,
  KeyAlgorithm,
  Environment,
} from '@certificado-digital/shared';

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
  environment: 'PRD',
  zone: 'bank-prd',
  caName: 'Vault PKI',
  signatureAlgorithm: 'RSA 2048',
});

// ─── Lifecycle mock data ────────────────────────────────────────────────────

const mockCaList: CaConfig[] = [
  {
    id: 'ca-vault-1',
    name: 'Vault PKI',
    provider: 'HashiCorp Vault',
    endpoint: 'https://vault.bank.internal:8200',
    supportedAlgorithms: ['RSA-2048', 'RSA-4096', 'ECDSA-P256'],
    maxValidityDays: 825,
    isDefault: true,
    healthy: true,
    lastHealthCheck: new Date().toISOString(),
  },
  {
    id: 'ca-acm-1',
    name: 'ACM PCA',
    provider: 'AWS ACM Private CA',
    endpoint: null,
    supportedAlgorithms: ['RSA-2048', 'ECDSA-P256', 'ECDSA-P384'],
    maxValidityDays: 365,
    isDefault: false,
    healthy: true,
    lastHealthCheck: new Date().toISOString(),
  },
];

const mockRevocationReasons: RevocationReasonOption[] = [
  { code: 'unspecified', label: 'Não especificado', description: 'Motivo não informado' },
  {
    code: 'keyCompromise',
    label: 'Comprometimento de chave',
    description: 'A chave privada foi comprometida',
  },
  {
    code: 'cACompromise',
    label: 'Comprometimento da CA',
    description: 'A CA emissora foi comprometida',
  },
  {
    code: 'affiliationChanged',
    label: 'Mudança de afiliação',
    description: 'A afiliação do titular mudou',
  },
  {
    code: 'superseded',
    label: 'Substituído',
    description: 'Certificado foi substituído por outro',
  },
  {
    code: 'cessationOfOperation',
    label: 'Cessação de operação',
    description: 'O serviço/entidade não opera mais',
  },
  {
    code: 'certificateHold',
    label: 'Suspensão temporária',
    description: 'Certificado temporariamente suspenso',
  },
  {
    code: 'removeFromCRL',
    label: 'Remover da CRL',
    description: 'Remover certificado da lista de revogação',
  },
  {
    code: 'privilegeWithdrawn',
    label: 'Privilégio retirado',
    description: 'O privilégio associado foi revogado',
  },
  {
    code: 'aACompromise',
    label: 'Comprometimento da AA',
    description: 'A autoridade de atributos foi comprometida',
  },
];

function createMockTimeline(certId: string): CertificateTimeline {
  const now = new Date();
  return {
    certificateId: certId,
    events: [
      {
        id: `evt-${certId}-1`,
        type: 'ISSUED',
        timestamp: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        actor: 'rafael.costa',
        detail: 'Certificate issued via mTLS Control Plane',
        relatedCertificateId: null,
      },
      {
        id: `evt-${certId}-2`,
        type: 'ACTIVATED',
        timestamp: new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000).toISOString(),
        actor: 'system',
        detail: 'Certificate activated after deployment',
        relatedCertificateId: null,
      },
      {
        id: `evt-${certId}-3`,
        type: 'NOTIFICATION_SENT',
        timestamp: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        actor: 'system',
        detail: 'Expiration warning sent: 60 days remaining',
        relatedCertificateId: null,
      },
    ],
  };
}

function createMockRenewalOptions(_certId: string): RenewalOptions {
  return {
    eligible: true,
    reason: null,
    suggestedValidityDays: 365,
    maxValidityDays: 825,
    canRotateKey: true,
    currentAlgorithm: 'RSA-2048',
    availableAlgorithms: ['RSA-2048', 'RSA-4096', 'ECDSA-P256', 'ECDSA-P384'],
  };
}

// ─── Handlers ───────────────────────────────────────────────────────────────

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
    const body = (await request.json()) as Partial<Record<string, unknown>>;
    const cert = createCertificate(body as Parameters<typeof createCertificate>[0]);
    return HttpResponse.json(cert, { status: 201 });
  }),

  // PUT /api/certificates/:id — update certificate
  http.put('/api/certificates/:id', async ({ params, request }) => {
    const body = (await request.json()) as Partial<Record<string, unknown>>;
    const cert = createCertificate({
      ...(body as Parameters<typeof createCertificate>[0]),
      id: params.id as string,
    });
    return HttpResponse.json(cert);
  }),

  // DELETE /api/certificates/:id — delete certificate
  http.delete('/api/certificates/:id', () => {
    return HttpResponse.json({ success: true });
  }),

  // PATCH /api/certificates/:id/revoke — revoke (simple + with reason, backward compat)
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
      status: 'REVOKED',
      revokedAt: new Date().toISOString(),
      revocationReasonCode:
        (body.reasonCode as RevocationReasonCode) ?? 'unspecified',
      revocationJustification: (body.justification as string) ?? null,
      revokedBy: 'rafael.costa',
    });
    return HttpResponse.json(cert);
  }),

  // POST /api/certificates/:id/revoke — enhanced revocation with reason
  http.post('/api/certificates/:id/revoke', async ({ params, request }) => {
    const body = (await request.json()) as {
      reasonCode?: RevocationReasonCode;
      justification?: string;
    } | null;
    const cert = createCertificate({
      id: params.id as string,
      revoked: true,
      status: 'REVOKED',
      revokedAt: new Date().toISOString(),
      revocationReasonCode: body?.reasonCode ?? 'unspecified',
      revocationJustification: body?.justification ?? null,
      revokedBy: 'rafael.costa',
    });
    return HttpResponse.json({
      certificate: cert,
      auditId: `audit-revoke-${params.id as string}`,
    });
  }),

  // POST /api/certificates/issue — issue new certificate
  http.post('/api/certificates/issue', async ({ request }) => {
    const body = (await request.json()) as {
      commonName?: string;
      sans?: string[];
      keyAlgorithm?: KeyAlgorithm;
      csrSource?: CsrSource;
      validityDays?: number;
      owner?: string;
      environment?: Environment;
    };
    const cert = createCertificate({
      commonName: body.commonName ?? 'new-cert.bank.internal',
      sans: body.sans ?? [],
      keyAlgorithm: body.keyAlgorithm ?? 'RSA-2048',
      csrSource: body.csrSource ?? 'generate',
      validityDays: body.validityDays ?? 365,
      owner: body.owner ?? 'unknown',
      environment: body.environment ?? 'DEV',
      status: 'ISSUED',
    });
    return HttpResponse.json(
      { certificate: cert, auditId: `audit-issue-${cert.id}` },
      { status: 201 },
    );
  }),

  // POST /api/certificates/:id/renew — renew certificate
  http.post('/api/certificates/:id/renew', async ({ params, request }) => {
    const body = (await request.json()) as {
      validityDays?: number;
      keyAlgorithm?: KeyAlgorithm;
    };
    const previousId = params.id as string;
    const cert = createCertificate({
      renewalParentId: previousId,
      validityDays: body.validityDays ?? 365,
      keyAlgorithm: body.keyAlgorithm ?? 'RSA-2048',
      csrSource: 'generate',
      status: 'ISSUED',
    });
    return HttpResponse.json({
      certificate: cert,
      previousCertificateId: previousId,
      auditId: `audit-renew-${cert.id}`,
    });
  }),

  // GET /api/certificates/:id/timeline — certificate lifecycle timeline
  http.get('/api/certificates/:id/timeline', ({ params }) => {
    return HttpResponse.json(createMockTimeline(params.id as string));
  }),

  // GET /api/certificates/:id/renewal-options — renewal eligibility
  http.get('/api/certificates/:id/renewal-options', ({ params }) => {
    return HttpResponse.json(createMockRenewalOptions(params.id as string));
  }),

  // GET /api/revocation-reasons — RFC 5280 reason codes
  http.get('/api/revocation-reasons', () => {
    return HttpResponse.json(mockRevocationReasons);
  }),

  // GET /api/cas — list CAs
  http.get('/api/cas', () => {
    return HttpResponse.json(mockCaList);
  }),

  // POST /api/cas/:id/health — check CA health
  http.post('/api/cas/:id/health', () => {
    return HttpResponse.json({ healthy: true, latencyMs: 42, message: null });
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
