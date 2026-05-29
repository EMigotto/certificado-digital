import type { Certificate, AuditLogEntry, PaginatedResponse, TimelineEvent } from '@certificado-digital/shared';

/**
 * Factory functions for generating test certificate data.
 * Used by MSW handlers and individual tests.
 */

let certIdCounter = 0;

/**
 * Creates a single test certificate with realistic defaults.
 * Override any field via the partial parameter.
 */
export function createCertificate(overrides: Partial<Certificate> = {}): Certificate {
  const id = overrides.id ?? `cert-${++certIdCounter}`;
  const now = new Date();
  const notBefore = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const notAfter = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  return {
    id,
    commonName: `service-${id}.bank.internal`,
    subjectDn: `CN=service-${id}.bank.internal, O=Bank Corp`,
    issuerDn: 'CN=Bank Internal CA, O=Bank Corp',
    sans: [`service-${id}.bank.internal`, `service-${id}-v2.bank.internal`],
    serialNumber: `AA:BB:CC:DD:${id.slice(-2).toUpperCase().padStart(2, '0')}`,
    serial: `AA:BB:CC:DD:${id.slice(-2).toUpperCase().padStart(2, '0')}`,
    issuer: 'CN=Bank Internal CA, O=Bank Corp',
    notBefore: notBefore.toISOString(),
    notAfter: notAfter.toISOString(),
    status: 'VALID' as const,
    signatureAlgorithm: 'RSA 2048',
    algorithm: 'RSA 2048',
    keySize: 2048,
    fingerprintSha256: `SHA256:${id}:AABBCCDD`,
    fingerprintSha1: null,
    owner: 'time-plataforma',
    team: null,
    application: 'service-app',
    environment: 'prd',
    zone: 'bank-prd',
    caName: 'Bank Internal CA',
    caProvider: 'Vault PKI',
    importSource: 'MANUAL' as const,
    sourceFile: null,
    revoked: false,
    revokedAt: null,
    revocationReason: null,
    tags: {},
    customFields: {},
    description: '',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };
}

/**
 * Creates a certificate that expires in the given number of days.
 */
export function createExpiringCertificate(
  daysUntilExpiry: number,
  overrides: Partial<Certificate> = {},
): Certificate {
  const now = new Date();
  const notAfter = new Date(now.getTime() + daysUntilExpiry * 24 * 60 * 60 * 1000);
  return createCertificate({ notAfter: notAfter.toISOString(), ...overrides });
}

/**
 * Creates a certificate that has already expired.
 */
export function createExpiredCertificate(
  daysAgo: number,
  overrides: Partial<Certificate> = {},
): Certificate {
  return createExpiringCertificate(-daysAgo, overrides);
}

/**
 * Creates a revoked certificate.
 */
export function createRevokedCertificate(overrides: Partial<Certificate> = {}): Certificate {
  return createCertificate({ revoked: true, ...overrides });
}

/**
 * Creates a certificate with a very long CN (255+ chars) for edge case testing.
 */
export function createLongCnCertificate(): Certificate {
  const longCn = 'a'.repeat(256) + '.bank.internal';
  return createCertificate({ commonName: longCn });
}

/**
 * Creates a certificate with 100+ SANs for edge case testing.
 */
export function createManySansCertificate(): Certificate {
  const sans = Array.from({ length: 120 }, (_, i) => `san-${i}.bank.internal`);
  return createCertificate({ sans });
}

/**
 * Creates an array of N test certificates with sequential IDs.
 */
export function createCertificateList(count: number): Certificate[] {
  return Array.from({ length: count }, (_, i) =>
    createCertificate({
      id: `cert-list-${i + 1}`,
      commonName: `service-${i + 1}.bank.internal`,
    }),
  );
}

/**
 * Wraps data in a paginated response envelope.
 */
export function createPaginatedResponse<T>(
  data: T[],
  page = 1,
  pageSize = 25,
  total?: number,
): PaginatedResponse<T> {
  const totalItems = total ?? data.length;
  return {
    data,
    total: totalItems,
    page,
    pageSize,
    totalPages: Math.ceil(totalItems / pageSize),
  };
}

let auditIdCounter = 0;

/**
 * Creates a single audit log entry.
 */
export function createAuditEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  const id = overrides.id ?? `audit-${++auditIdCounter}`;
  return {
    id,
    certId: 'cert-1',
    certCn: 'api-payments.bank.internal',
    action: 'CREATE',
    actor: 'rafael.costa',
    result: 'SUCCESS',
    detail: 'Certificate created via UI',
    batchId: null,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

let timelineIdCounter = 0;

/**
 * Creates a single timeline event.
 */
export function createTimelineEvent(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  const id = overrides.id ?? `tl-${++timelineIdCounter}`;
  return {
    id,
    certificateId: 'cert-1',
    action: 'CREATED',
    actor: 'rafael.costa',
    timestamp: new Date().toISOString(),
    details: {},
    relatedCertId: null,
    result: 'SUCCESS',
    ...overrides,
  };
}

/**
 * Creates a realistic lifecycle timeline for testing.
 */
export function createSampleTimeline(certId: string): TimelineEvent[] {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  return [
    createTimelineEvent({
      id: `tl-${certId}-1`,
      certificateId: certId,
      action: 'CREATED',
      actor: 'rafael.costa',
      timestamp: new Date(now - 90 * day).toISOString(),
      details: { caName: 'Vault PKI', algorithm: 'RSA 2048', cn: 'api-payments.bank.internal' },
      result: 'SUCCESS',
    }),
    createTimelineEvent({
      id: `tl-${certId}-2`,
      certificateId: certId,
      action: 'ISSUED',
      actor: 'vault-agent',
      timestamp: new Date(now - 90 * day + 5000).toISOString(),
      details: { caName: 'Vault PKI', algorithm: 'RSA 2048', cn: 'api-payments.bank.internal' },
      result: 'SUCCESS',
    }),
    createTimelineEvent({
      id: `tl-${certId}-3`,
      certificateId: certId,
      action: 'NOTIFICATION_SENT',
      actor: 'system',
      timestamp: new Date(now - 30 * day).toISOString(),
      details: { recipient: 'time-pagamentos@bank.internal', subject: 'Certificate expiring in 30 days' },
      result: 'SUCCESS',
    }),
    createTimelineEvent({
      id: `tl-${certId}-4`,
      certificateId: certId,
      action: 'RENEWED',
      actor: 'rafael.costa',
      timestamp: new Date(now - 7 * day).toISOString(),
      details: { oldCertId: 'cert-old-123', newCertId: 'cert-new-456', rotateKey: false },
      relatedCertId: 'cert-new-456',
      result: 'SUCCESS',
    }),
    createTimelineEvent({
      id: `tl-${certId}-5`,
      certificateId: certId,
      action: 'KEY_ROTATED',
      actor: 'rafael.costa',
      timestamp: new Date(now - 2 * day).toISOString(),
      details: { oldAlgorithm: 'RSA 2048', newAlgorithm: 'ECDSA P-256' },
      result: 'SUCCESS',
    }),
  ];
}

/**
 * Creates a lifecycle-enriched audit entry.
 */
export function createLifecycleAuditEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return createAuditEntry({
    action: 'ISSUE',
    lifecycleDetails: {
      caName: 'Vault PKI',
      algorithm: 'RSA 2048',
      cn: 'api-payments.bank.internal',
    },
    ...overrides,
  });
}

/**
 * Resets the ID counters (call in beforeEach if needed).
 */
export function resetCounters(): void {
  certIdCounter = 0;
  auditIdCounter = 0;
  timelineIdCounter = 0;
}
