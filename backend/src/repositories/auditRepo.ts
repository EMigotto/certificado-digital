import { Prisma, type PrismaClient, type AuditEntry } from '@prisma/client';
import type { PaginationParams } from '../utils/pagination.js';

// ─── Filter types ────────────────────────────────────────────────────────────

export interface AuditFilters {
  /** Filter by action type (CREATE, UPDATE, DELETE, REVOKE) */
  action?: string;
  /** Filter by actor name */
  actor?: string;
  /** Filter by certificate ID */
  certificateId?: string;
  /** Filter by batch ID (searched in detail field) */
  batchId?: string;
  /** Filter entries from this date (inclusive, ISO-8601) */
  dateFrom?: string;
  /** Filter entries up to this date (inclusive, ISO-8601) */
  dateTo?: string;
  /** Filter by result (SUCCESS, FAILURE) */
  result?: string;
}

// ─── Repository class ────────────────────────────────────────────────────────

export class AuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Build Prisma `where` clause from audit filters.
   */
  buildWhereClause(filters: AuditFilters): Prisma.AuditEntryWhereInput {
    const conditions: Prisma.AuditEntryWhereInput[] = [];

    // Action filter
    if (filters.action) {
      const validActions = ['CREATE', 'UPDATE', 'DELETE', 'REVOKE'];
      const action = filters.action.toUpperCase();
      if (validActions.includes(action)) {
        conditions.push({ action: action as Prisma.EnumAuditActionFilter['equals'] });
      }
    }

    // Actor filter (case-insensitive contains)
    if (filters.actor && filters.actor.trim()) {
      conditions.push({ actor: { contains: filters.actor.trim(), mode: 'insensitive' } });
    }

    // Certificate ID filter (exact match)
    if (filters.certificateId && filters.certificateId.trim()) {
      conditions.push({ certificateId: filters.certificateId.trim() });
    }

    // Batch ID filter — batchId is embedded in the detail field
    if (filters.batchId && filters.batchId.trim()) {
      conditions.push({ detail: { contains: filters.batchId.trim() } });
    }

    // Date range filters
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom);
      if (!isNaN(from.getTime())) {
        conditions.push({ timestamp: { gte: from } });
      }
    }

    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      if (!isNaN(to.getTime())) {
        // Include the entire day by setting to end of day
        to.setHours(23, 59, 59, 999);
        conditions.push({ timestamp: { lte: to } });
      }
    }

    // Result filter
    if (filters.result) {
      const validResults = ['SUCCESS', 'FAILURE'];
      const result = filters.result.toUpperCase();
      if (validResults.includes(result)) {
        conditions.push({ result: result as Prisma.EnumAuditResultFilter['equals'] });
      }
    }

    if (conditions.length === 0) return {};
    if (conditions.length === 1) return conditions[0];
    return { AND: conditions };
  }

  /**
   * Fetch paginated audit log entries with filters.
   * Default sort: timestamp DESC (most recent first).
   */
  async findMany(
    filters: AuditFilters,
    pagination: PaginationParams,
  ): Promise<{ data: AuditEntry[]; total: number }> {
    const where = this.buildWhereClause(filters);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditEntry.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.auditEntry.count({ where }),
    ]);

    return { data, total };
  }

  /**
   * Find all audit log entries for a given batch ID.
   * Batch ID is stored in the detail field.
   */
  async findByBatchId(batchId: string): Promise<AuditEntry[]> {
    return this.prisma.auditEntry.findMany({
      where: { detail: { contains: batchId } },
      orderBy: { timestamp: 'desc' },
    });
  }

  /**
   * Create an immutable audit log entry.
   * This is the ONLY write operation exposed — no update or delete.
   */
  async create(entry: {
    certificateId: string | null;
    certCn: string;
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'REVOKE' | 'IMPORT' | 'EXPORT';
    actor: string;
    result: 'SUCCESS' | 'FAILURE';
    detail: string;
  }): Promise<AuditEntry> {
    return this.prisma.auditEntry.create({ data: entry });
  }
}
