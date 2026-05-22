/**
 * HTTP integration tests for certificate import routes.
 *
 * Covers:
 *  - AC 1:  Import single PEM → parsed & saved
 *  - AC 2:  Invalid format → error message
 *  - AC 3:  Bulk CSV import → all valid rows imported
 *  - AC 4:  CSV validation errors → partial import with error report
 *  - AC 38: Missing owner → "Owner is required"
 *  - AC 39: Invalid environment → rejected
 *  - AC 42: Large import rollback on error → partial commit
 *  - AC 46: Wrong file type → "Only CSV files are supported"
 *  - AC 47: Empty CSV → "No valid rows found in file"
 *  - AC 48: Metadata accuracy after PEM import
 *
 * Routes tested:
 *  - POST /api/v1/certificates/import/pem
 *  - POST /api/v1/certificates/import/csv
 *  - PATCH /api/v1/certificates/:id
 *  - DELETE /api/v1/certificates/:id
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import forge from 'node-forge';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createApp } from '../../src/server/index.js';
import { initDatabase, closeDatabase } from '../../src/server/db.js';
import type Database from 'better-sqlite3';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function generateTestPem(cn = 'api-payments.bank.internal', sans: string[] = [cn, 'payments-canary']): string {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01ABCDEF';
  cert.validity.notBefore = new Date('2024-01-01T00:00:00Z');
  cert.validity.notAfter = new Date('2025-12-31T23:59:59Z');
  cert.setSubject([{ name: 'commonName', value: cn }]);
  cert.setIssuer([
    { name: 'commonName', value: 'Internal CA' },
    { name: 'organizationName', value: 'Bank Corp' },
  ]);
  if (sans.length > 0) {
    cert.setExtensions([{
      name: 'subjectAltName',
      altNames: sans.map(s => ({ type: 2, value: s })),
    }]);
  }
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return forge.pki.certificateToPem(cert);
}

function writeTempFile(filename: string, content: string | Buffer): string {
  const tmpPath = path.join(os.tmpdir(), `test-${Date.now()}-${filename}`);
  fs.writeFileSync(tmpPath, content);
  return tmpPath;
}

function buildCsv(headers: string[], rows: string[][]): string {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(row.map(v => {
      if (v.includes(',') || v.includes('"') || v.includes('\n')) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return v;
    }).join(','));
  }
  return lines.join('\n');
}

const CSV_HEADERS = ['cn', 'san', 'owner', 'application', 'environment', 'ca', 'zone'];

/* ------------------------------------------------------------------ */
/* Test suite                                                          */
/* ------------------------------------------------------------------ */

describe('POST /api/v1/certificates/import/pem (AC 1, 2, 38, 39, 48)', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = initDatabase(':memory:');
    app = createApp(db);
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it('imports a valid PEM certificate with metadata (AC 1)', async () => {
    const pem = generateTestPem();
    const tmpFile = writeTempFile('cert.pem', pem);

    const res = await request(app)
      .post('/api/v1/certificates/import/pem')
      .attach('file', tmpFile)
      .field('owner', 'time-pagamentos')
      .field('environment', 'prd')
      .field('application', 'API Payments')
      .field('caProvider', 'Vault PKI');

    expect(res.status).toBe(201);
    expect(res.body.commonName).toBe('api-payments.bank.internal');
    expect(res.body.owner).toBe('time-pagamentos');
    expect(res.body.environment).toBe('prd');
    expect(res.body.id).toBeTruthy();

    fs.unlinkSync(tmpFile);
  });

  it('returns parsed metadata with correct fields (AC 48)', async () => {
    const pem = generateTestPem('exact-test.bank.internal', ['exact-test.bank.internal', 'alt.bank.internal']);
    const tmpFile = writeTempFile('cert48.pem', pem);

    const res = await request(app)
      .post('/api/v1/certificates/import/pem')
      .attach('file', tmpFile)
      .field('owner', 'team-x')
      .field('environment', 'dev');

    expect(res.status).toBe(201);
    expect(res.body.commonName).toBe('exact-test.bank.internal');
    expect(res.body.sans).toContain('exact-test.bank.internal');
    expect(res.body.sans).toContain('alt.bank.internal');
    expect(res.body.serial).toBe('01ABCDEF');
    expect(res.body.fingerprintSHA256).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    expect(res.body.algorithm).toContain('RSA');

    fs.unlinkSync(tmpFile);
  });

  it('supports preview mode without persisting (AC 1)', async () => {
    const pem = generateTestPem();
    const tmpFile = writeTempFile('preview.pem', pem);

    const res = await request(app)
      .post('/api/v1/certificates/import/pem')
      .attach('file', tmpFile)
      .field('owner', 'team-x')
      .field('environment', 'prd')
      .field('preview', 'true');

    expect(res.status).toBe(200);
    expect(res.body.preview).toBeDefined();
    expect(res.body.preview.commonName).toBe('api-payments.bank.internal');

    // Verify nothing was persisted
    const count = (db.prepare('SELECT COUNT(*) AS cnt FROM certificates').get() as { cnt: number }).cnt;
    expect(count).toBe(0);

    fs.unlinkSync(tmpFile);
  });

  it('rejects invalid PEM content (AC 2)', async () => {
    const tmpFile = writeTempFile('invalid.pem', 'this is not a certificate');

    const res = await request(app)
      .post('/api/v1/certificates/import/pem')
      .attach('file', tmpFile)
      .field('owner', 'team-x')
      .field('environment', 'prd');

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Invalid PEM certificate/);

    fs.unlinkSync(tmpFile);
  });

  it('rejects non-PEM file extension (AC 2, 46)', async () => {
    const tmpFile = writeTempFile('data.txt', 'some text data');

    const res = await request(app)
      .post('/api/v1/certificates/import/pem')
      .attach('file', tmpFile)
      .field('owner', 'team-x')
      .field('environment', 'prd');

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Only PEM');

    fs.unlinkSync(tmpFile);
  });

  it('returns error when owner is missing (AC 38)', async () => {
    const pem = generateTestPem();
    const tmpFile = writeTempFile('noowner.pem', pem);

    const res = await request(app)
      .post('/api/v1/certificates/import/pem')
      .attach('file', tmpFile)
      .field('environment', 'prd');

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Validation failed');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'owner', message: 'Owner is required' }),
      ]),
    );

    fs.unlinkSync(tmpFile);
  });

  it('rejects invalid environment value (AC 39)', async () => {
    const pem = generateTestPem();
    const tmpFile = writeTempFile('badenv.pem', pem);

    const res = await request(app)
      .post('/api/v1/certificates/import/pem')
      .attach('file', tmpFile)
      .field('owner', 'team-x')
      .field('environment', 'staging');

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'environment' }),
      ]),
    );

    fs.unlinkSync(tmpFile);
  });

  it('returns 400 when no file is uploaded', async () => {
    const res = await request(app)
      .post('/api/v1/certificates/import/pem')
      .field('owner', 'team-x')
      .field('environment', 'prd');

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('No file uploaded');
  });
});

/* ------------------------------------------------------------------ */
/* POST /api/v1/certificates/import/pkcs12 (AC 1, 2, 46)              */
/* ------------------------------------------------------------------ */

describe('POST /api/v1/certificates/import/pkcs12 (AC 1, 2, 46)', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = initDatabase(':memory:');
    app = createApp(db);
  });

  afterEach(() => {
    closeDatabase(db);
  });

  function generatePkcs12(cn = 'pkcs12-test.bank.internal', passphrase = 'test123'): Buffer {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = 'AABBCCDD';
    cert.validity.notBefore = new Date('2024-01-01T00:00:00Z');
    cert.validity.notAfter = new Date('2025-12-31T23:59:59Z');
    cert.setSubject([{ name: 'commonName', value: cn }]);
    cert.setIssuer([{ name: 'commonName', value: 'Test CA' }]);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], passphrase, { algorithm: '3des' });
    const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
    return Buffer.from(p12Der, 'binary');
  }

  it('imports a valid PKCS#12 file (AC 1)', async () => {
    const p12 = generatePkcs12('pkcs12-import.bank.internal', 'mypassword');
    const tmpFile = writeTempFile('cert.p12', p12);

    const res = await request(app)
      .post('/api/v1/certificates/import/pkcs12')
      .attach('file', tmpFile)
      .field('owner', 'team-x')
      .field('environment', 'prd')
      .field('passphrase', 'mypassword');

    expect(res.status).toBe(201);
    expect(res.body.commonName).toBe('pkcs12-import.bank.internal');
    expect(res.body.id).toBeTruthy();

    fs.unlinkSync(tmpFile);
  });

  it('supports preview mode for PKCS#12', async () => {
    const p12 = generatePkcs12('preview.bank.internal', 'pass');
    const tmpFile = writeTempFile('preview.p12', p12);

    const res = await request(app)
      .post('/api/v1/certificates/import/pkcs12')
      .attach('file', tmpFile)
      .field('owner', 'team-x')
      .field('environment', 'prd')
      .field('passphrase', 'pass')
      .field('preview', 'true');

    expect(res.status).toBe(200);
    expect(res.body.preview.commonName).toBe('preview.bank.internal');

    const count = (db.prepare('SELECT COUNT(*) AS cnt FROM certificates').get() as { cnt: number }).cnt;
    expect(count).toBe(0);

    fs.unlinkSync(tmpFile);
  });

  it('rejects wrong passphrase (AC 2)', async () => {
    const p12 = generatePkcs12('test.com', 'correct-password');
    const tmpFile = writeTempFile('wrong-pass.p12', p12);

    const res = await request(app)
      .post('/api/v1/certificates/import/pkcs12')
      .attach('file', tmpFile)
      .field('owner', 'team-x')
      .field('environment', 'prd')
      .field('passphrase', 'wrong-password');

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Invalid PKCS#12/);

    fs.unlinkSync(tmpFile);
  });

  it('rejects non-PKCS#12 file extension (AC 46)', async () => {
    const tmpFile = writeTempFile('cert.txt', 'not a pkcs12');

    const res = await request(app)
      .post('/api/v1/certificates/import/pkcs12')
      .attach('file', tmpFile)
      .field('owner', 'team-x')
      .field('environment', 'prd');

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Only PKCS#12');

    fs.unlinkSync(tmpFile);
  });

  it('returns 400 when no file is uploaded', async () => {
    const res = await request(app)
      .post('/api/v1/certificates/import/pkcs12')
      .field('owner', 'team-x')
      .field('environment', 'prd');

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('No file uploaded');
  });

  it('validates metadata — missing owner (AC 38)', async () => {
    const p12 = generatePkcs12('meta-test.com', 'pass');
    const tmpFile = writeTempFile('meta.p12', p12);

    const res = await request(app)
      .post('/api/v1/certificates/import/pkcs12')
      .attach('file', tmpFile)
      .field('environment', 'prd')
      .field('passphrase', 'pass');

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'owner', message: 'Owner is required' }),
      ]),
    );

    fs.unlinkSync(tmpFile);
  });
});

/* ------------------------------------------------------------------ */
/* CSV import routes (AC 3, 4, 42, 46, 47)                            */
/* ------------------------------------------------------------------ */

describe('POST /api/v1/certificates/import/csv (AC 3, 4, 42, 46, 47)', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = initDatabase(':memory:');
    app = createApp(db);
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it('imports 100 valid CSV rows (AC 3)', async () => {
    const rows: string[][] = [];
    for (let i = 1; i <= 100; i++) {
      rows.push([`cert-${i}.example.com`, '', `team-${i % 5}`, `app-${i}`, ['dev', 'hml', 'prd'][i % 3], 'Vault PKI', 'zone-a']);
    }
    const csv = buildCsv(CSV_HEADERS, rows);
    const tmpFile = writeTempFile('bulk100.csv', csv);

    const res = await request(app)
      .post('/api/v1/certificates/import/csv')
      .attach('file', tmpFile);

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(100);
    expect(res.body.failed).toBe(0);
    expect(res.body.errors).toHaveLength(0);

    fs.unlinkSync(tmpFile);
  });

  it('reports validation errors with row numbers (AC 4)', async () => {
    const rows: string[][] = [
      ['cert-1.com', '', 'team-a', 'app', 'prd', '', ''],
      ['cert-2.com', '', 'team-b', 'app', 'prd', '', ''],
      ['cert-3.com', '', '', 'app', 'prd', '', ''],  // missing owner
    ];
    const csv = buildCsv(CSV_HEADERS, rows);
    const tmpFile = writeTempFile('errors.csv', csv);

    const res = await request(app)
      .post('/api/v1/certificates/import/csv')
      .attach('file', tmpFile);

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(2);
    expect(res.body.failed).toBe(1);
    expect(res.body.errors[0].row).toBe(3);
    expect(res.body.errors[0].field).toBe('owner');

    fs.unlinkSync(tmpFile);
  });

  it('commits rows 1-149 and skips 150+ on row 150 error (AC 42)', async () => {
    const rows: string[][] = [];
    for (let i = 1; i <= 200; i++) {
      if (i === 150) {
        rows.push(['', '', 'team-a', 'app', 'prd', '', '']); // invalid: missing CN
      } else {
        rows.push([`cert-${i}.com`, '', `team-${i % 3}`, 'app', 'prd', '', '']);
      }
    }
    const csv = buildCsv(CSV_HEADERS, rows);
    const tmpFile = writeTempFile('partial.csv', csv);

    const res = await request(app)
      .post('/api/v1/certificates/import/csv')
      .attach('file', tmpFile);

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(149);
    expect(res.body.failed).toBe(51);
    expect(res.body.errors.some((e: { row: number }) => e.row === 150)).toBe(true);

    fs.unlinkSync(tmpFile);
  });

  it('rejects non-CSV file (AC 46)', async () => {
    const tmpFile = writeTempFile('data.xlsx', 'binary data');

    const res = await request(app)
      .post('/api/v1/certificates/import/csv')
      .attach('file', tmpFile);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Only CSV files are supported');

    fs.unlinkSync(tmpFile);
  });

  it('rejects empty CSV (AC 47)', async () => {
    const csv = 'cn,san,owner,application,environment,ca,zone\n';
    const tmpFile = writeTempFile('empty.csv', csv);

    const res = await request(app)
      .post('/api/v1/certificates/import/csv')
      .attach('file', tmpFile);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('No valid rows found in file');

    fs.unlinkSync(tmpFile);
  });

  it('returns 400 when no file is uploaded', async () => {
    const res = await request(app)
      .post('/api/v1/certificates/import/csv');

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('No file uploaded');
  });
});

/* ------------------------------------------------------------------ */
/* PATCH / DELETE routes (AC 29, 33, 23, 34)                           */
/* ------------------------------------------------------------------ */

describe('PATCH /api/v1/certificates/:id (AC 29, 33)', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;
  let certId: string;

  beforeEach(async () => {
    db = initDatabase(':memory:');
    app = createApp(db);

    // Import a test cert via route
    const pem = generateTestPem();
    const tmpFile = writeTempFile('patch-setup.pem', pem);
    const res = await request(app)
      .post('/api/v1/certificates/import/pem')
      .attach('file', tmpFile)
      .field('owner', 'team-payments')
      .field('environment', 'prd');
    certId = res.body.id;
    fs.unlinkSync(tmpFile);
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it('updates tags and creates audit entry (AC 29, 33)', async () => {
    const res = await request(app)
      .patch(`/api/v1/certificates/${certId}`)
      .set('x-actor', 'alice')
      .send({ tags: { 'critical-app': 'true' } });

    expect(res.status).toBe(200);

    // Verify audit entry
    const audit = db.prepare("SELECT * FROM audit_log WHERE cert_id = ? AND action = 'UPDATE'")
      .get(certId) as { actor: string; result: string } | undefined;
    expect(audit).toBeDefined();
    expect(audit!.actor).toBe('alice');
    expect(audit!.result).toBe('SUCCESS');
  });

  it('updates owner field', async () => {
    const res = await request(app)
      .patch(`/api/v1/certificates/${certId}`)
      .send({ owner: 'new-team' });

    expect(res.status).toBe(200);
    expect(res.body.owner).toBe('new-team');
  });

  it('rejects invalid environment', async () => {
    const res = await request(app)
      .patch(`/api/v1/certificates/${certId}`)
      .send({ environment: 'staging' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Environment must be dev, hml, or prd');
  });

  it('returns 404 for non-existent cert', async () => {
    const res = await request(app)
      .patch('/api/v1/certificates/nonexistent')
      .send({ owner: 'team' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/certificates/:id (AC 23, 34)', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;
  let certId: string;

  beforeEach(async () => {
    db = initDatabase(':memory:');
    app = createApp(db);

    const pem = generateTestPem();
    const tmpFile = writeTempFile('del-setup.pem', pem);
    const res = await request(app)
      .post('/api/v1/certificates/import/pem')
      .attach('file', tmpFile)
      .field('owner', 'team-payments')
      .field('environment', 'prd');
    certId = res.body.id;
    fs.unlinkSync(tmpFile);
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it('deletes certificate and returns 204 (AC 23)', async () => {
    const res = await request(app)
      .delete(`/api/v1/certificates/${certId}`)
      .set('x-actor', 'admin');

    expect(res.status).toBe(204);

    // Verify gone from DB
    const cert = db.prepare('SELECT * FROM certificates WHERE id = ?').get(certId);
    expect(cert).toBeUndefined();
  });

  it('creates DELETE audit entry (AC 34)', async () => {
    await request(app)
      .delete(`/api/v1/certificates/${certId}`)
      .set('x-actor', 'admin');

    const audit = db.prepare("SELECT * FROM audit_log WHERE cert_id = ? AND action = 'DELETE'")
      .get(certId) as { actor: string; result: string; cert_cn: string } | undefined;
    expect(audit).toBeDefined();
    expect(audit!.actor).toBe('admin');
    expect(audit!.result).toBe('SUCCESS');
    expect(audit!.cert_cn).toBe('api-payments.bank.internal');
  });

  it('returns 404 for non-existent cert', async () => {
    const res = await request(app)
      .delete('/api/v1/certificates/nonexistent');

    expect(res.status).toBe(404);
  });
});
