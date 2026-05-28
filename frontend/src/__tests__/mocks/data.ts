import type { Certificate, AuditLogEntry, PaginatedResponse } from '@certificado-digital/shared';

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
    sans: [`service-${id}.bank.internal`, `service-${id}-v2.bank.internal`],
    serial: `AA:BB:CC:DD:${id.slice(-2).toUpperCase().padStart(2, '0')}`,
    issuer: 'CN=Bank Internal CA, O=Bank Corp',
    notBefore: notBefore.toISOString(),
    notAfter: notAfter.toISOString(),
    algorithm: 'RSA 2048',
    fingerprintSha256: `SHA256:${id}:AABBCCDD`,
    owner: 'time-plataforma',
    application: 'service-app',
    environment: 'prd',
    zone: 'bank-prd',
    caProvider: 'Vault PKI',
    revoked: false,
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

/**
 * Resets the ID counters (call in beforeEach if needed).
 */
export function resetCounters(): void {
  certIdCounter = 0;
  auditIdCounter = 0;
}
