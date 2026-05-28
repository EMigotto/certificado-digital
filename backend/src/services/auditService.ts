/**
 * Audit logging service — immutable, append-only audit trail.
 *
 * Every certificate mutation (import, update, delete, revoke, export) is
 * logged in the audit_logs table. No UPDATE or DELETE operations are
 * exposed — only INSERT and SELECT.
 *
 * Sensitive data (passwords, private keys, PEM blobs) is NEVER included
 * in audit entries (NF.3).
 */

import type { AuditEntry as PrismaAuditEntry } from '@prisma/client';
import type { AuditEntry, PaginatedResponse, AuditAction, AuditResult } from '@certificado-digital/shared';
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
  actor: string;
  action: AuditAction;
  certificateId?: string | null;
  certificateCn: string;
  result: AuditResult;
  detail?: string;
  batchId?: string;
  errorReason?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Sensitive field names that must NEVER appear in audit detail */
const SENSITIVE_FIELDS = ['password', 'privateKey', 'pemData', 'pem_data', 'private_key'];

/**
 * Strip sensitive fields from an object.
 * Ensures no passwords, private keys, or PEM blobs leak into audit logs (NF.3).
 */
export function sanitizeForAudit(obj: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.includes(key)) {
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
 * Map a Prisma AuditEntry to the shared AuditEntry type (ISO timestamps).
 */
export function mapToApiAuditEntry(log: PrismaAuditEntry): AuditEntry {
  return {
    id: log.id,
    certificateId: log.certificateId,
    certCn: log.certCn,
    action: log.action as AuditAction,
    actor: log.actor,
    result: log.result as AuditResult,
    detail: log.detail,
    changes: log.changes as AuditEntry['changes'],
    timestamp: log.timestamp.toISOString(),
  };
}

// ─── Service class ───────────────────────────────────────────────────────────

export class AuditService {
  constructor(private readonly repo: AuditRepository) {}

  /**
   * Log an immutable audit entry.
   *
   * Builds a detail string from the provided params, including batch ID
   * and error reason when present. No sensitive data is included.
   *
   * FR9 (9.1): Import action logged with timestamp, actor, action, certificate, source, result.
   * FR9 (9.2): Failed import logged with result=FAILURE and error_reason.
   * FR9 (9.3): Bulk import batch tracked with shared batch_id.
   */
  async log(params: AuditLogParams): Promise<AuditEntry> {
    // Build detail string with optional batch/error context
    const parts: string[] = [];
    if (params.detail) parts.push(params.detail);
    if (params.batchId) parts.push(`batch: ${params.batchId}`);
    if (params.errorReason) parts.push(`error: ${params.errorReason}`);
    const detail = parts.join(' | ');

    const entry = await this.repo.create({
      certificateId: params.certificateId ?? null,
      certCn: params.certificateCn,
      action: params.action,
      actor: params.actor,
      result: params.result,
      detail,
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
  async getEntries(query: AuditQueryParams): Promise<PaginatedResponse<AuditEntry>> {
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
  async getByBatchId(batchId: string): Promise<AuditEntry[]> {
    const entries = await this.repo.findByBatchId(batchId);
    return entries.map(mapToApiAuditEntry);
  }
}
