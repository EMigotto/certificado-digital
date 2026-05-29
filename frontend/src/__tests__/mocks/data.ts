import type {
  Certificate,
  AuditEntry,
  AuditLogEntry,
  LifecycleAuditDetails,
  PaginatedResponse,
  TimelineEvent,
  DashboardSnapshot,
  CriticalAlert,
} from '@certificado-digital/shared';

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
    environment: 'PRD',
    zone: 'bank-prd',
    caName: 'Vault PKI',
    caProvider: 'HashiCorp Vault',
    importSource: 'MANUAL' as const,
    sourceFile: null,
    revoked: false,
    revokedAt: null,
    revocationReason: null,
    // Lifecycle fields (null by default for imported/non-lifecycle certs)
    csrSource: null,
    validityDays: null,
    renewalParentId: null,
    renewalChildId: null,
    revocationReasonCode: null,
    revocationJustification: null,
    revokedBy: null,
    keyAlgorithm: null,
    tags: {},
    customFields: {},
    description: null,
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
  return createCertificate({
    revoked: true,
    status: 'REVOKED',
    revokedAt: new Date().toISOString(),
    revocationReasonCode: 'keyCompromise',
    revocationJustification: 'Key compromised during audit',
    revokedBy: 'rafael.costa',
    ...overrides,
  });
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
 * Creates a lifecycle-issued certificate with all lifecycle fields populated.
 */
export function createLifecycleCertificate(overrides: Partial<Certificate> = {}): Certificate {
  return createCertificate({
    csrSource: 'generate',
    validityDays: 365,
    keyAlgorithm: 'RSA-2048',
    status: 'ACTIVE',
    ...overrides,
  });
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
export function createAuditEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  const id = overrides.id ?? `audit-${++auditIdCounter}`;
  const base: AuditEntry = {
    id,
    certificateId: 'cert-1',
    certCn: 'api-payments.bank.internal',
    action: 'CREATE',
    actor: 'rafael.costa',
    result: 'SUCCESS',
    detail: 'Certificate created via UI',
    batchId: null,
    changes: null,
    timestamp: new Date().toISOString(),
  };
  return { ...base, ...overrides } as AuditEntry;
}

let timelineIdCounter = 0;

/**
 * Creates a single timeline event.
 */
export function createTimelineEvent(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  const id = overrides.id ?? `tl-${++timelineIdCounter}`;
  const base: TimelineEvent = {
    id,
    type: 'ISSUED',
    actor: 'rafael.costa',
    timestamp: new Date().toISOString(),
    detail: null,
    relatedCertificateId: null,
  };
  return { ...base, ...overrides } as TimelineEvent;
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
      type: 'ISSUED',
      actor: 'rafael.costa',
      timestamp: new Date(now - 90 * day).toISOString(),
      detail: 'Certificate issued via Vault PKI',
    }),
    createTimelineEvent({
      id: `tl-${certId}-2`,
      type: 'ACTIVATED',
      actor: 'vault-agent',
      timestamp: new Date(now - 90 * day + 5000).toISOString(),
      detail: 'Certificate activated after deployment',
    }),
    createTimelineEvent({
      id: `tl-${certId}-3`,
      type: 'NOTIFICATION_SENT',
      actor: 'system',
      timestamp: new Date(now - 30 * day).toISOString(),
      detail: 'Expiration warning: 30 days remaining',
    }),
    createTimelineEvent({
      id: `tl-${certId}-4`,
      type: 'RENEWED',
      actor: 'rafael.costa',
      timestamp: new Date(now - 7 * day).toISOString(),
      detail: 'Certificate renewed (key rotation: false)',
      relatedCertificateId: 'cert-new-456',
    }),
    createTimelineEvent({
      id: `tl-${certId}-5`,
      type: 'KEY_ROTATED',
      actor: 'rafael.costa',
      timestamp: new Date(now - 2 * day).toISOString(),
      detail: 'Key rotated: RSA 2048 → ECDSA P-256',
    }),
  ];
}

/**
 * Creates a lifecycle-enriched audit log entry (frontend format).
 */
export function createLifecycleAuditEntry(
  overrides: Partial<AuditLogEntry & { lifecycleDetails?: LifecycleAuditDetails }> = {},
): AuditLogEntry {
  const id = overrides.id ?? `audit-${++auditIdCounter}`;
  const base: AuditLogEntry = {
    id,
    certId: 'cert-1',
    certCn: 'api-payments.bank.internal',
    action: 'ISSUE',
    actor: 'rafael.costa',
    result: 'SUCCESS',
    detail: 'Certificate issued via mTLS Control Plane',
    batchId: null,
    timestamp: new Date().toISOString(),
    lifecycleDetails: null,
  };
  return { ...base, ...overrides };
}

// ─── Dashboard snapshot mock data ──────────────────────────────────────────

/**
 * Creates a mock DashboardSnapshot matching the approved prototype values.
 */
/**
 * Generate realistic heatmap data for 90 days.
 * Matches the prototype visual: mostly empty, with scattered clusters.
 */
function generateMockHeatmap(): Record<number, number> {
  const heatmap: Record<number, number> = {};
  // Deterministic pattern matching prototype visual
  const entries: [number, number][] = [
    [1, 3], [4, 12], [8, 2], [12, 8], [17, 1],
    [25, 4], [32, 15], [38, 3], [46, 22], [51, 7],
    [63, 45], [68, 2], [77, 70], [85, 6],
  ];
  for (const [day, count] of entries) {
    heatmap[day] = count;
  }
  return heatmap;
}

export function createDashboardSnapshot(
  overrides: Partial<DashboardSnapshot> = {},
): DashboardSnapshot {
  const base: DashboardSnapshot = {
    kpis: {
      totalManaged: 2847,
      validCount: 2798,
      expiringLessThan30d: 23,
      expiredOrRevoked: 26,
      trends: {
        totalManaged: { direction: 'up', delta: 47 },
        validCount: { direction: 'up', delta: 42 },
        expiringLessThan30d: { direction: 'down', delta: 5 },
        expiredOrRevoked: { direction: 'stable', delta: 0 },
      },
    },
    heatmap: generateMockHeatmap(),
    alerts: createCriticalAlerts(),
    generatedAt: new Date().toISOString(),
  };
  return { ...base, ...overrides };
}

/**
 * Creates mock critical alerts matching prototype data.
 */
export function createCriticalAlerts(): CriticalAlert[] {
  return [
    {
      cn: 'api-payments.bank.internal',
      owner: 'time-pagamentos',
      env: 'prd',
      daysLeft: 2,
      severity: 'critical',
    },
    {
      cn: 'mtls-broker-kafka.bank.internal',
      owner: 'time-data',
      env: 'prd',
      daysLeft: 5,
      severity: 'critical',
    },
    {
      cn: 'gateway-edge.bank.internal',
      owner: 'time-plataforma',
      env: 'prd',
      daysLeft: 12,
      severity: 'warning',
    },
    {
      cn: 'auth-svc.bank.internal',
      owner: 'time-iam',
      env: 'hml',
      daysLeft: 18,
      severity: 'warning',
    },
    {
      cn: 'notification-worker.bank.internal',
      owner: 'time-comms',
      env: 'prd',
      daysLeft: 26,
      severity: 'warning',
    },
  ];
}

/**
 * Resets the ID counters (call in beforeEach if needed).
 */
export function resetCounters(): void {
  certIdCounter = 0;
  auditIdCounter = 0;
  timelineIdCounter = 0;
}
