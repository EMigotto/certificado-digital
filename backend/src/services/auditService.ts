/**
 * Audit logging service — immutable, append-only audit trail.
 *
 * Every certificate mutation (import, update, delete, revoke, export) is
 * logged in the audit_logs table. No UPDATE or DELETE operations are
 * exposed — only INSERT and SELECT.
 *
 * Design principles:
 * - Immutability: No UPDATE or DELETE on audit entries. Only INSERT and SELECT.
 * - Transactional: Audit entries created in the same DB transaction as mutations.
 * - Batch tracking: Bulk imports share a batch_id (UUID v4) stored in dedicated column.
 * - No sensitive data: Passwords, private keys, PEM blobs are NEVER included (NF.3).
 */

import type { AuditLog } from '@prisma/client';
import type {
  AuditLogEntry,
  PaginatedResponse,
  AuditAction,
  AuditResult,
} from '@certificado-digital/shared';
import { AuditRepository, type AuditFilters } from '../repositories/auditRepo.js';
import { parsePaginationParams, buildPaginatedResponse } from '../utils/pagination.js';

// ─── Query param types ───────────────────────────────────────────────────────

export interface AuditQueryParams {
  page?: string;
  pageSize?: string;
  action?: string;
  actor?: string;
  certificateId?: string;
  batchId?: string;
  dateFrom?: string;
  dateTo?: string;
  result?: string;
}

// ─── Logging params ──────────────────────────────────────────────────────────

export interface AuditLogParams {
  /** Who performed the action */
  actor: string;
  /** What action was performed */
  action: AuditAction;
  /** Certificate ID (null if cert was not created, e.g. failed import) */
  certificateId?: string | null;
  /** Certificate common name (for display even if cert is deleted) */
  certificateCn: string;
  /** Outcome of the operation */
  result: AuditResult;
  /** Human-readable detail of the action */
  detail?: string;
  /** Batch ID for bulk import grouping (UUID v4) */
  batchId?: string | null;
  /** Error reason when result is FAILURE */
  errorReason?: string;
  /** Additional metadata (sensitive fields are stripped) */
  metadata?: Record<string, unknown>;
}

// ─── Sensitive field names to strip from audit data ─────────────────────────

const SENSITIVE_FIELDS = new Set([
  'pemData',
  'pem_data',
  'privateKey',
  'private_key',
  'password',
  'secret',
  'passphrase',
]);

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Strip sensitive fields from an object.
 * Ensures no passwords, private keys, or PEM blobs leak into audit logs (NF.3).
 */
export function sanitizeForAudit(obj: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.has(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeForAudit(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Map a Prisma AuditLog to the shared AuditLogEntry type (ISO timestamps).
 */
export function mapToApiAuditEntry(log: AuditLog): AuditLogEntry {
  return {
    id: log.id,
    certId: log.certId,
    certCn: log.certCn,
    action: log.action as AuditAction,
    actor: log.actor,
    result: log.result as AuditResult,
    detail: log.detail,
    batchId: log.batchId,
    timestamp: log.timestamp.toISOString(),
  };
}

/**
 * Build the detail string for an audit entry.
 */
function buildDetailString(params: AuditLogParams): string {
  const parts: string[] = [];

  if (params.detail) {
    parts.push(params.detail);
  }

  if (params.errorReason) {
    parts.push(`error: ${params.errorReason}`);
  }

  if (params.metadata && Object.keys(params.metadata).length > 0) {
    const sanitized = sanitizeForAudit(params.metadata);
    parts.push(`metadata: ${JSON.stringify(sanitized)}`);
  }

  return parts.join(' | ');
}

// ─── Service class ──────────────────────────────────────────────────────────

export class AuditService {
  constructor(private readonly repo: AuditRepository) {}

  /**
   * Log an immutable audit entry.
   *
   * Builds a detail string from the provided params, including error
   * reason and sanitized metadata when present. Batch ID is stored in
   * its own column for efficient querying.
   *
   * FR9 (9.1): Import action logged with timestamp, actor, action, certificate, source, result.
   * FR9 (9.2): Failed import logged with result=FAILURE and error_reason.
   * FR9 (9.3): Bulk import batch tracked with shared batch_id.
   * NF.3: No passwords or private key data in audit entries.
   */
  async log(params: AuditLogParams): Promise<AuditLogEntry> {
    const detail = buildDetailString(params);

    const entry = await this.repo.create({
      certId: params.certificateId ?? null,
      certCn: params.certificateCn,
      action: params.action,
      actor: params.actor,
      result: params.result,
      detail,
      batchId: params.batchId ?? null,
    });

    return mapToApiAuditEntry(entry);
  }

  /**
   * Get paginated, filterable audit entries.
   *
   * Supports filtering by action, actor, certificateId, batchId,
   * date range (dateFrom/dateTo), and result.
   * Default sort: timestamp DESC (most recent first).
   */
  async getEntries(query: AuditQueryParams): Promise<PaginatedResponse<AuditLogEntry>> {
    const pagination = parsePaginationParams({
      page: query.page,
      pageSize: query.pageSize,
    });

    const filters: AuditFilters = {
      action: query.action,
      actor: query.actor,
      certificateId: query.certificateId,
      batchId: query.batchId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      result: query.result,
    };

    const { data, total } = await this.repo.findMany(filters, pagination);
    const mapped = data.map(mapToApiAuditEntry);
    return buildPaginatedResponse(mapped, total, pagination.page, pagination.pageSize);
  }

  /**
   * Get all audit entries for a specific batch ID.
   * Used to inspect all entries from a single CSV bulk import.
   */
  async getByBatchId(batchId: string): Promise<AuditLogEntry[]> {
    const entries = await this.repo.findByBatchId(batchId);
    return entries.map(mapToApiAuditEntry);
  }
}
