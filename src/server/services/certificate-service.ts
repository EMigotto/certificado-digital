/**
 * Certificate service — CRUD, search, filter, pagination.
 *
 * Covers ACs: 5–20, 22–23, 29–30, 35–37, 41, 43–45, 49–50.
 *
 * All queries are built dynamically with parameterised bindings
 * (no string concatenation) and leverage the indexes declared in
 * `db.ts` so that 10k+ row datasets return in < 2 s (AC 35-36).
 *
 * Also provides standalone functions `updateCertificate`, `deleteCertificate`,
 * and `getCertificateById` for use with the dedicated audit-service module
 * (AC 33, 34 — Chunk 5/7).
 */
import type Database from 'better-sqlite3';
import * as auditService from './audit-service.js';
import {
  computeStatus,
  daysUntilExpiration,
  statusLabel,
  statusColor,
  type CertificateStatus,
} from '../../models/certificate.js';

/* ------------------------------------------------------------------ */
/* Row / Response types                                                */
/* ------------------------------------------------------------------ */

/** Raw row coming out of SQLite. */
export interface CertificateRow {
  id: string;
  common_name: string;
  sans: string;            // JSON array
  serial: string;
  issuer: string;
  not_before: string;      // ISO-8601
  not_after: string;       // ISO-8601
  algorithm: string;
  fingerprint_sha256: string;
  owner: string;
  application: string;
  environment: string;
  zone: string;
  ca_provider: string;
  revoked: number;         // 0 | 1
  pem_content: string | null;
  tags: string;            // JSON object
  custom_fields: string;   // JSON object
  description: string;
  created_at: string;
  updated_at: string;
}

/** Enriched certificate returned by the API. */
export interface CertificateDetail {
  id: string;
  commonName: string;
  sans: string[];
  serial: string;
  issuer: string;
  notBefore: string;
  notAfter: string;
  algorithm: string;
  fingerprintSHA256: string;
  owner: string;
  application: string;
  environment: string;
  zone: string;
  caProvider: string;
  revoked: boolean;
  pemContent: string | null;
  tags: Record<string, string>;
  customFields: Record<string, unknown>;
  description: string;
  createdAt: string;
  updatedAt: string;
  // Computed -------------------------------------------------------
  status: CertificateStatus;
  statusLabel: string;
  statusColor: string;
  daysUntilExpiration: number;
  daysLeftFormatted: string;
}

/** Paginated list response. */
export interface ListResult {
  items: CertificateDetail[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/** Parameters accepted by `list()`. */
export interface ListParams {
  q?: string;
  environment?: string;
  owner?: string;
  ca?: string;
  status?: string;
  tag?: string;
  expires_before?: number;   // max days until expiry
  page?: number;             // 1-based
  page_size?: number;        // default 50, max 100
  sort?: string;
  order?: 'asc' | 'desc';
}

/** Fields that can be patched (org-only; PKI fields are read-only). */
export interface UpdatePayload {
  owner?: string;
  application?: string;
  environment?: 'dev' | 'hml' | 'prd';
  zone?: string;
  ca_provider?: string;
  tags?: Record<string, string>;
  custom_fields?: Record<string, unknown>;
  description?: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const VALID_SORT_COLUMNS: Record<string, string> = {
  common_name: 'common_name',
  commonName: 'common_name',
  not_after: 'not_after',
  notAfter: 'not_after',
  not_before: 'not_before',
  owner: 'owner',
  environment: 'environment',
  ca_provider: 'ca_provider',
  caProvider: 'ca_provider',
  created_at: 'created_at',
  serial: 'serial',
};

function rowToDetail(row: CertificateRow, now: Date = new Date()): CertificateDetail {
  const sans: string[] = JSON.parse(row.sans);
  const tags: Record<string, string> = JSON.parse(row.tags);
  const customFields: Record<string, unknown> = JSON.parse(row.custom_fields);
  const revoked = row.revoked === 1;

  // Build a lightweight Certificate-compatible object for computeStatus
  const certLike = {
    id: row.id,
    commonName: row.common_name,
    sans,
    serial: row.serial,
    issuer: row.issuer,
    notBefore: new Date(row.not_before),
    notAfter: new Date(row.not_after),
    algorithm: row.algorithm,
    fingerprintSHA256: row.fingerprint_sha256,
    owner: row.owner,
    application: row.application,
    environment: row.environment as 'dev' | 'hml' | 'prd',
    zone: row.zone,
    tags,
    customFields,
    revoked,
  };

  const status = computeStatus(certLike, now);
  const days = daysUntilExpiration(certLike.notAfter, now);

  return {
    id: row.id,
    commonName: row.common_name,
    sans,
    serial: row.serial,
    issuer: row.issuer,
    notBefore: row.not_before,
    notAfter: row.not_after,
    algorithm: row.algorithm,
    fingerprintSHA256: row.fingerprint_sha256,
    owner: row.owner,
    application: row.application,
    environment: row.environment,
    zone: row.zone,
    caProvider: row.ca_provider,
    revoked,
    pemContent: row.pem_content,
    tags,
    customFields,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status,
    statusLabel: statusLabel(status),
    statusColor: statusColor(status),
    daysUntilExpiration: days,
    daysLeftFormatted: `${days} dias`,
  };
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

export class CertificateService {
  constructor(private db: Database.Database) {}

  /* ---- LIST (search + filter + paginate) --- AC 5–18, 30, 35–37, 41 */

  list(params: ListParams, now: Date = new Date()): ListResult {
    const nowIso = now.toISOString();
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    // Free-text search — case-insensitive substring (AC 5–9, 37, 41)
    if (params.q && params.q.trim()) {
      const q = `%${params.q.trim()}%`;
      conditions.push(
        `(common_name LIKE ? COLLATE NOCASE
          OR sans LIKE ? COLLATE NOCASE
          OR serial LIKE ? COLLATE NOCASE
          OR owner LIKE ? COLLATE NOCASE)`,
      );
      bindings.push(q, q, q, q);
    }

    // Environment filter (AC 11)
    if (params.environment) {
      conditions.push('environment = ?');
      bindings.push(params.environment);
    }

    // Owner filter (AC 8, 14)
    if (params.owner) {
      conditions.push('owner = ?');
      bindings.push(params.owner);
    }

    // CA provider filter (AC 12)
    if (params.ca) {
      conditions.push('ca_provider LIKE ? COLLATE NOCASE');
      bindings.push(`%${params.ca}%`);
    }

    // Expiration window filter (AC 10)
    // Certs that expire WITHIN the next N days (and are NOT already expired)
    if (params.expires_before != null && params.expires_before > 0) {
      const futureDate = new Date(now.getTime() + params.expires_before * 86_400_000).toISOString();
      conditions.push('not_after > ? AND not_after <= ?');
      bindings.push(nowIso, futureDate);
    }

    // Status filter (AC 13, 45, 49)
    if (params.status) {
      const d7 = new Date(now.getTime() + 7 * 86_400_000).toISOString();
      const d30 = new Date(now.getTime() + 30 * 86_400_000).toISOString();
      switch (params.status) {
        case 'expired':
          conditions.push('not_after <= ? AND revoked = 0');
          bindings.push(nowIso);
          break;
        case 'revoked':
          conditions.push('revoked = 1');
          break;
        case 'critical':
          conditions.push('not_after > ? AND not_after <= ? AND revoked = 0');
          bindings.push(nowIso, d7);
          break;
        case 'attention':
          conditions.push('not_after > ? AND not_after <= ? AND revoked = 0');
          bindings.push(d7, d30);
          break;
        case 'valid':
          conditions.push('not_after > ? AND revoked = 0');
          bindings.push(d30);
          break;
      }
    }

    // Tag filter (AC 30)
    if (params.tag) {
      conditions.push("json_extract(tags, '$.' || ?) IS NOT NULL");
      bindings.push(params.tag);
    }

    const where = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Count total (for pagination metadata)
    const countSql = `SELECT COUNT(*) as cnt FROM certificates ${where}`;
    const totalItems = (this.db.prepare(countSql).get(...bindings) as { cnt: number }).cnt;

    // Sort
    const sortCol = VALID_SORT_COLUMNS[params.sort ?? ''] ?? 'not_after';
    const sortDir = params.order === 'desc' ? 'DESC' : 'ASC';

    // Pagination (AC 16–18, 50)
    const pageSize = Math.min(Math.max(params.page_size ?? 50, 1), 100);
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const page = Math.max(1, Math.min(params.page ?? 1, totalPages));
    const offset = (page - 1) * pageSize;

    const dataSql = `
      SELECT * FROM certificates
      ${where}
      ORDER BY ${sortCol} ${sortDir}
      LIMIT ? OFFSET ?
    `;
    const rows = this.db
      .prepare(dataSql)
      .all(...bindings, pageSize, offset) as CertificateRow[];

    return {
      items: rows.map((r) => rowToDetail(r, now)),
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  /* ---- GET BY ID --- AC 19, 20, 43, 44 ----------------------------- */

  getById(id: string, now: Date = new Date()): CertificateDetail | null {
    const row = this.db
      .prepare('SELECT * FROM certificates WHERE id = ?')
      .get(id) as CertificateRow | undefined;

    if (!row) return null;
    return rowToDetail(row, now);
  }

  /* ---- UPDATE (org fields only) --- AC 29, 43 ---------------------- */

  update(
    id: string,
    payload: UpdatePayload,
    actor: string = 'system',
    now: Date = new Date(),
  ): CertificateDetail | null {
    const existing = this.db
      .prepare('SELECT * FROM certificates WHERE id = ?')
      .get(id) as CertificateRow | undefined;

    if (!existing) return null;

    const setClauses: string[] = [];
    const setBindings: unknown[] = [];

    if (payload.owner !== undefined) {
      setClauses.push('owner = ?');
      setBindings.push(payload.owner);
    }
    if (payload.application !== undefined) {
      setClauses.push('application = ?');
      setBindings.push(payload.application);
    }
    if (payload.environment !== undefined) {
      if (!['dev', 'hml', 'prd'].includes(payload.environment)) {
        throw new Error('Environment must be dev, hml, or prd');
      }
      setClauses.push('environment = ?');
      setBindings.push(payload.environment);
    }
    if (payload.zone !== undefined) {
      setClauses.push('zone = ?');
      setBindings.push(payload.zone);
    }
    if (payload.ca_provider !== undefined) {
      setClauses.push('ca_provider = ?');
      setBindings.push(payload.ca_provider);
    }
    if (payload.tags !== undefined) {
      setClauses.push('tags = ?');
      setBindings.push(JSON.stringify(payload.tags));
    }
    if (payload.custom_fields !== undefined) {
      setClauses.push('custom_fields = ?');
      setBindings.push(JSON.stringify(payload.custom_fields));
    }
    if (payload.description !== undefined) {
      setClauses.push('description = ?');
      setBindings.push(payload.description);
    }

    if (setClauses.length === 0) {
      return rowToDetail(existing, now);
    }

    setClauses.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");

    const sql = `UPDATE certificates SET ${setClauses.join(', ')} WHERE id = ?`;
    this.db.prepare(sql).run(...setBindings, id);

    // Audit entry (AC 33)
    this._audit(id, existing.common_name, 'UPDATE', actor, JSON.stringify(payload));

    return this.getById(id, now);
  }

  /* ---- DELETE --- AC 23 -------------------------------------------- */

  delete(id: string, actor: string = 'system'): boolean {
    const existing = this.db
      .prepare('SELECT id, common_name FROM certificates WHERE id = ?')
      .get(id) as { id: string; common_name: string } | undefined;

    if (!existing) return false;

    this.db.prepare('DELETE FROM certificates WHERE id = ?').run(id);

    // Audit entry (AC 34)
    this._audit(id, existing.common_name, 'DELETE', actor);

    return true;
  }

  /* ---- DOWNLOAD PEM --- AC 22 -------------------------------------- */

  download(id: string): { filename: string; pem: string } | null {
    const row = this.db
      .prepare('SELECT common_name, pem_content FROM certificates WHERE id = ?')
      .get(id) as { common_name: string; pem_content: string | null } | undefined;

    if (!row || !row.pem_content) return null;

    return {
      filename: `${row.common_name}.pem`,
      pem: row.pem_content,
    };
  }

  /* ---- ALL MATCHING (no pagination, used by export) ---------------- */

  listAll(
    params: Omit<ListParams, 'page' | 'page_size'>,
    now: Date = new Date(),
  ): CertificateDetail[] {
    const result = this.list({ ...params, page: 1, page_size: 100 }, now);
    const allItems = [...result.items];

    // Fetch remaining pages
    let currentPage = 1;
    while (currentPage < result.totalPages) {
      currentPage++;
      const next = this.list({ ...params, page: currentPage, page_size: 100 }, now);
      allItems.push(...next.items);
    }

    return allItems;
  }

  /* ---- Internal: audit helper -------------------------------------- */

  private _audit(
    certId: string,
    certCn: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'REVOKE',
    actor: string = 'system',
    details: string = '{}',
  ): void {
    const id = crypto.randomUUID();
    this.db
      .prepare(
        `INSERT INTO audit_log (id, cert_id, cert_cn, action, actor, result, details)
         VALUES (?, ?, ?, ?, ?, 'SUCCESS', ?)`,
      )
      .run(id, certId, certCn, action, actor, details);
  }
}

/* ================================================================== */
/* Standalone functions — used by audit-service tests (Chunk 5/7)      */
/* ================================================================== */

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

/**
 * Update organisational fields and/or tags on a certificate.
 *
 * Creates an audit entry of type UPDATE / SUCCESS with a JSON diff in
 * `details` showing old and new values for each changed field.
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

/**
 * Delete a certificate from the inventory.
 *
 * Creates an audit entry of type DELETE / SUCCESS.
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
