/**
 * Certificate service — PATCH (update) and DELETE operations with audit logging.
 *
 * This module provides the business-logic layer for mutating existing
 * certificates.  Every mutation is recorded in the audit log via the
 * audit-service (AC 33, 34).
 *
 * Issue #16 — C3 Chunk 5/7: Audit Log Service & API
 */

import type Database from 'better-sqlite3';
import * as auditService from './audit-service.js';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/** Fields that may be updated on a certificate (organisational / tags). */
export interface CertificateUpdateFields {
  owner?: string;
  application?: string;
  environment?: 'dev' | 'hml' | 'prd';
  zone?: string;
  caProvider?: string;
  description?: string;
  tags?: Record<string, string>;
  customFields?: Record<string, unknown>;
}

/** Stored certificate row (as returned from SQLite). */
export interface CertificateRow {
  id: string;
  common_name: string;
  sans: string;
  serial: string;
  issuer: string;
  not_before: string;
  not_after: string;
  algorithm: string;
  fingerprint_sha256: string;
  owner: string;
  application: string;
  environment: string;
  zone: string;
  ca_provider: string;
  revoked: number;
  pem_content: string | null;
  tags: string;
  custom_fields: string;
  description: string;
  created_at: string;
  updated_at: string;
}

/* ------------------------------------------------------------------ */
/* Read helpers                                                        */
/* ------------------------------------------------------------------ */

/**
 * Fetch a single certificate by ID.
 * Returns `undefined` if not found.
 */
export function getCertificateById(
  db: Database.Database,
  id: string,
): CertificateRow | undefined {
  return db
    .prepare('SELECT * FROM certificates WHERE id = ?')
    .get(id) as CertificateRow | undefined;
}

/* ------------------------------------------------------------------ */
/* Update — AC 33                                                      */
/* ------------------------------------------------------------------ */

/**
 * Update organisational fields and/or tags on a certificate.
 *
 * Creates an audit entry of type UPDATE / SUCCESS with a JSON diff in
 * `details` showing old and new values for each changed field.
 *
 * @param db     Database instance
 * @param id     Certificate UUID
 * @param fields Fields to update
 * @param actor  The user performing the action (default "system")
 * @returns      The updated certificate row, or `null` if not found
 */
export function updateCertificate(
  db: Database.Database,
  id: string,
  fields: CertificateUpdateFields,
  actor: string = 'system',
): CertificateRow | null {
  const existing = getCertificateById(db, id);
  if (!existing) return null;

  // Build SET clauses and diff
  const setClauses: string[] = [];
  const params: unknown[] = [];
  const diff: Record<string, { old: unknown; new: unknown }> = {};

  if (fields.owner !== undefined && fields.owner !== existing.owner) {
    setClauses.push('owner = ?');
    params.push(fields.owner);
    diff.owner = { old: existing.owner, new: fields.owner };
  }

  if (fields.application !== undefined && fields.application !== existing.application) {
    setClauses.push('application = ?');
    params.push(fields.application);
    diff.application = { old: existing.application, new: fields.application };
  }

  if (fields.environment !== undefined && fields.environment !== existing.environment) {
    setClauses.push('environment = ?');
    params.push(fields.environment);
    diff.environment = { old: existing.environment, new: fields.environment };
  }

  if (fields.zone !== undefined && fields.zone !== existing.zone) {
    setClauses.push('zone = ?');
    params.push(fields.zone);
    diff.zone = { old: existing.zone, new: fields.zone };
  }

  if (fields.caProvider !== undefined && fields.caProvider !== existing.ca_provider) {
    setClauses.push('ca_provider = ?');
    params.push(fields.caProvider);
    diff.caProvider = { old: existing.ca_provider, new: fields.caProvider };
  }

  if (fields.description !== undefined && fields.description !== existing.description) {
    setClauses.push('description = ?');
    params.push(fields.description);
    diff.description = { old: existing.description, new: fields.description };
  }

  if (fields.tags !== undefined) {
    const newTagsJson = JSON.stringify(fields.tags);
    if (newTagsJson !== existing.tags) {
      setClauses.push('tags = ?');
      params.push(newTagsJson);
      diff.tags = {
        old: JSON.parse(existing.tags),
        new: fields.tags,
      };
    }
  }

  if (fields.customFields !== undefined) {
    const newCfJson = JSON.stringify(fields.customFields);
    if (newCfJson !== existing.custom_fields) {
      setClauses.push('custom_fields = ?');
      params.push(newCfJson);
      diff.customFields = {
        old: JSON.parse(existing.custom_fields),
        new: fields.customFields,
      };
    }
  }

  // Nothing changed → still log it but return current record
  if (setClauses.length === 0) {
    auditService.log(db, 'UPDATE', id, existing.common_name, actor, 'SUCCESS', { changes: {} });
    return existing;
  }

  // Always update updated_at
  setClauses.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");

  const sql = `UPDATE certificates SET ${setClauses.join(', ')} WHERE id = ?`;
  params.push(id);

  const transaction = db.transaction(() => {
    db.prepare(sql).run(...params);
    auditService.log(db, 'UPDATE', id, existing.common_name, actor, 'SUCCESS', { changes: diff });
  });

  transaction();

  return getCertificateById(db, id) ?? null;
}

/* ------------------------------------------------------------------ */
/* Delete — AC 34                                                      */
/* ------------------------------------------------------------------ */

/**
 * Delete a certificate from the inventory.
 *
 * Creates an audit entry of type DELETE / SUCCESS.
 *
 * @param db    Database instance
 * @param id    Certificate UUID
 * @param actor The user performing the action (default "system")
 * @returns     `true` if deleted, `false` if not found
 */
export function deleteCertificate(
  db: Database.Database,
  id: string,
  actor: string = 'system',
): boolean {
  const existing = getCertificateById(db, id);
  if (!existing) return false;

  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM certificates WHERE id = ?').run(id);
    auditService.log(db, 'DELETE', id, existing.common_name, actor, 'SUCCESS');
  });

  transaction();

  return true;
}
