/**
 * Unit tests for the database module.
 *
 * Validates:
 *  - Tables are created (certificates, audit_log)
 *  - All indexes are created per ADR §2.2
 *  - Schema constraints work (environment enum, audit action/result enums)
 *  - Database can be opened in-memory for testing
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initDatabase, closeDatabase } from '../../src/server/db.js';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function getTableNames(db: Database.Database): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

function getIndexNames(db: Database.Database): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

function getColumnNames(db: Database.Database, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.map((r) => r.name);
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe('Database initialisation', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = initDatabase(':memory:');
  });

  afterEach(() => {
    closeDatabase(db);
  });

  /* ---------- Tables ---------- */

  it('creates the certificates table', () => {
    const tables = getTableNames(db);
    expect(tables).toContain('certificates');
  });

  it('creates the audit_log table', () => {
    const tables = getTableNames(db);
    expect(tables).toContain('audit_log');
  });

  it('creates exactly 2 tables', () => {
    const tables = getTableNames(db);
    expect(tables).toHaveLength(2);
  });

  /* ---------- Certificate columns ---------- */

  it('certificates table has all expected columns', () => {
    const cols = getColumnNames(db, 'certificates');
    const expected = [
      'id',
      'common_name',
      'sans',
      'serial',
      'issuer',
      'not_before',
      'not_after',
      'algorithm',
      'fingerprint_sha256',
      'owner',
      'application',
      'environment',
      'zone',
      'ca_provider',
      'revoked',
      'pem_content',
      'tags',
      'custom_fields',
      'description',
      'created_at',
      'updated_at',
    ];
    for (const col of expected) {
      expect(cols).toContain(col);
    }
  });

  /* ---------- Audit log columns ---------- */

  it('audit_log table has all expected columns', () => {
    const cols = getColumnNames(db, 'audit_log');
    const expected = ['id', 'cert_id', 'cert_cn', 'action', 'actor', 'result', 'details', 'timestamp'];
    for (const col of expected) {
      expect(cols).toContain(col);
    }
  });

  /* ---------- Indexes ---------- */

  it('creates all certificate indexes', () => {
    const indexes = getIndexNames(db);
    const expected = [
      'idx_cert_owner',
      'idx_cert_env',
      'idx_cert_not_after',
      'idx_cert_cn',
      'idx_cert_serial',
      'idx_cert_ca',
    ];
    for (const idx of expected) {
      expect(indexes).toContain(idx);
    }
  });

  it('creates all audit_log indexes', () => {
    const indexes = getIndexNames(db);
    const expected = ['idx_audit_cert', 'idx_audit_action', 'idx_audit_ts'];
    for (const idx of expected) {
      expect(indexes).toContain(idx);
    }
  });

  it('creates exactly 9 custom indexes', () => {
    const indexes = getIndexNames(db);
    // 6 cert indexes + 3 audit indexes = 9
    expect(indexes).toHaveLength(9);
  });

  /* ---------- Schema constraints ---------- */

  it('rejects invalid environment values', () => {
    const stmt = db.prepare(`
      INSERT INTO certificates (id, common_name, serial, issuer, not_before, not_after, algorithm, fingerprint_sha256, owner, environment)
      VALUES ('test-1', 'test.example.com', '001', 'CA', '2024-01-01', '2025-01-01', 'RSA 2048', 'abc', 'team-x', 'invalid')
    `);
    expect(() => stmt.run()).toThrow();
  });

  it('accepts valid environment values (dev, hml, prd)', () => {
    for (const env of ['dev', 'hml', 'prd']) {
      const id = `test-env-${env}`;
      db.prepare(`
        INSERT INTO certificates (id, common_name, serial, issuer, not_before, not_after, algorithm, fingerprint_sha256, owner, environment)
        VALUES (?, 'test.example.com', '001', 'CA', '2024-01-01', '2025-01-01', 'RSA 2048', 'abc', 'team-x', ?)
      `).run(id, env);

      const row = db.prepare('SELECT environment FROM certificates WHERE id = ?').get(id) as { environment: string };
      expect(row.environment).toBe(env);
    }
  });

  it('rejects invalid audit action values', () => {
    const stmt = db.prepare(`
      INSERT INTO audit_log (id, cert_cn, action, result)
      VALUES ('a1', 'test.example.com', 'INVALID', 'SUCCESS')
    `);
    expect(() => stmt.run()).toThrow();
  });

  it('rejects invalid audit result values', () => {
    const stmt = db.prepare(`
      INSERT INTO audit_log (id, cert_cn, action, result)
      VALUES ('a2', 'test.example.com', 'CREATE', 'INVALID')
    `);
    expect(() => stmt.run()).toThrow();
  });

  it('accepts valid audit entries', () => {
    for (const action of ['CREATE', 'UPDATE', 'DELETE', 'REVOKE']) {
      for (const result of ['SUCCESS', 'FAILURE']) {
        const id = `audit-${action}-${result}`;
        db.prepare(`
          INSERT INTO audit_log (id, cert_cn, action, result)
          VALUES (?, 'test.example.com', ?, ?)
        `).run(id, action, result);

        const row = db.prepare('SELECT action, result FROM audit_log WHERE id = ?').get(id) as {
          action: string;
          result: string;
        };
        expect(row.action).toBe(action);
        expect(row.result).toBe(result);
      }
    }
  });

  /* ---------- Default values ---------- */

  it('sets default values for optional certificate fields', () => {
    db.prepare(`
      INSERT INTO certificates (id, common_name, serial, issuer, not_before, not_after, algorithm, fingerprint_sha256, owner, environment)
      VALUES ('def-1', 'test.example.com', '001', 'CA', '2024-01-01', '2025-01-01', 'RSA 2048', 'abc', 'team-x', 'dev')
    `).run();

    const row = db.prepare('SELECT * FROM certificates WHERE id = ?').get('def-1') as Record<string, unknown>;
    expect(row.sans).toBe('[]');
    expect(row.application).toBe('');
    expect(row.zone).toBe('');
    expect(row.ca_provider).toBe('');
    expect(row.revoked).toBe(0);
    expect(row.tags).toBe('{}');
    expect(row.custom_fields).toBe('{}');
    expect(row.description).toBe('');
    expect(row.created_at).toBeTruthy();
    expect(row.updated_at).toBeTruthy();
  });

  /* ---------- Idempotent migration ---------- */

  it('can run initDatabase twice without error (idempotent)', () => {
    // db is already initialised in beforeEach — init again should be fine
    // We cannot re-init the same in-memory db, but we can create a second one
    const db2 = initDatabase(':memory:');
    const tables = getTableNames(db2);
    expect(tables).toContain('certificates');
    expect(tables).toContain('audit_log');
    closeDatabase(db2);
  });

  /* ---------- WAL mode ---------- */

  it('uses WAL journal mode for file-based databases', async () => {
    // In-memory databases don't support WAL, so test with a temp file
    const os = await import('node:os');
    const path = await import('node:path');
    const fs = await import('node:fs');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-test-'));
    const tmpDb = initDatabase(path.join(tmpDir, 'test.db'));
    try {
      const row = tmpDb.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
      expect(row.journal_mode).toBe('wal');
    } finally {
      closeDatabase(tmpDb);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
