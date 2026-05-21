/**
 * Tests for CertificateService — CRUD, Search, Filter, Pagination.
 *
 * Covers AC: 5–20, 22–23, 29–30, 35–37, 41, 43–45, 49–50.
 *
 * Uses an in-memory SQLite database seeded with test fixtures.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { createDatabase } from '../../src/server/db.js';
import {
  CertificateService,
  type CertificateRow,
} from '../../src/server/services/certificate-service.js';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const NOW = new Date('2025-06-01T12:00:00Z');
const PEM_SAMPLE =
  '-----BEGIN CERTIFICATE-----\nMIIBkTCB+wIJALRiMLAh...\n-----END CERTIFICATE-----';

let db: Database.Database;
let svc: CertificateService;

function insertCert(overrides: Partial<CertificateRow> = {}): string {
  const id = overrides.id ?? crypto.randomUUID();
  const row: CertificateRow = {
    id,
    common_name: 'test.bank.internal',
    sans: '[]',
    serial: '0x0001',
    issuer: 'Test CA',
    not_before: '2024-01-01T00:00:00Z',
    not_after: '2025-12-31T23:59:59Z',
    algorithm: 'RSA 2048',
    fingerprint_sha256: 'aabbccdd',
    owner: 'team-test',
    application: 'Test App',
    environment: 'prd',
    zone: 'zone-a',
    ca_provider: 'Vault PKI',
    revoked: 0,
    pem_content: PEM_SAMPLE,
    tags: '{}',
    custom_fields: '{}',
    description: '',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };

  db.prepare(
    `INSERT INTO certificates
       (id, common_name, sans, serial, issuer, not_before, not_after,
        algorithm, fingerprint_sha256, owner, application, environment,
        zone, ca_provider, revoked, pem_content, tags, custom_fields,
        description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.common_name,
    row.sans,
    row.serial,
    row.issuer,
    row.not_before,
    row.not_after,
    row.algorithm,
    row.fingerprint_sha256,
    row.owner,
    row.application,
    row.environment,
    row.zone,
    row.ca_provider,
    row.revoked,
    row.pem_content,
    row.tags,
    row.custom_fields,
    row.description,
    row.created_at,
    row.updated_at,
  );

  return id;
}

/* ------------------------------------------------------------------ */
/* Seed helper — reusable across suites                                */
/* ------------------------------------------------------------------ */

function seedStandardData(): void {
  insertCert({
    id: 'cert-1',
    common_name: 'api-payments.bank.internal',
    sans: '["payments-v2","payments-canary"]',
    serial: '0x00d4e82f1a23b5c7',
    owner: 'time-pagamentos',
    environment: 'prd',
    ca_provider: 'Vault PKI',
    not_after: '2025-06-13T00:00:00Z',            // 12 days from NOW
    tags: '{"critical-app":"true"}',
  });

  insertCert({
    id: 'cert-2',
    common_name: 'mtls-broker-kafka.bank.internal',
    sans: '[]',
    serial: '0x00aabb1122334455',
    owner: 'time-data',
    environment: 'prd',
    ca_provider: 'ACM PCA',
    not_after: '2025-06-06T00:00:00Z',            // 5 days (critical)
  });

  insertCert({
    id: 'cert-3',
    common_name: 'gateway-edge.bank.internal',
    sans: '["gw-alt-1","gw-alt-2"]',
    serial: '0x00ff0011ff001100',
    owner: 'time-plataforma',
    environment: 'prd',
    ca_provider: 'Vault PKI',
    not_after: '2025-06-19T00:00:00Z',            // 18 days (attention)
  });

  insertCert({
    id: 'cert-4',
    common_name: 'auth-svc.bank.internal',
    sans: '["auth-alt"]',
    serial: '0x0099887766554433',
    owner: 'time-iam',
    environment: 'hml',
    ca_provider: 'Vault PKI',
    not_after: '2025-06-27T00:00:00Z',            // 26 days (attention)
  });

  insertCert({
    id: 'cert-5',
    common_name: 'dev-service.bank.internal',
    sans: '[]',
    serial: '0x0011223344556677',
    owner: 'time-pagamentos',
    environment: 'dev',
    ca_provider: 'Vault PKI',
    not_after: '2025-12-01T00:00:00Z',            // 183 days (valid)
  });

  // Expired cert
  insertCert({
    id: 'cert-expired',
    common_name: 'expired-svc.bank.internal',
    sans: '[]',
    serial: '0xEXPIRED000001',
    owner: 'time-data',
    environment: 'prd',
    ca_provider: 'Vault PKI',
    not_after: '2025-05-01T00:00:00Z',            // already expired
  });

  // Revoked cert
  insertCert({
    id: 'cert-revoked',
    common_name: 'revoked-svc.bank.internal',
    sans: '[]',
    serial: '0xREVOKED00001',
    owner: 'time-iam',
    environment: 'prd',
    ca_provider: 'ACM PCA',
    not_after: '2026-01-01T00:00:00Z',
    revoked: 1,
    tags: '{"revoked-reason":"key-compromise"}',
  });
}

/* ------------------------------------------------------------------ */
/* Setup / Teardown                                                    */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  db = createDatabase(':memory:');
  svc = new CertificateService(db);
  seedStandardData();
});

/* ================================================================== */
/* Search tests — AC 5, 6, 7, 8, 9, 37, 41                            */
/* ================================================================== */

describe('Search by Common Name (AC 5)', () => {
  it('finds certificate by partial CN "api-payments"', () => {
    const result = svc.list({ q: 'api-payments' }, NOW);
    expect(result.totalItems).toBe(1);
    expect(result.items[0].commonName).toBe('api-payments.bank.internal');
  });

  it('search is case-insensitive (AC 37)', () => {
    const result = svc.list({ q: 'API-PAYMENTS' }, NOW);
    expect(result.totalItems).toBe(1);
    expect(result.items[0].commonName).toBe('api-payments.bank.internal');
  });

  it('broad substring search matches multiple certs (AC 41)', () => {
    const result = svc.list({ q: 'bank.internal' }, NOW);
    expect(result.totalItems).toBe(7); // all 7 certs
  });
});

describe('Search by SAN (AC 6)', () => {
  it('finds cert by SAN "payments-canary"', () => {
    const result = svc.list({ q: 'payments-canary' }, NOW);
    expect(result.totalItems).toBe(1);
    expect(result.items[0].commonName).toBe('api-payments.bank.internal');
  });

  it('finds cert by partial SAN "gw-alt"', () => {
    const result = svc.list({ q: 'gw-alt' }, NOW);
    expect(result.totalItems).toBe(1);
    expect(result.items[0].commonName).toBe('gateway-edge.bank.internal');
  });
});

describe('Search by Serial Number (AC 7)', () => {
  it('finds cert by exact serial', () => {
    const result = svc.list({ q: '0x00d4e82f1a23b5c7' }, NOW);
    expect(result.totalItems).toBe(1);
    expect(result.items[0].commonName).toBe('api-payments.bank.internal');
  });

  it('finds cert by partial serial prefix', () => {
    const result = svc.list({ q: '0x00aabb' }, NOW);
    expect(result.totalItems).toBe(1);
    expect(result.items[0].commonName).toBe('mtls-broker-kafka.bank.internal');
  });
});

describe('Search by Owner (AC 8)', () => {
  it('finds all certs for owner "time-pagamentos"', () => {
    const result = svc.list({ q: 'time-pagamentos' }, NOW);
    expect(result.totalItems).toBe(2);
    expect(result.items.every((c) => c.owner === 'time-pagamentos')).toBe(true);
  });
});

describe('Search with no match (AC 9)', () => {
  it('returns empty result with totalItems === 0', () => {
    const result = svc.list({ q: 'non-existent-service' }, NOW);
    expect(result.totalItems).toBe(0);
    expect(result.items).toHaveLength(0);
  });
});

/* ================================================================== */
/* Filter tests — AC 10, 11, 12, 13, 14, 15                           */
/* ================================================================== */

describe('Filter: expiration <30d (AC 10)', () => {
  it('returns only certs expiring within 30 days', () => {
    const result = svc.list({ expires_before: 30 }, NOW);
    // cert-1 (12d), cert-2 (5d), cert-3 (18d), cert-4 (26d) = 4 certs
    expect(result.totalItems).toBe(4);
    result.items.forEach((c) => {
      expect(c.daysUntilExpiration).toBeGreaterThan(0);
      expect(c.daysUntilExpiration).toBeLessThan(30);
    });
  });
});

describe('Filter: env prd (AC 11)', () => {
  it('returns only prd certificates', () => {
    const result = svc.list({ environment: 'prd' }, NOW);
    expect(result.totalItems).toBe(5); // cert-1,2,3,expired,revoked
    expect(result.items.every((c) => c.environment === 'prd')).toBe(true);
  });
});

describe('Filter: CA Vault PKI (AC 12)', () => {
  it('returns only Vault PKI certificates', () => {
    const result = svc.list({ ca: 'Vault PKI' }, NOW);
    expect(result.totalItems).toBe(5); // cert-1,3,4,5,expired
    expect(result.items.every((c) => c.caProvider.includes('Vault PKI'))).toBe(true);
  });
});

describe('Filter: status expired (AC 13)', () => {
  it('returns only expired certificates', () => {
    const result = svc.list({ status: 'expired' }, NOW);
    expect(result.totalItems).toBe(1);
    expect(result.items[0].commonName).toBe('expired-svc.bank.internal');
  });
});

describe('Combined filters (AC 14)', () => {
  it('applies AND logic: env prd + expires_before 30 + owner', () => {
    const result = svc.list(
      { environment: 'prd', expires_before: 30, owner: 'time-pagamentos' },
      NOW,
    );
    // cert-1: prd ✓, 12d ✓, time-pagamentos ✓
    expect(result.totalItems).toBe(1);
    expect(result.items[0].commonName).toBe('api-payments.bank.internal');
  });
});

describe('Remove filter (AC 15)', () => {
  it('removing a filter broadens the result set', () => {
    const narrow = svc.list({ environment: 'prd', owner: 'time-pagamentos' }, NOW);
    const broad = svc.list({ environment: 'prd' }, NOW);
    expect(broad.totalItems).toBeGreaterThan(narrow.totalItems);
  });
});

/* ================================================================== */
/* Pagination tests — AC 16, 17, 18, 50                                */
/* ================================================================== */

describe('Pagination with many certificates (AC 16–18)', () => {
  beforeEach(() => {
    // Insert 10 000+ certs (already have 7 from seed)
    const stmt = db.prepare(
      `INSERT INTO certificates
         (id, common_name, sans, serial, issuer, not_before, not_after,
          algorithm, fingerprint_sha256, owner, application, environment,
          zone, ca_provider, revoked, pem_content, tags, custom_fields,
          description)
       VALUES (?, ?, '[]', ?, 'Test CA', '2024-01-01T00:00:00Z', ?,
               'RSA 2048', 'aabb', ?, '', ?, '', 'Vault PKI', 0, NULL,
               '{}', '{}', '')`,
    );

    const envs = ['dev', 'hml', 'prd'];
    const owners = ['time-pagamentos', 'time-data', 'time-plataforma'];

    const insert = db.transaction(() => {
      for (let i = 0; i < 10_240; i++) {
        const daysOffset = (i % 400) - 10;
        const expiry = new Date(NOW.getTime() + daysOffset * 86_400_000).toISOString();
        stmt.run(
          `bulk-${i}`,
          `svc-${i}.bank.internal`,
          `0x${i.toString(16).padStart(16, '0')}`,
          expiry,
          owners[i % 3],
          envs[i % 3],
        );
      }
    });
    insert();
  });

  it('first page shows 50 items (AC 16)', () => {
    const result = svc.list({ page_size: 50 }, NOW);
    expect(result.items).toHaveLength(50);
    expect(result.page).toBe(1);
    expect(result.totalItems).toBeGreaterThan(10_000);
    expect(result.hasNextPage).toBe(true);
    expect(result.hasPreviousPage).toBe(false);
  });

  it('page 2 loads next set (AC 17)', () => {
    const page1 = svc.list({ page: 1, page_size: 50 }, NOW);
    const page2 = svc.list({ page: 2, page_size: 50 }, NOW);
    expect(page2.page).toBe(2);
    expect(page2.hasPreviousPage).toBe(true);
    // Items should differ
    expect(page2.items[0].id).not.toBe(page1.items[0].id);
  });

  it('last page disables "next" (AC 18)', () => {
    const result = svc.list({ page: 1, page_size: 50 }, NOW);
    const lastPage = svc.list({ page: result.totalPages, page_size: 50 }, NOW);
    expect(lastPage.hasNextPage).toBe(false);
    expect(lastPage.page).toBe(result.totalPages);
  });
});

describe('Pagination boundary test (AC 50)', () => {
  beforeEach(() => {
    // Clear existing rows
    db.prepare('DELETE FROM certificates').run();

    const stmt = db.prepare(
      `INSERT INTO certificates
         (id, common_name, sans, serial, issuer, not_before, not_after,
          algorithm, fingerprint_sha256, owner, application, environment,
          zone, ca_provider, revoked, pem_content, tags, custom_fields,
          description)
       VALUES (?, ?, '[]', ?, 'Test CA', '2024-01-01T00:00:00Z',
               '2026-01-01T00:00:00Z', 'RSA 2048', 'aabb', 'team-test',
               '', 'prd', '', 'Vault PKI', 0, NULL, '{}', '{}', '')`,
    );

    const insert = db.transaction(() => {
      for (let i = 0; i < 450; i++) {
        stmt.run(`boundary-${i}`, `svc-${i}.test`, `0x${i.toString(16)}`);
      }
    });
    insert();
  });

  it('450 certs / 50 per page = 9 full pages', () => {
    const result = svc.list({ page: 1, page_size: 50 }, NOW);
    expect(result.totalItems).toBe(450);
    expect(result.totalPages).toBe(9);
  });

  it('page 9 has exactly 50 items', () => {
    const result = svc.list({ page: 9, page_size: 50 }, NOW);
    expect(result.items).toHaveLength(50);
    expect(result.hasNextPage).toBe(false);
  });

  it('requesting page 10 clamps to page 9', () => {
    const result = svc.list({ page: 10, page_size: 50 }, NOW);
    expect(result.page).toBe(9);
  });
});

/* ================================================================== */
/* Detail tests — AC 19, 20, 43, 44, 45, 49                           */
/* ================================================================== */

describe('Certificate detail (AC 19, 44)', () => {
  it('returns all metadata fields', () => {
    const cert = svc.getById('cert-1', NOW);
    expect(cert).not.toBeNull();
    expect(cert!.commonName).toBe('api-payments.bank.internal');
    expect(cert!.sans).toEqual(['payments-v2', 'payments-canary']);
    expect(cert!.serial).toBe('0x00d4e82f1a23b5c7');
    expect(cert!.issuer).toBe('Test CA');
    expect(cert!.algorithm).toBe('RSA 2048');
    expect(cert!.fingerprintSHA256).toBe('aabbccdd');
    expect(cert!.owner).toBe('time-pagamentos');
    expect(cert!.environment).toBe('prd');
    expect(cert!.caProvider).toBe('Vault PKI');
    expect(cert!.notBefore).toBe('2024-01-01T00:00:00Z');
    expect(cert!.notAfter).toBe('2025-06-13T00:00:00Z');
  });

  it('computes daysUntilExpiration correctly (AC 44)', () => {
    const cert = svc.getById('cert-1', NOW);
    expect(cert!.daysUntilExpiration).toBe(11); // 2025-06-01 → 2025-06-13 = 12 days floor
    expect(cert!.daysLeftFormatted).toContain('dias');
  });

  it('includes PEM content (AC 20)', () => {
    const cert = svc.getById('cert-1', NOW);
    expect(cert!.pemContent).toBe(PEM_SAMPLE);
  });

  it('returns null for non-existent id', () => {
    const cert = svc.getById('nonexistent', NOW);
    expect(cert).toBeNull();
  });
});

describe('Status badge colors (AC 45)', () => {
  it('valid cert → status "valid", color "ok" (green)', () => {
    const cert = svc.getById('cert-5', NOW); // 183 days
    expect(cert!.status).toBe('valid');
    expect(cert!.statusColor).toBe('ok');
    expect(cert!.statusLabel).toBe('Válido');
  });

  it('attention cert → status "attention", color "warn" (orange)', () => {
    const cert = svc.getById('cert-3', NOW); // 18 days
    expect(cert!.status).toBe('attention');
    expect(cert!.statusColor).toBe('warn');
    expect(cert!.statusLabel).toBe('Atenção');
  });

  it('critical cert → status "critical", color "crit" (red)', () => {
    const cert = svc.getById('cert-2', NOW); // 5 days
    expect(cert!.status).toBe('critical');
    expect(cert!.statusColor).toBe('crit');
    expect(cert!.statusLabel).toBe('Crítico');
  });

  it('expired cert → status "expired", color "crit" (red)', () => {
    const cert = svc.getById('cert-expired', NOW);
    expect(cert!.status).toBe('expired');
    expect(cert!.statusColor).toBe('crit');
    expect(cert!.statusLabel).toBe('Expirado');
  });
});

describe('Revoked certificate (AC 49)', () => {
  it('shows status "revoked" with purple badge', () => {
    const cert = svc.getById('cert-revoked', NOW);
    expect(cert!.status).toBe('revoked');
    expect(cert!.statusColor).toBe('rev');
    expect(cert!.statusLabel).toBe('Revogado');
    expect(cert!.revoked).toBe(true);
  });

  it('revoked cert appears in status:revoked filter', () => {
    const result = svc.list({ status: 'revoked' }, NOW);
    expect(result.totalItems).toBe(1);
    expect(result.items[0].commonName).toBe('revoked-svc.bank.internal');
  });
});

/* ================================================================== */
/* Download PEM — AC 22                                                */
/* ================================================================== */

describe('Download PEM (AC 22)', () => {
  it('returns PEM content with CN-based filename', () => {
    const result = svc.download('cert-1');
    expect(result).not.toBeNull();
    expect(result!.filename).toBe('api-payments.bank.internal.pem');
    expect(result!.pem).toBe(PEM_SAMPLE);
  });

  it('returns null for non-existent cert', () => {
    expect(svc.download('nonexistent')).toBeNull();
  });

  it('returns null if cert has no PEM content', () => {
    insertCert({ id: 'no-pem', pem_content: null });
    expect(svc.download('no-pem')).toBeNull();
  });
});

/* ================================================================== */
/* Delete — AC 23                                                      */
/* ================================================================== */

describe('Delete certificate (AC 23)', () => {
  it('removes cert from database', () => {
    const deleted = svc.delete('cert-1');
    expect(deleted).toBe(true);
    expect(svc.getById('cert-1', NOW)).toBeNull();
  });

  it('confirmed gone from list after delete', () => {
    svc.delete('cert-1');
    const result = svc.list({ q: 'api-payments' }, NOW);
    expect(result.totalItems).toBe(0);
  });

  it('creates audit entry on delete', () => {
    svc.delete('cert-1', 'alice');
    const audit = db
      .prepare("SELECT * FROM audit_log WHERE cert_id = 'cert-1' AND action = 'DELETE'")
      .get() as { actor: string; result: string; cert_cn: string } | undefined;
    expect(audit).toBeDefined();
    expect(audit!.actor).toBe('alice');
    expect(audit!.result).toBe('SUCCESS');
    expect(audit!.cert_cn).toBe('api-payments.bank.internal');
  });

  it('returns false for non-existent cert', () => {
    expect(svc.delete('nonexistent')).toBe(false);
  });
});

/* ================================================================== */
/* Update tags / org fields — AC 29, 43                                */
/* ================================================================== */

describe('Update tags (AC 29)', () => {
  it('adds a tag to a certificate', () => {
    const updated = svc.update('cert-5', { tags: { team: 'payments', env: 'dev' } }, 'bob', NOW);
    expect(updated).not.toBeNull();
    expect(updated!.tags).toEqual({ team: 'payments', env: 'dev' });
  });

  it('tag appears in detail after update', () => {
    svc.update('cert-5', { tags: { 'critical-app': 'true' } }, 'bob', NOW);
    const cert = svc.getById('cert-5', NOW);
    expect(cert!.tags['critical-app']).toBe('true');
  });

  it('creates audit entry on update (AC 33)', () => {
    svc.update('cert-5', { tags: { foo: 'bar' } }, 'carol', NOW);
    const audit = db
      .prepare("SELECT * FROM audit_log WHERE cert_id = 'cert-5' AND action = 'UPDATE'")
      .get() as { actor: string; result: string } | undefined;
    expect(audit).toBeDefined();
    expect(audit!.actor).toBe('carol');
    expect(audit!.result).toBe('SUCCESS');
  });
});

describe('PKI fields read-only, org fields editable (AC 43)', () => {
  it('can update owner', () => {
    const updated = svc.update('cert-1', { owner: 'new-team' }, 'admin', NOW);
    expect(updated!.owner).toBe('new-team');
  });

  it('can update description', () => {
    const updated = svc.update('cert-1', { description: 'Updated description' }, 'admin', NOW);
    expect(updated!.description).toBe('Updated description');
  });

  it('can update environment', () => {
    const updated = svc.update('cert-4', { environment: 'prd' }, 'admin', NOW);
    expect(updated!.environment).toBe('prd');
  });

  it('rejects invalid environment', () => {
    expect(() =>
      svc.update('cert-1', { environment: 'staging' as any }, 'admin', NOW),
    ).toThrow('Environment must be dev, hml, or prd');
  });

  it('returns null for non-existent cert', () => {
    expect(svc.update('nonexistent', { owner: 'x' }, 'admin', NOW)).toBeNull();
  });
});

/* ================================================================== */
/* Filter by tag — AC 30                                               */
/* ================================================================== */

describe('Filter by tag (AC 30)', () => {
  it('returns only certs with the given tag', () => {
    const result = svc.list({ tag: 'critical-app' }, NOW);
    expect(result.totalItems).toBe(1);
    expect(result.items[0].commonName).toBe('api-payments.bank.internal');
  });

  it('tag filter + other filters work together', () => {
    const result = svc.list({ tag: 'revoked-reason', status: 'revoked' }, NOW);
    expect(result.totalItems).toBe(1);
    expect(result.items[0].commonName).toBe('revoked-svc.bank.internal');
  });
});

/* ================================================================== */
/* Performance — AC 35, 36                                             */
/* ================================================================== */

describe('Performance: <2s for 10k+ dataset (AC 35, 36)', () => {
  beforeEach(() => {
    const stmt = db.prepare(
      `INSERT INTO certificates
         (id, common_name, sans, serial, issuer, not_before, not_after,
          algorithm, fingerprint_sha256, owner, application, environment,
          zone, ca_provider, revoked, pem_content, tags, custom_fields,
          description)
       VALUES (?, ?, '[]', ?, 'Test CA', '2024-01-01T00:00:00Z', ?,
               'RSA 2048', 'aabb', ?, '', ?, '', 'Vault PKI', 0, NULL,
               '{}', '{}', '')`,
    );
    const envs = ['dev', 'hml', 'prd'];
    const owners = ['time-pagamentos', 'time-data', 'time-plataforma'];

    const insert = db.transaction(() => {
      for (let i = 0; i < 10_500; i++) {
        const daysOffset = (i % 400) - 10;
        const expiry = new Date(NOW.getTime() + daysOffset * 86_400_000).toISOString();
        stmt.run(
          `perf-${i}`,
          `svc-${i}.bank.internal`,
          `0x${i.toString(16).padStart(16, '0')}`,
          expiry,
          owners[i % 3],
          envs[i % 3],
        );
      }
    });
    insert();
  });

  it('search query returns in <2s (AC 36)', () => {
    const start = performance.now();
    const result = svc.list({ q: 'svc-500' }, NOW);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(2000);
    expect(result.totalItems).toBeGreaterThan(0);
  });

  it('filter query returns in <2s (AC 35)', () => {
    const start = performance.now();
    const result = svc.list({ expires_before: 30 }, NOW);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(2000);
    expect(result.totalItems).toBeGreaterThan(0);
  });

  it('combined filter + search returns in <2s', () => {
    const start = performance.now();
    const result = svc.list(
      { q: 'svc-', environment: 'prd', expires_before: 30 },
      NOW,
    );
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(2000);
    expect(result.totalItems).toBeGreaterThanOrEqual(0);
  });
});

/* ================================================================== */
/* Sorting                                                             */
/* ================================================================== */

describe('Sort order', () => {
  it('sorts by not_after asc by default', () => {
    const result = svc.list({}, NOW);
    const dates = result.items.map((c) => c.notAfter);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] >= dates[i - 1]).toBe(true);
    }
  });

  it('sorts by common_name desc when requested', () => {
    const result = svc.list({ sort: 'common_name', order: 'desc' }, NOW);
    const names = result.items.map((c) => c.commonName);
    for (let i = 1; i < names.length; i++) {
      expect(names[i] <= names[i - 1]).toBe(true);
    }
  });
});
