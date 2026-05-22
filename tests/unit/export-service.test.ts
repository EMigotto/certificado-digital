/**
 * Tests for ExportService — CSV & JSON export.
 *
 * Covers AC: 31, 40.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createDatabase } from '../../src/server/db.js';
import { CertificateService } from '../../src/server/services/certificate-service.js';
import { ExportService } from '../../src/server/services/export-service.js';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const NOW = new Date('2025-06-01T12:00:00Z');

let db: Database.Database;
let certService: CertificateService;
let exportService: ExportService;

function seedCerts(): void {
  const stmt = db.prepare(
    `INSERT INTO certificates
       (id, common_name, sans, serial, issuer, not_before, not_after,
        algorithm, fingerprint_sha256, owner, application, environment,
        zone, ca_provider, revoked, pem_content, tags, custom_fields,
        description)
     VALUES (?, ?, ?, ?, 'Test CA', '2024-01-01T00:00:00Z', ?,
             'RSA 2048', 'aabb', ?, 'App', ?, 'zone-a', ?, 0, NULL,
             ?, '{}', '')`,
  );

  stmt.run(
    'exp-1',
    'api-payments.bank.internal',
    '["pay-v2"]',
    '0xAA',
    '2025-06-13T00:00:00Z',
    'time-pagamentos',
    'prd',
    'Vault PKI',
    '{"critical-app":"true"}',
  );

  stmt.run(
    'exp-2',
    'mtls-broker.bank.internal',
    '[]',
    '0xBB',
    '2025-06-06T00:00:00Z',
    'time-data',
    'prd',
    'ACM PCA',
    '{}',
  );

  stmt.run(
    'exp-3',
    'dev-svc.bank.internal',
    '[]',
    '0xCC',
    '2025-12-01T00:00:00Z',
    'time-dev',
    'dev',
    'Vault PKI',
    '{}',
  );
}

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  db = createDatabase(':memory:');
  certService = new CertificateService(db);
  exportService = new ExportService(certService);
  seedCerts();
});

/* ================================================================== */
/* Export CSV — AC 31                                                   */
/* ================================================================== */

describe('Export CSV (AC 31)', () => {
  it('generates CSV with correct header row', () => {
    const result = exportService.exportCsv({}, NOW);
    const lines = result.data.split('\n');
    expect(lines[0]).toBe('CN,SANs,Owner,Environment,CA,Status,Days until expiration,Tags');
  });

  it('includes all certificates when no filters applied', () => {
    const result = exportService.exportCsv({}, NOW);
    const lines = result.data.split('\n');
    // header + 3 data rows
    expect(lines).toHaveLength(4);
  });

  it('applies filters to export results', () => {
    const result = exportService.exportCsv({ environment: 'prd' }, NOW);
    const lines = result.data.split('\n');
    // header + 2 prd rows
    expect(lines).toHaveLength(3);
  });

  it('filename contains timestamp', () => {
    const result = exportService.exportCsv({}, NOW);
    expect(result.filename).toMatch(/^certs_export_\d{8}\.csv$/);
  });

  it('content type is text/csv', () => {
    const result = exportService.exportCsv({}, NOW);
    expect(result.contentType).toContain('text/csv');
  });

  it('CSV rows contain correct data', () => {
    const result = exportService.exportCsv({}, NOW);
    const lines = result.data.split('\n');
    // First data row (sorted by not_after asc → mtls-broker expires soonest)
    expect(lines[1]).toContain('mtls-broker.bank.internal');
    expect(lines[1]).toContain('ACM PCA');
  });

  it('properly escapes fields with commas', () => {
    // Insert a cert with commas in description (shows in tags)
    db.prepare(
      `INSERT INTO certificates
         (id, common_name, sans, serial, issuer, not_before, not_after,
          algorithm, fingerprint_sha256, owner, application, environment,
          zone, ca_provider, revoked, pem_content, tags, custom_fields,
          description)
       VALUES ('esc-1', 'comma,cert.test', '[]', '0xDD', 'Test CA',
               '2024-01-01T00:00:00Z', '2026-01-01T00:00:00Z',
               'RSA 2048', 'aabb', 'team', 'App', 'prd', '', 'Vault PKI',
               0, NULL, '{"key":"val,ue"}', '{}', '')`,
    ).run();

    const result = exportService.exportCsv({}, NOW);
    // The CN with comma should be properly quoted
    expect(result.data).toContain('"comma,cert.test"');
  });
});

/* ================================================================== */
/* Export JSON — AC 40                                                  */
/* ================================================================== */

describe('Export JSON (AC 40)', () => {
  it('generates valid JSON array', () => {
    const result = exportService.exportJson({}, NOW);
    const parsed = JSON.parse(result.data);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(3);
  });

  it('each object includes all metadata fields', () => {
    const result = exportService.exportJson({}, NOW);
    const parsed = JSON.parse(result.data);
    const cert = parsed[0];
    expect(cert).toHaveProperty('commonName');
    expect(cert).toHaveProperty('sans');
    expect(cert).toHaveProperty('serial');
    expect(cert).toHaveProperty('issuer');
    expect(cert).toHaveProperty('notBefore');
    expect(cert).toHaveProperty('notAfter');
    expect(cert).toHaveProperty('owner');
    expect(cert).toHaveProperty('environment');
    expect(cert).toHaveProperty('status');
    expect(cert).toHaveProperty('statusLabel');
    expect(cert).toHaveProperty('daysUntilExpiration');
    expect(cert).toHaveProperty('tags');
  });

  it('applies filters to export results', () => {
    const result = exportService.exportJson({ environment: 'dev' }, NOW);
    const parsed = JSON.parse(result.data);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].commonName).toBe('dev-svc.bank.internal');
  });

  it('filename contains timestamp', () => {
    const result = exportService.exportJson({}, NOW);
    expect(result.filename).toMatch(/^certs_export_\d{8}\.json$/);
  });

  it('content type is application/json', () => {
    const result = exportService.exportJson({}, NOW);
    expect(result.contentType).toContain('application/json');
  });
});
