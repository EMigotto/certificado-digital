/**
 * Audit log service — recording and querying certificate lifecycle events.
 *
 * Covers AC 21, 32, 33, 34:
 *  - AC 21: Audit log section in cert detail → all prior events, timestamp + actor + action + result, newest-first
 *  - AC 32: CREATE audit entry with timestamp, actor, action, target CN, result SUCCESS
 *  - AC 33: UPDATE audit entry with timestamp, actor, action, target CN, result SUCCESS
 *  - AC 34: DELETE audit entry with timestamp, actor, action, target CN, result SUCCESS
 *
 * Issue #16 — C3 Chunk 5/7: Audit Log Service & API
 */

import { v4 as uuidv4 } from 'uuid';
import type Database from 'better-sqlite3';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/** The set of certificate mutation actions tracked by the audit log. */
export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'REVOKE';

/** The possible results of an audited action. */
export type AuditResult = 'SUCCESS' | 'FAILURE';

/** A single audit log entry. */
export interface AuditEntry {
  id: string;
  certId: string | null;
  certCn: string;
  action: AuditAction;
  actor: string;
  result: AuditResult;
  details: Record<string, unknown>;
  timestamp: string; // ISO-8601
}

/** Filters for querying the global audit log. */
export interface AuditFilters {
  action?: AuditAction;
  actor?: string;
  certCn?: string;
  dateFrom?: string; // ISO-8601
  dateTo?: string; // ISO-8601
}

/** Paginated audit log response. */
export interface AuditPage {
  items: AuditEntry[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/* ------------------------------------------------------------------ */
/* SQL statements                                                      */
/* ------------------------------------------------------------------ */

const INSERT_AUDIT_SQL = `
  INSERT INTO audit_log (id, cert_id, cert_cn, action, actor, result, details, timestamp)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;

/* ------------------------------------------------------------------ */
/* Service functions                                                   */
/* ------------------------------------------------------------------ */

/**
 * Record an audit log entry for a certificate mutation.
 *
 * @param db       Database instance
 * @param action   The mutation type: CREATE, UPDATE, DELETE, REVOKE
 * @param certId   UUID of the target certificate (nullable — cert may have been deleted)
 * @param certCn   Common Name of the target certificate
 * @param actor    The user or service that performed the action
 * @param result   SUCCESS or FAILURE
 * @param details  Optional JSON-serialisable object with additional context (e.g. diff)
 * @returns        The created AuditEntry
 */
export function log(
  db: Database.Database,
  action: AuditAction,
  certId: string | null,
  certCn: string,
  actor: string = 'system',
  result: AuditResult = 'SUCCESS',
  details: Record<string, unknown> = {},
): AuditEntry {
  const id = uuidv4();
  const timestamp = new Date().toISOString();

  db.prepare(INSERT_AUDIT_SQL).run(
    id,
    certId,
    certCn,
    action,
    actor,
    result,
    JSON.stringify(details),
    timestamp,
  );

  return {
    id,
    certId,
    certCn,
    action,
    actor,
    result,
    details,
    timestamp,
  };
}

/**
 * Retrieve the global audit log with optional filters and pagination.
 *
 * Supports filtering by:
 *  - action  (exact match)
 *  - actor   (case-insensitive substring)
 *  - certCn  (case-insensitive substring)
 *  - dateFrom / dateTo (ISO-8601 range, inclusive)
 *
 * Results are sorted by timestamp descending (newest first).
 */
export function getGlobalLog(
  db: Database.Database,
  filters: AuditFilters = {},
  page: number = 1,
  pageSize: number = 50,
): AuditPage {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.action) {
    conditions.push('action = ?');
    params.push(filters.action);
  }
  if (filters.actor) {
    conditions.push('actor LIKE ?');
    params.push(`%${filters.actor}%`);
  }
  if (filters.certCn) {
    conditions.push('cert_cn LIKE ?');
    params.push(`%${filters.certCn}%`);
  }
  if (filters.dateFrom) {
    conditions.push('timestamp >= ?');
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    conditions.push('timestamp <= ?');
    params.push(filters.dateTo);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count total matching entries
  const countSql = `SELECT COUNT(*) AS cnt FROM audit_log ${whereClause}`;
  const { cnt: totalItems } = db.prepare(countSql).get(...params) as { cnt: number };

  // Normalise pagination
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, Math.min(pageSize, 100));
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const effectivePage = Math.min(safePage, totalPages);
  const offset = (effectivePage - 1) * safePageSize;

  // Fetch page of entries (rowid tiebreaker for same-millisecond entries)
  const selectSql = `
    SELECT id, cert_id, cert_cn, action, actor, result, details, timestamp
    FROM audit_log
    ${whereClause}
    ORDER BY timestamp DESC, rowid DESC
    LIMIT ? OFFSET ?
  `;
  const rows = db.prepare(selectSql).all(...params, safePageSize, offset) as Array<{
    id: string;
    cert_id: string | null;
    cert_cn: string;
    action: AuditAction;
    actor: string;
    result: AuditResult;
    details: string;
    timestamp: string;
  }>;

  const items: AuditEntry[] = rows.map(mapRowToAuditEntry);

  return {
    items,
    page: effectivePage,
    pageSize: safePageSize,
    totalItems,
    totalPages,
    hasNextPage: effectivePage < totalPages,
    hasPreviousPage: effectivePage > 1,
  };
}

/**
 * Retrieve all audit log entries for a specific certificate, sorted newest-first.
 *
 * AC 21: Audit log section in cert detail — all prior events, timestamp + actor + action + result.
 */
export function getCertificateLog(
  db: Database.Database,
  certId: string,
): AuditEntry[] {
  const sql = `
    SELECT id, cert_id, cert_cn, action, actor, result, details, timestamp
    FROM audit_log
    WHERE cert_id = ?
    ORDER BY timestamp DESC, rowid DESC
  `;

  const rows = db.prepare(sql).all(certId) as Array<{
    id: string;
    cert_id: string | null;
    cert_cn: string;
    action: AuditAction;
    actor: string;
    result: AuditResult;
    details: string;
    timestamp: string;
  }>;

  return rows.map(mapRowToAuditEntry);
}

/* ------------------------------------------------------------------ */
/* Internal helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * Map a raw database row to a typed AuditEntry, parsing the JSON `details` field.
 */
function mapRowToAuditEntry(row: {
  id: string;
  cert_id: string | null;
  cert_cn: string;
  action: AuditAction;
  actor: string;
  result: AuditResult;
  details: string;
  timestamp: string;
}): AuditEntry {
  let details: Record<string, unknown> = {};
  try {
    details = JSON.parse(row.details);
  } catch {
    details = {};
  }

  return {
    id: row.id,
    certId: row.cert_id,
    certCn: row.cert_cn,
    action: row.action,
    actor: row.actor,
    result: row.result,
    details,
    timestamp: row.timestamp,
  };
}
