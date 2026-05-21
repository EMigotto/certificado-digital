/**
 * Database initialisation for the certificate inventory.
 *
 * Uses SQLite via better-sqlite3 — zero-ops, single-file,
 * handles 10k+ rows with indexes (ADR §2.2).
 */
import Database from 'better-sqlite3';

/* ------------------------------------------------------------------ */
/* Schema (from ADR §2.2)                                              */
/* ------------------------------------------------------------------ */

const SCHEMA = `
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

-- Performance indexes (ADR D1: <2s for 10k+ rows)
CREATE INDEX IF NOT EXISTS idx_cert_owner     ON certificates(owner);
CREATE INDEX IF NOT EXISTS idx_cert_env       ON certificates(environment);
CREATE INDEX IF NOT EXISTS idx_cert_not_after ON certificates(not_after);
CREATE INDEX IF NOT EXISTS idx_cert_cn        ON certificates(common_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_cert_serial    ON certificates(serial);
CREATE INDEX IF NOT EXISTS idx_cert_ca        ON certificates(ca_provider);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY,
  cert_id    TEXT,
  cert_cn    TEXT NOT NULL,
  action     TEXT NOT NULL CHECK(action IN ('CREATE','UPDATE','DELETE','REVOKE')),
  actor      TEXT NOT NULL DEFAULT 'system',
  result     TEXT NOT NULL CHECK(result IN ('SUCCESS','FAILURE')),
  details    TEXT NOT NULL DEFAULT '{}',
  timestamp  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_cert   ON audit_log(cert_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_ts     ON audit_log(timestamp);
`;

/* ------------------------------------------------------------------ */
/* Factory                                                             */
/* ------------------------------------------------------------------ */

/**
 * Open (or create) a SQLite database and run the schema migration.
 *
 * @param dbPath  File path or `':memory:'` for an in-memory DB.
 */
export function createDatabase(dbPath: string = ':memory:'): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

export type { Database };
