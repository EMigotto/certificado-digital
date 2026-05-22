/**
 * HTTP integration tests for audit log routes.
 *
 * Covers:
 *  - AC 21: Cert-specific audit log with all events, newest-first
 *  - AC 32: CREATE audit entry after import
 *  - AC 33: UPDATE audit entry after tag/owner edit
 *  - AC 34: DELETE audit entry after deletion
 *
 * Routes tested:
 *  - GET /api/v1/audit
 *  - GET /api/v1/certificates/:id/audit
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import forge from 'node-forge';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createApp } from '../../src/server/index.js';
import { initDatabase, closeDatabase } from '../../src/server/db.js';
import * as auditService from '../../src/server/services/audit-service.js';
import type Database from 'better-sqlite3';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function generateTestPem(cn = 'audit-test.bank.internal'): string {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01ABCDEF';
  cert.validity.notBefore = new Date('2024-01-01T00:00:00Z');
  cert.validity.notAfter = new Date('2025-12-31T23:59:59Z');
  cert.setSubject([{ name: 'commonName', value: cn }]);
  cert.setIssuer([{ name: 'commonName', value: 'Test CA' }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return forge.pki.certificateToPem(cert);
}

function writeTempFile(filename: string, content: string): string {
  const tmpPath = path.join(os.tmpdir(), `test-audit-${Date.now()}-${filename}`);
  fs.writeFileSync(tmpPath, content);
  return tmpPath;
}

async function importCert(app: ReturnType<typeof createApp>, cn?: string): Promise<string> {
  const pem = generateTestPem(cn);
  const tmpFile = writeTempFile('cert.pem', pem);
  const res = await request(app)
    .post('/api/v1/certificates/import/pem')
    .attach('file', tmpFile)
    .field('owner', 'team-test')
    .field('environment', 'prd');
  fs.unlinkSync(tmpFile);
  return res.body.id;
}

/* ================================================================== */
/* GET /api/v1/audit — Global audit log                                */
/* ================================================================== */

describe('GET /api/v1/audit (global audit log)', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = initDatabase(':memory:');
    app = createApp(db);
  });
  afterEach(() => closeDatabase(db));

  it('returns paginated audit entries sorted newest-first', async () => {
    // Create some entries
    auditService.log(db, 'CREATE', 'c1', 'cert-1.com', 'alice', 'SUCCESS');
    auditService.log(db, 'UPDATE', 'c2', 'cert-2.com', 'bob', 'SUCCESS');
    auditService.log(db, 'DELETE', 'c3', 'cert-3.com', 'charlie', 'SUCCESS');

    const res = await request(app).get('/api/v1/audit');
    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(3);
    expect(res.body.items).toHaveLength(3);
    // Newest first
    expect(res.body.items[0].action).toBe('DELETE');
    expect(res.body.items[2].action).toBe('CREATE');
  });

  it('paginates results', async () => {
    for (let i = 0; i < 10; i++) {
      auditService.log(db, 'CREATE', `c${i}`, `cert-${i}.com`);
    }

    const res = await request(app).get('/api/v1/audit?page=1&page_size=3');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(3);
    expect(res.body.page).toBe(1);
    expect(res.body.totalItems).toBe(10);
    expect(res.body.totalPages).toBe(4);
    expect(res.body.hasNextPage).toBe(true);
  });

  it('filters by action', async () => {
    auditService.log(db, 'CREATE', 'c1', 'a.com');
    auditService.log(db, 'UPDATE', 'c2', 'b.com');
    auditService.log(db, 'DELETE', 'c3', 'c.com');

    const res = await request(app).get('/api/v1/audit?action=CREATE');
    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(1);
    expect(res.body.items[0].action).toBe('CREATE');
  });

  it('rejects invalid action filter', async () => {
    const res = await request(app).get('/api/v1/audit?action=INVALID');
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Invalid action');
  });

  it('filters by actor substring', async () => {
    auditService.log(db, 'CREATE', 'c1', 'a.com', 'alice-admin');
    auditService.log(db, 'CREATE', 'c2', 'b.com', 'bob');

    const res = await request(app).get('/api/v1/audit?actor=alice');
    expect(res.body.totalItems).toBe(1);
    expect(res.body.items[0].actor).toBe('alice-admin');
  });

  it('filters by cert CN substring', async () => {
    auditService.log(db, 'CREATE', 'c1', 'api-payments.bank.internal');
    auditService.log(db, 'CREATE', 'c2', 'api-orders.bank.internal');

    const res = await request(app).get('/api/v1/audit?cert_cn=payments');
    expect(res.body.totalItems).toBe(1);
  });

  it('filters by date range', async () => {
    db.prepare(`
      INSERT INTO audit_log (id, cert_id, cert_cn, action, actor, result, details, timestamp)
      VALUES ('a1', 'c1', 'cert1.com', 'CREATE', 'system', 'SUCCESS', '{}', '2024-01-15T10:00:00Z')
    `).run();
    db.prepare(`
      INSERT INTO audit_log (id, cert_id, cert_cn, action, actor, result, details, timestamp)
      VALUES ('a2', 'c2', 'cert2.com', 'UPDATE', 'system', 'SUCCESS', '{}', '2024-02-15T10:00:00Z')
    `).run();

    const res = await request(app).get(
      '/api/v1/audit?date_from=2024-02-01T00:00:00Z&date_to=2024-02-28T23:59:59Z',
    );
    expect(res.body.totalItems).toBe(1);
    expect(res.body.items[0].certCn).toBe('cert2.com');
  });

  it('rejects invalid date_from', async () => {
    const res = await request(app).get('/api/v1/audit?date_from=not-a-date');
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Invalid date_from');
  });

  it('rejects invalid date_to', async () => {
    const res = await request(app).get('/api/v1/audit?date_to=garbage');
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Invalid date_to');
  });
});

/* ================================================================== */
/* GET /api/v1/certificates/:id/audit — Per-cert audit log (AC 21)     */
/* ================================================================== */

describe('GET /api/v1/certificates/:id/audit (AC 21)', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = initDatabase(':memory:');
    app = createApp(db);
  });
  afterEach(() => closeDatabase(db));

  it('returns all events for a cert sorted newest-first (AC 21)', async () => {
    const certId = await importCert(app);

    // Update then delete to create additional audit entries
    await request(app)
      .patch(`/api/v1/certificates/${certId}`)
      .set('x-actor', 'alice')
      .send({ owner: 'new-team' });

    const res = await request(app).get(`/api/v1/certificates/${certId}/audit`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2); // CREATE + UPDATE
    // Newest first
    expect(res.body.items[0].action).toBe('UPDATE');
    expect(res.body.items[1].action).toBe('CREATE');
  });

  it('each entry has timestamp, actor, action, result (AC 21)', async () => {
    const certId = await importCert(app);

    const res = await request(app).get(`/api/v1/certificates/${certId}/audit`);
    const entry = res.body.items[0];
    expect(entry.timestamp).toBeDefined();
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.actor).toBeDefined();
    expect(entry.action).toBe('CREATE');
    expect(entry.result).toBe('SUCCESS');
  });

  it('returns empty for unknown cert', async () => {
    const res = await request(app).get('/api/v1/certificates/nonexistent/audit');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  it('CREATE audit entry after import (AC 32)', async () => {
    const certId = await importCert(app, 'import-audit-test.com');

    const res = await request(app).get(`/api/v1/certificates/${certId}/audit`);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].action).toBe('CREATE');
    expect(res.body.items[0].result).toBe('SUCCESS');
    expect(res.body.items[0].certCn).toBe('import-audit-test.com');
  });

  it('UPDATE audit entry after tag change (AC 33)', async () => {
    const certId = await importCert(app);

    await request(app)
      .patch(`/api/v1/certificates/${certId}`)
      .set('x-actor', 'bob')
      .send({ tags: { 'critical-app': 'true' } });

    const res = await request(app).get(`/api/v1/certificates/${certId}/audit`);
    const updateEntry = res.body.items.find((e: { action: string }) => e.action === 'UPDATE');
    expect(updateEntry).toBeDefined();
    expect(updateEntry.actor).toBe('bob');
    expect(updateEntry.result).toBe('SUCCESS');
  });

  it('DELETE audit entry persists after cert removal (AC 34)', async () => {
    const certId = await importCert(app);

    await request(app)
      .delete(`/api/v1/certificates/${certId}`)
      .set('x-actor', 'admin');

    // Audit entries survive deletion
    const res = await request(app).get(`/api/v1/certificates/${certId}/audit`);
    expect(res.body.items).toHaveLength(2); // CREATE + DELETE
    expect(res.body.items[0].action).toBe('DELETE');
    expect(res.body.items[0].actor).toBe('admin');
    expect(res.body.items[0].result).toBe('SUCCESS');
  });
});
