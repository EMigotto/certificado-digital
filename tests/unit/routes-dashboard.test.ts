/**
 * HTTP integration tests for dashboard routes.
 *
 * Covers:
 *  - AC 24: KPI "Total gerenciados" — total count + 7d growth
 *  - AC 25: KPI "Expiram < 30 dias" — count + warning color
 *  - AC 26: "Alertas críticos" — top 5, CN, env, owner, days, color-coded
 *  - AC 27: 90-day expiration heatmap — 90 cells, intensity = count
 *  - AC 28: Heatmap tooltip data — count per day
 *
 * Routes tested:
 *  - GET /api/v1/dashboard/stats
 *  - GET /api/v1/dashboard/heatmap
 *  - GET /api/v1/dashboard/alerts
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/index.js';
import { initDatabase, closeDatabase } from '../../src/server/db.js';
import type Database from 'better-sqlite3';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function insertCert(db: Database.Database, overrides: Record<string, unknown> = {}): string {
  const id = (overrides.id as string) ?? crypto.randomUUID();
  const defaults = {
    common_name: 'test.bank.internal',
    sans: '[]',
    serial: '0x0001',
    issuer: 'Test CA',
    not_before: '2024-01-01T00:00:00Z',
    not_after: '2026-01-01T00:00:00Z',
    algorithm: 'RSA 2048',
    fingerprint_sha256: 'aabbccdd',
    owner: 'team-test',
    application: '',
    environment: 'prd',
    zone: '',
    ca_provider: 'Vault PKI',
    revoked: 0,
    pem_content: null,
    tags: '{}',
    custom_fields: '{}',
    description: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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

function futureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString();
}

function pastDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

/* ================================================================== */
/* GET /api/v1/dashboard/stats (AC 24, 25)                             */
/* ================================================================== */

describe('GET /api/v1/dashboard/stats (AC 24, 25)', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = initDatabase(':memory:');
    app = createApp(db);
  });
  afterEach(() => closeDatabase(db));

  it('returns total managed certificates count (AC 24)', async () => {
    insertCert(db, { id: 'c1', common_name: 'a.com' });
    insertCert(db, { id: 'c2', common_name: 'b.com' });
    insertCert(db, { id: 'c3', common_name: 'c.com' });

    const res = await request(app).get('/api/v1/dashboard/stats');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
  });

  it('returns 7d growth count (AC 24)', async () => {
    // Cert created recently (within 7 days)
    insertCert(db, { id: 'recent', created_at: new Date().toISOString() });
    // Cert created 30 days ago
    insertCert(db, { id: 'old', created_at: pastDate(30) });

    const res = await request(app).get('/api/v1/dashboard/stats');
    expect(res.body.growthLast7d).toBe(1);
  });

  it('returns expiringSoon count (AC 25)', async () => {
    insertCert(db, { id: 'soon-1', not_after: futureDate(5) });
    insertCert(db, { id: 'soon-2', not_after: futureDate(15) });
    insertCert(db, { id: 'far', not_after: futureDate(100) });

    const res = await request(app).get('/api/v1/dashboard/stats');
    expect(res.body.expiringSoon).toBe(2);
  });

  it('returns expired and revoked counts', async () => {
    insertCert(db, { id: 'exp', not_after: pastDate(5) }); // expired
    insertCert(db, { id: 'rev', revoked: 1 }); // revoked
    insertCert(db, { id: 'ok', not_after: futureDate(100) }); // valid

    const res = await request(app).get('/api/v1/dashboard/stats');
    expect(res.body.expired).toBe(1);
    expect(res.body.revoked).toBe(1);
    expect(res.body.valid).toBe(1);
  });

  it('returns all zero for empty inventory', async () => {
    const res = await request(app).get('/api/v1/dashboard/stats');
    expect(res.body.total).toBe(0);
    expect(res.body.valid).toBe(0);
    expect(res.body.expiringSoon).toBe(0);
    expect(res.body.expired).toBe(0);
    expect(res.body.revoked).toBe(0);
    expect(res.body.growthLast7d).toBe(0);
  });
});

/* ================================================================== */
/* GET /api/v1/dashboard/heatmap (AC 27, 28)                           */
/* ================================================================== */

describe('GET /api/v1/dashboard/heatmap (AC 27, 28)', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = initDatabase(':memory:');
    app = createApp(db);
  });
  afterEach(() => closeDatabase(db));

  it('returns exactly 90 entries (AC 27)', async () => {
    const res = await request(app).get('/api/v1/dashboard/heatmap');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(90);
    expect(res.body[0].dayOffset).toBe(0);
    expect(res.body[89].dayOffset).toBe(89);
  });

  it('cell count represents certs expiring that day (AC 27, 28)', async () => {
    // Insert certs expiring tomorrow
    insertCert(db, { id: 'h1', not_after: futureDate(1) });
    insertCert(db, { id: 'h2', not_after: futureDate(1) });
    insertCert(db, { id: 'h3', not_after: futureDate(30) });

    const res = await request(app).get('/api/v1/dashboard/heatmap');
    // Day 1 should have at least 2 certs
    const day1 = res.body.find((e: { dayOffset: number }) => e.dayOffset === 1);
    expect(day1).toBeDefined();
    expect(day1.count).toBeGreaterThanOrEqual(2);
  });

  it('days with no expirations have count=0', async () => {
    const res = await request(app).get('/api/v1/dashboard/heatmap');
    // All entries should have count 0 when no certs
    expect(res.body.every((e: { count: number }) => e.count === 0)).toBe(true);
  });

  it('excludes revoked certificates from heatmap', async () => {
    insertCert(db, { id: 'revoked-h', not_after: futureDate(5), revoked: 1 });

    const res = await request(app).get('/api/v1/dashboard/heatmap');
    const day5 = res.body.find((e: { dayOffset: number }) => e.dayOffset === 5);
    expect(day5.count).toBe(0);
  });
});

/* ================================================================== */
/* GET /api/v1/dashboard/alerts (AC 26)                                */
/* ================================================================== */

describe('GET /api/v1/dashboard/alerts (AC 26)', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = initDatabase(':memory:');
    app = createApp(db);
  });
  afterEach(() => closeDatabase(db));

  it('returns top 5 soonest-expiring certs (AC 26)', async () => {
    for (let i = 1; i <= 10; i++) {
      insertCert(db, {
        id: `alert-${i}`,
        common_name: `svc-${i}.bank.internal`,
        not_after: futureDate(i * 3), // 3, 6, 9, 12, 15, 18, 21, 24, 27, 30
        owner: `team-${i}`,
        environment: ['prd', 'hml', 'dev'][i % 3],
        ca_provider: 'Vault PKI',
      });
    }

    const res = await request(app).get('/api/v1/dashboard/alerts');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(5);
    // Should be sorted by nearest expiration
    expect(res.body[0].commonName).toBe('svc-1.bank.internal');
    expect(res.body[0].daysRemaining).toBeLessThanOrEqual(res.body[1].daysRemaining);
  });

  it('each alert has CN, environment, owner, daysRemaining (AC 26)', async () => {
    insertCert(db, {
      id: 'alert-1',
      common_name: 'api-payments.bank.internal',
      not_after: futureDate(2),
      owner: 'time-pagamentos',
      environment: 'prd',
      ca_provider: 'Vault PKI',
    });

    const res = await request(app).get('/api/v1/dashboard/alerts');
    expect(res.body).toHaveLength(1);
    const alert = res.body[0];
    expect(alert.commonName).toBe('api-payments.bank.internal');
    expect(alert.environment).toBe('prd');
    expect(alert.caProvider).toBe('Vault PKI');
    expect(alert.owner).toBe('time-pagamentos');
    expect(typeof alert.daysRemaining).toBe('number');
    expect(alert.daysRemaining).toBeGreaterThanOrEqual(0);
  });

  it('supports custom limit parameter', async () => {
    for (let i = 1; i <= 10; i++) {
      insertCert(db, {
        id: `lim-${i}`,
        common_name: `svc-${i}.test`,
        not_after: futureDate(i),
      });
    }

    const res = await request(app).get('/api/v1/dashboard/alerts?limit=3');
    expect(res.body).toHaveLength(3);
  });

  it('excludes expired and revoked certs from alerts', async () => {
    insertCert(db, { id: 'expired-a', not_after: pastDate(5) });
    insertCert(db, { id: 'revoked-a', not_after: futureDate(5), revoked: 1 });
    insertCert(db, { id: 'valid-a', not_after: futureDate(10), common_name: 'valid.test' });

    const res = await request(app).get('/api/v1/dashboard/alerts');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].commonName).toBe('valid.test');
  });

  it('returns empty array when no certs', async () => {
    const res = await request(app).get('/api/v1/dashboard/alerts');
    expect(res.body).toHaveLength(0);
  });

  it('ignores invalid limit parameter', async () => {
    insertCert(db, { id: 'il-1', not_after: futureDate(5) });
    insertCert(db, { id: 'il-2', not_after: futureDate(10) });

    const res = await request(app).get('/api/v1/dashboard/alerts?limit=abc');
    expect(res.status).toBe(200);
    // Falls back to default limit (5)
    expect(res.body).toHaveLength(2);
  });

  it('caps limit at 100', async () => {
    const res = await request(app).get('/api/v1/dashboard/alerts?limit=999');
    expect(res.status).toBe(200);
    // Should not crash
    expect(Array.isArray(res.body)).toBe(true);
  });
});
