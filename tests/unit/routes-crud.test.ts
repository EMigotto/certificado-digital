/**
 * HTTP integration tests for certificate CRUD & read routes.
 *
 * Covers:
 *  - AC 5–9:   Search (CN, SAN, serial, owner, no matches)
 *  - AC 10–14: Filters (expiration, env, CA, status, combined)
 *  - AC 15:    Remove filter (broader results)
 *  - AC 16–18: Pagination (first page, next page, last page)
 *  - AC 19–20: Certificate detail & PEM display
 *  - AC 22:    Download PEM file
 *  - AC 30:    Filter by tag
 *  - AC 31:    Export CSV
 *  - AC 37:    Case-insensitive search
 *  - AC 40:    Export JSON
 *  - AC 41:    Search partial matches
 *  - AC 43:    Metadata read-only vs editable (detail shape)
 *  - AC 44:    Certificate validity display
 *  - AC 45:    Status badge color coding
 *  - AC 49:    Revoked certificate display
 *  - AC 50:    Pagination boundary
 *
 * Routes tested:
 *  - GET /api/v1/certificates
 *  - GET /api/v1/certificates/:id
 *  - GET /api/v1/certificates/:id/download
 *  - GET /api/v1/certificates/export
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/index.js';
import { initDatabase, closeDatabase } from '../../src/server/db.js';
import type Database from 'better-sqlite3';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const PEM_SAMPLE = '-----BEGIN CERTIFICATE-----\nMIIBkTCB+wIJALRiMLAh...\n-----END CERTIFICATE-----';

/** Compute a date N days from now as ISO string. */
function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function pastDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function insertCert(db: Database.Database, overrides: Record<string, unknown> = {}): string {
  const id = (overrides.id as string) ?? crypto.randomUUID();
  const defaults = {
    common_name: 'test.bank.internal',
    sans: '[]',
    serial: '0x0001',
    issuer: 'Test CA',
    not_before: '2024-01-01T00:00:00Z',
    not_after: futureDate(180),
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
  };

  const row = { ...defaults, ...overrides, id };

  db.prepare(`
    INSERT INTO certificates
      (id, common_name, sans, serial, issuer, not_before, not_after,
       algorithm, fingerprint_sha256, owner, application, environment,
       zone, ca_provider, revoked, pem_content, tags, custom_fields,
       description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id, row.common_name, row.sans, row.serial, row.issuer,
    row.not_before, row.not_after, row.algorithm, row.fingerprint_sha256,
    row.owner, row.application, row.environment, row.zone, row.ca_provider,
    row.revoked, row.pem_content, row.tags, row.custom_fields,
    row.description, row.created_at, row.updated_at,
  );

  return id;
}

function seedStandard(db: Database.Database): void {
  insertCert(db, {
    id: 'cert-1',
    common_name: 'api-payments.bank.internal',
    sans: '["payments-v2","payments-canary"]',
    serial: '0x00d4e82f1a23b5c7',
    owner: 'time-pagamentos',
    environment: 'prd',
    ca_provider: 'Vault PKI',
    not_after: futureDate(12),           // 12 days — attention
    tags: '{"critical-app":"true"}',
  });
  insertCert(db, {
    id: 'cert-2',
    common_name: 'mtls-broker-kafka.bank.internal',
    serial: '0x00aabb1122334455',
    owner: 'time-data',
    environment: 'prd',
    ca_provider: 'ACM PCA',
    not_after: futureDate(5),            // 5 days — critical
  });
  insertCert(db, {
    id: 'cert-3',
    common_name: 'gateway-edge.bank.internal',
    sans: '["gw-alt-1","gw-alt-2"]',
    owner: 'time-plataforma',
    environment: 'prd',
    ca_provider: 'Vault PKI',
    not_after: futureDate(18),           // 18 days — attention
  });
  insertCert(db, {
    id: 'cert-4',
    common_name: 'auth-svc.bank.internal',
    sans: '["auth-alt"]',
    owner: 'time-iam',
    environment: 'hml',
    ca_provider: 'Vault PKI',
    not_after: futureDate(26),           // 26 days — attention
  });
  insertCert(db, {
    id: 'cert-5',
    common_name: 'dev-service.bank.internal',
    owner: 'time-pagamentos',
    environment: 'dev',
    ca_provider: 'Vault PKI',
    not_after: futureDate(183),          // 183 days — valid
  });
  insertCert(db, {
    id: 'cert-expired',
    common_name: 'expired-svc.bank.internal',
    serial: '0xEXPIRED000001',
    owner: 'time-data',
    environment: 'prd',
    ca_provider: 'Vault PKI',
    not_after: pastDate(30),             // expired 30 days ago
  });
  insertCert(db, {
    id: 'cert-revoked',
    common_name: 'revoked-svc.bank.internal',
    serial: '0xREVOKED00001',
    owner: 'time-iam',
    environment: 'prd',
    ca_provider: 'ACM PCA',
    not_after: futureDate(200),
    revoked: 1,
    tags: '{"revoked-reason":"key-compromise"}',
  });
}

/* ================================================================== */
/* GET /api/v1/certificates — List, search, filter, pagination         */
/* ================================================================== */

describe('GET /api/v1/certificates — search (AC 5–9, 37, 41)', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = initDatabase(':memory:');
    app = createApp(db);
    seedStandard(db);
  });
  afterEach(() => closeDatabase(db));

  it('searches by CN — "api-payments" (AC 5)', async () => {
    const res = await request(app).get('/api/v1/certificates?q=api-payments');
    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(1);
    expect(res.body.items[0].commonName).toBe('api-payments.bank.internal');
  });

  it('searches by SAN — "payments-canary" (AC 6)', async () => {
    const res = await request(app).get('/api/v1/certificates?q=payments-canary');
    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(1);
    expect(res.body.items[0].commonName).toBe('api-payments.bank.internal');
  });

  it('searches by serial (AC 7)', async () => {
    const res = await request(app).get('/api/v1/certificates?q=0x00aabb');
    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(1);
    expect(res.body.items[0].commonName).toBe('mtls-broker-kafka.bank.internal');
  });

  it('searches by owner (AC 8)', async () => {
    const res = await request(app).get('/api/v1/certificates?q=time-pagamentos');
    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(2);
  });

  it('returns empty with message for no matches (AC 9)', async () => {
    const res = await request(app).get('/api/v1/certificates?q=non-existent-service');
    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(0);
    expect(res.body.message).toBe('No certificates found');
  });

  it('search is case-insensitive (AC 37)', async () => {
    const res = await request(app).get('/api/v1/certificates?q=API-PAYMENTS');
    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(1);
  });

  it('partial "bank.internal" matches all certs (AC 41)', async () => {
    const res = await request(app).get('/api/v1/certificates?q=bank.internal');
    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(7);
  });
});

describe('GET /api/v1/certificates — filters (AC 10–14)', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = initDatabase(':memory:');
    app = createApp(db);
    seedStandard(db);
  });
  afterEach(() => closeDatabase(db));

  it('filters by expiration <30d (AC 10)', async () => {
    const res = await request(app).get('/api/v1/certificates?expires_before=30');
    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(4);
    for (const item of res.body.items) {
      expect(item.daysUntilExpiration).toBeGreaterThan(0);
      expect(item.daysUntilExpiration).toBeLessThan(30);
    }
  });

  it('filters by environment prd (AC 11)', async () => {
    const res = await request(app).get('/api/v1/certificates?environment=prd');
    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(5);
    for (const item of res.body.items) {
      expect(item.environment).toBe('prd');
    }
  });

  it('filters by CA provider (AC 12)', async () => {
    const res = await request(app).get('/api/v1/certificates?ca=Vault+PKI');
    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(5);
  });

  it('filters by status expired (AC 13)', async () => {
    const res = await request(app).get('/api/v1/certificates?status=expired');
    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBeGreaterThanOrEqual(1);
    expect(res.body.items.some((c: { commonName: string }) => c.commonName === 'expired-svc.bank.internal')).toBe(true);
  });

  it('combines multiple filters with AND logic (AC 14)', async () => {
    const res = await request(app).get(
      '/api/v1/certificates?environment=prd&expires_before=30&owner=time-pagamentos',
    );
    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(1);
    expect(res.body.items[0].commonName).toBe('api-payments.bank.internal');
  });

  it('filter by tag (AC 30)', async () => {
    const res = await request(app).get('/api/v1/certificates?tag=critical-app');
    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(1);
    expect(res.body.items[0].commonName).toBe('api-payments.bank.internal');
  });

  it('filter by revoked status (AC 49)', async () => {
    const res = await request(app).get('/api/v1/certificates?status=revoked');
    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(1);
    expect(res.body.items[0].status).toBe('revoked');
    expect(res.body.items[0].statusColor).toBe('rev');
    expect(res.body.items[0].statusLabel).toBe('Revogado');
  });
});

describe('GET /api/v1/certificates — pagination (AC 16–18, 50)', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = initDatabase(':memory:');
    app = createApp(db);
    // Insert 150 certs
    const stmt = db.prepare(`
      INSERT INTO certificates
        (id, common_name, sans, serial, issuer, not_before, not_after,
         algorithm, fingerprint_sha256, owner, application, environment,
         zone, ca_provider, revoked, pem_content, tags, custom_fields, description)
      VALUES (?, ?, '[]', ?, 'Test CA', '2024-01-01T00:00:00Z', '2026-01-01T00:00:00Z',
              'RSA 2048', 'aabb', 'team-test', '', 'prd', '', 'Vault PKI', 0, NULL,
              '{}', '{}', '')
    `);
    const insert = db.transaction(() => {
      for (let i = 0; i < 150; i++) {
        stmt.run(`page-${i}`, `svc-${i}.test`, `0x${i.toString(16)}`);
      }
    });
    insert();
  });
  afterEach(() => closeDatabase(db));

  it('first page shows 50 items with pagination metadata (AC 16)', async () => {
    const res = await request(app).get('/api/v1/certificates?page_size=50');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(50);
    expect(res.body.page).toBe(1);
    expect(res.body.totalItems).toBe(150);
    expect(res.body.totalPages).toBe(3);
    expect(res.body.hasNextPage).toBe(true);
    expect(res.body.hasPreviousPage).toBe(false);
  });

  it('page 2 loads next set (AC 17)', async () => {
    const res = await request(app).get('/api/v1/certificates?page=2&page_size=50');
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.items).toHaveLength(50);
    expect(res.body.hasPreviousPage).toBe(true);
  });

  it('last page disables next (AC 18)', async () => {
    const res = await request(app).get('/api/v1/certificates?page=3&page_size=50');
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(3);
    expect(res.body.hasNextPage).toBe(false);
  });

  it('boundary: 150 / 50 = exactly 3 pages (AC 50)', async () => {
    const res = await request(app).get('/api/v1/certificates?page=1&page_size=50');
    expect(res.body.totalPages).toBe(3);

    const lastRes = await request(app).get('/api/v1/certificates?page=3&page_size=50');
    expect(lastRes.body.items).toHaveLength(50);
    expect(lastRes.body.hasNextPage).toBe(false);
  });
});

/* ================================================================== */
/* GET /api/v1/certificates/:id — Detail (AC 19, 20, 43, 44, 45)      */
/* ================================================================== */

describe('GET /api/v1/certificates/:id — detail (AC 19, 20, 43, 44, 45)', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = initDatabase(':memory:');
    app = createApp(db);
    seedStandard(db);
  });
  afterEach(() => closeDatabase(db));

  it('returns all metadata fields (AC 19)', async () => {
    const res = await request(app).get('/api/v1/certificates/cert-1');
    expect(res.status).toBe(200);
    const body = res.body;
    expect(body.commonName).toBe('api-payments.bank.internal');
    expect(body.sans).toEqual(['payments-v2', 'payments-canary']);
    expect(body.serial).toBe('0x00d4e82f1a23b5c7');
    expect(body.issuer).toBe('Test CA');
    expect(body.algorithm).toBe('RSA 2048');
    expect(body.fingerprintSHA256).toBe('aabbccdd');
    expect(body.owner).toBe('time-pagamentos');
    expect(body.environment).toBe('prd');
    expect(body.notBefore).toBeDefined();
    expect(body.notAfter).toBeDefined();
  });

  it('includes PEM content (AC 20)', async () => {
    const res = await request(app).get('/api/v1/certificates/cert-1');
    expect(res.body.pemContent).toBe(PEM_SAMPLE);
  });

  it('shows validity dates and days until expiration (AC 44)', async () => {
    const res = await request(app).get('/api/v1/certificates/cert-1');
    expect(res.body.notBefore).toBe('2024-01-01T00:00:00Z');
    // notAfter is ~12 days from now (dynamically seeded)
    expect(res.body.notAfter).toBeDefined();
    expect(typeof res.body.daysUntilExpiration).toBe('number');
    expect(res.body.daysUntilExpiration).toBeGreaterThanOrEqual(10);
    expect(res.body.daysUntilExpiration).toBeLessThanOrEqual(13);
    expect(res.body.daysLeftFormatted).toContain('dias');
  });

  it('shows status badge with correct color (AC 45)', async () => {
    // Critical cert (5 days from now)
    const crit = await request(app).get('/api/v1/certificates/cert-2');
    expect(crit.body.status).toBe('critical');
    expect(crit.body.statusColor).toBe('crit');
    expect(crit.body.statusLabel).toBe('Crítico');

    // Attention cert (18 days from now)
    const warn = await request(app).get('/api/v1/certificates/cert-3');
    expect(warn.body.status).toBe('attention');
    expect(warn.body.statusColor).toBe('warn');
    expect(warn.body.statusLabel).toBe('Atenção');

    // Valid cert (183 days from now)
    const ok = await request(app).get('/api/v1/certificates/cert-5');
    expect(ok.body.status).toBe('valid');
    expect(ok.body.statusColor).toBe('ok');
    expect(ok.body.statusLabel).toBe('Válido');

    // Expired cert
    const exp = await request(app).get('/api/v1/certificates/cert-expired');
    expect(exp.body.status).toBe('expired');
    expect(exp.body.statusColor).toBe('crit');
    expect(exp.body.statusLabel).toBe('Expirado');

    // Revoked cert
    const rev = await request(app).get('/api/v1/certificates/cert-revoked');
    expect(rev.body.status).toBe('revoked');
    expect(rev.body.statusColor).toBe('rev');
    expect(rev.body.statusLabel).toBe('Revogado');
  });

  it('PKI fields present and org fields editable (AC 43)', async () => {
    const res = await request(app).get('/api/v1/certificates/cert-1');
    // PKI fields are read-only (present in response, not editable)
    expect(res.body.commonName).toBeDefined();
    expect(res.body.serial).toBeDefined();
    expect(res.body.fingerprintSHA256).toBeDefined();
    // Org fields (editable via PATCH)
    expect(res.body.owner).toBeDefined();
    expect(res.body.description).toBeDefined();
    expect(res.body.tags).toBeDefined();
  });

  it('returns 404 for non-existent cert', async () => {
    const res = await request(app).get('/api/v1/certificates/nonexistent');
    expect(res.status).toBe(404);
  });
});

/* ================================================================== */
/* GET /api/v1/certificates/:id/download — PEM download (AC 22)        */
/* ================================================================== */

describe('GET /api/v1/certificates/:id/download (AC 22)', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = initDatabase(':memory:');
    app = createApp(db);
    seedStandard(db);
  });
  afterEach(() => closeDatabase(db));

  it('downloads PEM file with correct filename (AC 22)', async () => {
    const res = await request(app).get('/api/v1/certificates/cert-1/download');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/x-pem-file');
    expect(res.headers['content-disposition']).toContain(
      'api-payments.bank.internal.pem',
    );
    expect(res.text).toBe(PEM_SAMPLE);
  });

  it('returns 404 for non-existent cert', async () => {
    const res = await request(app).get('/api/v1/certificates/nonexistent/download');
    expect(res.status).toBe(404);
  });

  it('returns 404 for cert without PEM', async () => {
    insertCert(db, { id: 'no-pem', pem_content: null });
    const res = await request(app).get('/api/v1/certificates/no-pem/download');
    expect(res.status).toBe(404);
  });
});

/* ================================================================== */
/* GET /api/v1/certificates/export — CSV & JSON export (AC 31, 40)     */
/* ================================================================== */

describe('GET /api/v1/certificates/export (AC 31, 40)', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = initDatabase(':memory:');
    app = createApp(db);
    seedStandard(db);
  });
  afterEach(() => closeDatabase(db));

  it('exports CSV with correct columns and filtered data (AC 31)', async () => {
    const res = await request(app).get('/api/v1/certificates/export?format=csv&environment=prd');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/certs_export_\d+\.csv/);

    const lines = res.text.split('\n');
    expect(lines[0]).toContain('CN');
    expect(lines[0]).toContain('SANs');
    expect(lines[0]).toContain('Owner');
    expect(lines[0]).toContain('Environment');
    expect(lines[0]).toContain('Status');
    expect(lines[0]).toContain('Tags');
    // At least the header + some data rows
    expect(lines.length).toBeGreaterThan(1);
  });

  it('exports JSON with all metadata (AC 40)', async () => {
    const res = await request(app).get('/api/v1/certificates/export?format=json');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['content-disposition']).toMatch(/certs_export_\d+\.json/);

    const data = JSON.parse(res.text);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(7); // all 7 seeded certs
    expect(data[0].commonName).toBeDefined();
    expect(data[0].owner).toBeDefined();
    expect(data[0].status).toBeDefined();
  });

  it('exports CSV with applied filters (AC 31)', async () => {
    const res = await request(app).get(
      '/api/v1/certificates/export?format=csv&expires_before=30',
    );
    const lines = res.text.split('\n').filter(l => l.trim() !== '');
    // Header + 4 certs expiring < 30d (cert-1, cert-2, cert-3, cert-4)
    expect(lines.length).toBeGreaterThanOrEqual(5); // at least header + 4
  });
});

/* ================================================================== */
/* Health check                                                        */
/* ================================================================== */

describe('GET /api/v1/health', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = initDatabase(':memory:');
    app = createApp(db);
  });
  afterEach(() => closeDatabase(db));

  it('returns ok status', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBe('connected');
    expect(res.body.timestamp).toBeDefined();
  });
});
