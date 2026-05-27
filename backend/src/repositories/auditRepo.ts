/**
 * Audit log repository — Prisma queries on audit_logs table.
 *
 * This repository enforces immutability: only INSERT and SELECT operations
 * are exposed. No UPDATE or DELETE operations are available.
 */

import { Prisma, type PrismaClient, type AuditLog } from '@prisma/client';
import type { PaginationParams } from '../utils/pagination.js';

// ─── Filter types ────────────────────────────────────────────────────────────

export interface AuditFilters {
  /** Filter by audit action (CREATE, UPDATE, DELETE, REVOKE) */
  action?: string;
  /** Filter by actor (case-insensitive contains) */
  actor?: string;
  /** Filter by certificate ID (exact match) */
  certificateId?: string;
  /** Filter by batch ID (exact match on batchId column) */
  batchId?: string;
  /** Filter entries from this date (inclusive, ISO-8601) */
  dateFrom?: string;
  /** Filter entries to this date (inclusive, ISO-8601) */
  dateTo?: string;
  /** Filter by result (SUCCESS, FAILURE) */
  result?: string;
}

// ─── Create entry types ──────────────────────────────────────────────────────

export interface CreateAuditLogEntry {
  certId: string | null;
  certCn: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'REVOKE';
  actor: string;
  result: 'SUCCESS' | 'FAILURE';
  detail: string;
  batchId?: string | null;
}

// ─── Repository class ────────────────────────────────────────────────────────

export class AuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Build Prisma `where` clause from audit log filters.
   */
  buildWhereClause(filters: AuditFilters): Prisma.AuditLogWhereInput {
    const conditions: Prisma.AuditLogWhereInput[] = [];

    // Action filter (single value, e.g. "CREATE")
    if (filters.action) {
      const validActions = ['CREATE', 'UPDATE', 'DELETE', 'REVOKE'];
      const action = filters.action.toUpperCase();
      if (validActions.includes(action)) {
        conditions.push({
          action: action as Prisma.EnumAuditActionFilter['equals'],
        });
      }
    }

    // Actor filter (case-insensitive contains)
    if (filters.actor && filters.actor.trim()) {
      conditions.push({
        actor: { contains: filters.actor.trim(), mode: 'insensitive' },
      });
    }

    // Certificate ID filter (exact match)
    if (filters.certificateId && filters.certificateId.trim()) {
      conditions.push({
        certId: filters.certificateId.trim(),
      });
    }

    // Batch ID filter (exact match on dedicated column)
    if (filters.batchId && filters.batchId.trim()) {
      conditions.push({
        batchId: filters.batchId.trim(),
      });
    }

    // Date range filters
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom);
      if (!isNaN(from.getTime())) {
        conditions.push({
          timestamp: { gte: from },
        });
      }
    }

    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      if (!isNaN(to.getTime())) {
        // Set to end of day if only a date is provided (length <= 10, e.g. "2025-06-30")
        if (filters.dateTo.length <= 10) {
          to.setUTCHours(23, 59, 59, 999);
        }
        conditions.push({
          timestamp: { lte: to },
        });
      }
    }

    // Result filter (single value: SUCCESS or FAILURE)
    if (filters.result) {
      const validResults = ['SUCCESS', 'FAILURE'];
      const result = filters.result.toUpperCase();
      if (validResults.includes(result)) {
        conditions.push({
          result: result as Prisma.EnumAuditResultFilter['equals'],
        });
      }
    }

    if (conditions.length === 0) return {};
    if (conditions.length === 1) return conditions[0];
    return { AND: conditions };
  }

  /**
   * Fetch paginated list of audit log entries with filters.
   * Always sorted by timestamp DESC (most recent first).
   */
  async findMany(
    filters: AuditFilters,
    pagination: PaginationParams,
  ): Promise<{ data: AuditLog[]; total: number }> {
    const where = this.buildWhereClause(filters);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, total };
  }

  /**
   * Find all audit entries for a given batch ID.
   * Returns entries sorted by timestamp DESC.
   */
  async findByBatchId(batchId: string): Promise<AuditLog[]> {
    return this.prisma.auditLog.findMany({
      where: { batchId },
      orderBy: { timestamp: 'desc' },
    });
  }

  /**
   * Create an immutable audit log entry.
   * This is the ONLY write operation exposed by this repository.
   */
  async create(entry: CreateAuditLogEntry): Promise<AuditLog> {
    return this.prisma.auditLog.create({
      data: {
        certId: entry.certId,
        certCn: entry.certCn,
        action: entry.action,
        actor: entry.actor,
        result: entry.result,
        detail: entry.detail,
        batchId: entry.batchId ?? null,
      },
    });
  }

  /**
   * Create an audit log entry within an existing Prisma transaction.
   * Used when the audit entry must be atomic with the mutation.
   */
  createInTransaction(
    tx: Prisma.TransactionClient,
    entry: CreateAuditLogEntry,
  ): Promise<AuditLog> {
    return tx.auditLog.create({
      data: {
        certId: entry.certId,
        certCn: entry.certCn,
        action: entry.action,
        actor: entry.actor,
        result: entry.result,
        detail: entry.detail,
        batchId: entry.batchId ?? null,
      },
    });
  }
}
