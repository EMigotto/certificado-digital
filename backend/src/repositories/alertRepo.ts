import { Prisma, type PrismaClient, type ExpirationAlert, type NotificationRecord } from '@prisma/client';
import type { PaginationParams } from '../utils/pagination.js';

// ─── Filter types ────────────────────────────────────────────────────────────

export interface AlertFilters {
  /** Filter by alert status (PENDING, NOTIFIED, FAILED, ACKNOWLEDGED) */
  status?: string;
  /** Filter by threshold value (exact match) */
  threshold?: number;
  /** Filter by certificate ID */
  certificateId?: string;
  /** Filter alerts triggered from this date (inclusive, ISO-8601) */
  dateFrom?: string;
  /** Filter alerts triggered up to this date (inclusive, ISO-8601) */
  dateTo?: string;
}

// ─── Types for create/upsert ─────────────────────────────────────────────────

export interface CreateAlertData {
  certificateId: string;
  threshold: number;
  triggeredAt: Date;
  status?: 'PENDING' | 'NOTIFIED' | 'FAILED' | 'ACKNOWLEDGED';
  certificateCn: string;
  certificateSans?: string[];
  daysUntilExpiryAtAlert: number;
  caName: string;
  owner: string;
  zone?: string | null;
  environment?: string | null;
}

export interface CreateNotificationData {
  alertId: string;
  channel: 'EMAIL' | 'WEBHOOK';
  sentAt: Date;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  errorMessage?: string | null;
  webhookId?: string | null;
  attemptNumber: number;
}

/** ExpirationAlert with its notification records included */
export type AlertWithNotifications = ExpirationAlert & {
  notifications: NotificationRecord[];
};

// ─── Repository class ────────────────────────────────────────────────────────

export class AlertRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Build Prisma `where` clause from alert filters.
   */
  buildWhereClause(filters: AlertFilters): Prisma.ExpirationAlertWhereInput {
    const conditions: Prisma.ExpirationAlertWhereInput[] = [];

    // Status filter
    if (filters.status) {
      const validStatuses = ['PENDING', 'NOTIFIED', 'FAILED', 'ACKNOWLEDGED'];
      const status = filters.status.toUpperCase();
      if (validStatuses.includes(status)) {
        conditions.push({ status: status as Prisma.EnumAlertStatusFilter['equals'] });
      }
    }

    // Threshold filter (exact match)
    if (filters.threshold !== undefined && filters.threshold !== null) {
      conditions.push({ threshold: filters.threshold });
    }

    // Certificate ID filter (exact match)
    if (filters.certificateId && filters.certificateId.trim()) {
      conditions.push({ certificateId: filters.certificateId.trim() });
    }

    // Date range filters (on triggeredAt)
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom);
      if (!isNaN(from.getTime())) {
        conditions.push({ triggeredAt: { gte: from } });
      }
    }

    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      if (!isNaN(to.getTime())) {
        // Include the entire day by setting to end of day
        to.setHours(23, 59, 59, 999);
        conditions.push({ triggeredAt: { lte: to } });
      }
    }

    if (conditions.length === 0) return {};
    if (conditions.length === 1) return conditions[0];
    return { AND: conditions };
  }

  /**
   * Paginated listing of alerts with filters.
   * Default sort: triggeredAt DESC (most recent first).
   */
  async findAll(
    filters: AlertFilters,
    pagination: PaginationParams,
  ): Promise<{ data: ExpirationAlert[]; total: number }> {
    const where = this.buildWhereClause(filters);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.expirationAlert.findMany({
        where,
        orderBy: { triggeredAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.expirationAlert.count({ where }),
    ]);

    return { data, total };
  }

  /**
   * Single alert by ID, including notification records.
   */
  async findById(id: string): Promise<AlertWithNotifications | null> {
    return this.prisma.expirationAlert.findUnique({
      where: { id },
      include: { notifications: { orderBy: { sentAt: 'desc' } } },
    });
  }

  /**
   * Dedup check: find alert by certificate ID + threshold combination.
   * Uses the unique constraint uq_alert_cert_threshold.
   */
  async findByCertificateAndThreshold(
    certificateId: string,
    threshold: number,
  ): Promise<ExpirationAlert | null> {
    return this.prisma.expirationAlert.findUnique({
      where: {
        uq_alert_cert_threshold: {
          certificateId,
          threshold,
        },
      },
    });
  }

  /**
   * Create a new alert record.
   */
  async create(data: CreateAlertData): Promise<ExpirationAlert> {
    return this.prisma.expirationAlert.create({
      data: {
        certificateId: data.certificateId,
        threshold: data.threshold,
        triggeredAt: data.triggeredAt,
        status: data.status ?? 'PENDING',
        certificateCn: data.certificateCn,
        certificateSans: data.certificateSans ?? [],
        daysUntilExpiryAtAlert: data.daysUntilExpiryAtAlert,
        caName: data.caName,
        owner: data.owner,
        zone: data.zone ?? null,
        environment: data.environment ?? null,
      },
    });
  }

  /**
   * Idempotent upsert: create alert if not exists, update if it does.
   * Uses the unique constraint on (certificateId, threshold).
   * Guarantees idempotency for concurrent scheduler runs (AC 5.2).
   */
  async upsertAlert(
    certificateId: string,
    threshold: number,
    data: Omit<CreateAlertData, 'certificateId' | 'threshold'>,
  ): Promise<ExpirationAlert> {
    return this.prisma.expirationAlert.upsert({
      where: {
        uq_alert_cert_threshold: {
          certificateId,
          threshold,
        },
      },
      create: {
        certificateId,
        threshold,
        triggeredAt: data.triggeredAt,
        status: data.status ?? 'PENDING',
        certificateCn: data.certificateCn,
        certificateSans: data.certificateSans ?? [],
        daysUntilExpiryAtAlert: data.daysUntilExpiryAtAlert,
        caName: data.caName,
        owner: data.owner,
        zone: data.zone ?? null,
        environment: data.environment ?? null,
      },
      update: {
        triggeredAt: data.triggeredAt,
        status: data.status ?? 'PENDING',
        certificateCn: data.certificateCn,
        certificateSans: data.certificateSans ?? [],
        daysUntilExpiryAtAlert: data.daysUntilExpiryAtAlert,
        caName: data.caName,
        owner: data.owner,
        zone: data.zone ?? null,
        environment: data.environment ?? null,
      },
    });
  }

  /**
   * Acknowledge an alert: set status to ACKNOWLEDGED + timestamp + actor.
   */
  async acknowledge(
    id: string,
    actor: string,
  ): Promise<ExpirationAlert> {
    return this.prisma.expirationAlert.update({
      where: { id },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date(),
        acknowledgedBy: actor,
      },
    });
  }

  /**
   * Find all alerts for a specific certificate.
   * Ordered by threshold ascending (e.g. 7, 15, 30, 60, 90).
   */
  async findByCertificateId(certificateId: string): Promise<ExpirationAlert[]> {
    return this.prisma.expirationAlert.findMany({
      where: { certificateId },
      orderBy: { threshold: 'asc' },
    });
  }

  /**
   * Create an immutable notification record (delivery log).
   */
  async createNotificationRecord(data: CreateNotificationData): Promise<NotificationRecord> {
    return this.prisma.notificationRecord.create({
      data: {
        alertId: data.alertId,
        channel: data.channel,
        sentAt: data.sentAt,
        status: data.status,
        errorMessage: data.errorMessage ?? null,
        webhookId: data.webhookId ?? null,
        attemptNumber: data.attemptNumber,
      },
    });
  }
}
