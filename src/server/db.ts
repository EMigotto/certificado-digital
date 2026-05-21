/**
 * Database module — SQLite via better-sqlite3.
 *
 * Auto-creates the SQLite file at `data/inventory.db` (or a custom path)
 * and runs the schema migration for `certificates` + `audit_log` tables.
 *
 * See ADR §2.2 for the full schema specification.
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

/* ------------------------------------------------------------------ */
/* Schema DDL                                                          */
/* ------------------------------------------------------------------ */

const SCHEMA_SQL = `
-- Core certificate table
CREATE TABLE IF NOT EXISTS certificates (
  id                 TEXT PRIMARY KEY,
  common_name        TEXT NOT NULL,
  sans               TEXT NOT NULL DEFAULT '[]',
  serial             TEXT NOT NULL,
  issuer             TEXT NOT NULL,
  not_before         TEXT NOT NULL,
  not_after          TEXT NOT NULL,
  algorithm          TEXT NOT NULL,
  fingerprint_sha256 TEXT NOT NULL,
  owner              TEXT NOT NULL,
  application        TEXT NOT NULL DEFAULT '',
  environment        TEXT NOT NULL CHECK(environment IN ('dev','hml','prd')),
  zone               TEXT NOT NULL DEFAULT '',
  ca_provider        TEXT NOT NULL DEFAULT '',
  revoked            INTEGER NOT NULL DEFAULT 0,
  pem_content        TEXT,
  tags               TEXT NOT NULL DEFAULT '{}',
  custom_fields      TEXT NOT NULL DEFAULT '{}',
  description        TEXT NOT NULL DEFAULT '',
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Performance indexes (D1: <2 s for 10 k+ rows)
CREATE INDEX IF NOT EXISTS idx_cert_owner    ON certificates(owner);
CREATE INDEX IF NOT EXISTS idx_cert_env      ON certificates(environment);
CREATE INDEX IF NOT EXISTS idx_cert_not_after ON certificates(not_after);
CREATE INDEX IF NOT EXISTS idx_cert_cn       ON certificates(common_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_cert_serial   ON certificates(serial);
CREATE INDEX IF NOT EXISTS idx_cert_ca       ON certificates(ca_provider);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id        TEXT PRIMARY KEY,
  cert_id   TEXT,
  cert_cn   TEXT NOT NULL,
  action    TEXT NOT NULL CHECK(action IN ('CREATE','UPDATE','DELETE','REVOKE')),
  actor     TEXT NOT NULL DEFAULT 'system',
  result    TEXT NOT NULL CHECK(result IN ('SUCCESS','FAILURE')),
  details   TEXT NOT NULL DEFAULT '{}',
  timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_cert   ON audit_log(cert_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_ts     ON audit_log(timestamp);
`;

/* ------------------------------------------------------------------ */
/* Database initialisation                                             */
/* ------------------------------------------------------------------ */

/** Default database file path (relative to project root). */
const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'inventory.db');

/**
 * Open (or create) the SQLite database and run the schema migration.
 *
 * @param dbPath  Optional override for the database file location.
 *                Pass `:memory:` for in-memory databases (useful for tests).
 * @returns       The initialised `better-sqlite3` Database instance.
 */
export function initDatabase(dbPath: string = DEFAULT_DB_PATH): Database.Database {
  // Ensure the directory exists (unless in-memory)
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run schema migration inside a transaction
  db.exec(SCHEMA_SQL);

  return db;
}

/**
 * Close the database gracefully.
 */
export function closeDatabase(db: Database.Database): void {
  db.close();
}

/**
 * Alias for `initDatabase` — used by chunk 15 services & tests.
 * Defaults to in-memory database when no path is supplied.
 */
export function createDatabase(dbPath: string = ':memory:'): Database.Database {
  return initDatabase(dbPath);
}

export type { Database };
