import type { ExpirationAlert, NotificationRecord } from '@prisma/client';
import type { PaginatedResponse } from '@certificado-digital/shared';
import {
  AlertRepository,
  type AlertFilters,
  type AlertWithNotifications,
} from '../repositories/alertRepo.js';
import { parsePaginationParams, buildPaginatedResponse } from '../utils/pagination.js';

// ─── Query param types ───────────────────────────────────────────────────────

export interface ListAlertsQuery {
  page?: string;
  pageSize?: string;
  status?: string;
  threshold?: string;
  certificateId?: string;
  dateFrom?: string;
  dateTo?: string;
}

// ─── API response types ─────────────────────────────────────────────────────

/** Alert as returned by the API (ISO-8601 date strings) */
export interface AlertResponse {
  id: string;
  certificateId: string;
  threshold: number;
  triggeredAt: string;
  status: string;
  certificateCn: string;
  certificateSans: string[];
  daysUntilExpiryAtAlert: number;
  caName: string;
  owner: string;
  zone: string | null;
  environment: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Alert detail with notification records */
export interface AlertDetailResponse extends AlertResponse {
  notifications: NotificationResponse[];
}

/** Notification record as returned by the API */
export interface NotificationResponse {
  id: string;
  alertId: string;
  channel: string;
  sentAt: string;
  status: string;
  errorMessage: string | null;
  webhookId: string | null;
  attemptNumber: number;
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

/**
 * Map Prisma ExpirationAlert to API response format.
 */
export function mapAlertToResponse(alert: ExpirationAlert): AlertResponse {
  return {
    id: alert.id,
    certificateId: alert.certificateId,
    threshold: alert.threshold,
    triggeredAt: alert.triggeredAt.toISOString(),
    status: alert.status,
    certificateCn: alert.certificateCn,
    certificateSans: alert.certificateSans,
    daysUntilExpiryAtAlert: alert.daysUntilExpiryAtAlert,
    caName: alert.caName,
    owner: alert.owner,
    zone: alert.zone,
    environment: alert.environment,
    acknowledgedAt: alert.acknowledgedAt?.toISOString() ?? null,
    acknowledgedBy: alert.acknowledgedBy ?? null,
    createdAt: alert.createdAt.toISOString(),
    updatedAt: alert.updatedAt.toISOString(),
  };
}

/**
 * Map Prisma NotificationRecord to API response format.
 */
export function mapNotificationToResponse(notification: NotificationRecord): NotificationResponse {
  return {
    id: notification.id,
    alertId: notification.alertId,
    channel: notification.channel,
    sentAt: notification.sentAt.toISOString(),
    status: notification.status,
    errorMessage: notification.errorMessage,
    webhookId: notification.webhookId,
    attemptNumber: notification.attemptNumber,
  };
}

/**
 * Map alert with notifications to detail response.
 */
export function mapAlertToDetailResponse(alert: AlertWithNotifications): AlertDetailResponse {
  return {
    ...mapAlertToResponse(alert),
    notifications: alert.notifications.map(mapNotificationToResponse),
  };
}

// ─── Service class ───────────────────────────────────────────────────────────

export class AlertService {
  constructor(private readonly repo: AlertRepository) {}

  /**
   * List alerts with filters and pagination.
   */
  async listAlerts(
    query: ListAlertsQuery,
  ): Promise<PaginatedResponse<AlertResponse>> {
    // Parse pagination
    const pagination = parsePaginationParams({
      page: query.page,
      pageSize: query.pageSize,
    });

    // Build filters with validation
    const filters: AlertFilters = {
      status: query.status,
      certificateId: query.certificateId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    };

    // Parse threshold if provided
    if (query.threshold) {
      const parsed = parseInt(query.threshold, 10);
      if (!isNaN(parsed) && parsed > 0) {
        filters.threshold = parsed;
      }
    }

    const { data, total } = await this.repo.findAll(filters, pagination);
    const mapped = data.map(mapAlertToResponse);
    return buildPaginatedResponse(mapped, total, pagination.page, pagination.pageSize);
  }

  /**
   * Get a single alert by ID with its notification records.
   * Returns null if not found.
   */
  async getAlert(id: string): Promise<AlertDetailResponse | null> {
    const alert = await this.repo.findById(id);
    if (!alert) return null;
    return mapAlertToDetailResponse(alert);
  }

  /**
   * Acknowledge an alert.
   *
   * Business rules:
   * - Alert must exist
   * - Alert must not already be acknowledged
   * - Actor is required
   *
   * Returns the updated alert or null if not found.
   * Throws if the alert is already acknowledged.
   */
  async acknowledgeAlert(
    id: string,
    actor: string,
  ): Promise<AlertResponse> {
    // Validate actor
    if (!actor || !actor.trim()) {
      throw new AlertServiceError('Actor is required to acknowledge an alert', 400);
    }

    // Fetch current alert
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new AlertServiceError(`Alert with id "${id}" not found`, 404);
    }

    // Check if already acknowledged
    if (existing.status === 'ACKNOWLEDGED') {
      throw new AlertServiceError(
        `Alert "${id}" is already acknowledged by ${existing.acknowledgedBy ?? 'unknown'} at ${existing.acknowledgedAt?.toISOString() ?? 'unknown'}`,
        409,
      );
    }

    const updated = await this.repo.acknowledge(id, actor.trim());
    return mapAlertToResponse(updated);
  }

  /**
   * Get all alerts for a specific certificate.
   * Used by the certificate detail page.
   */
  async getAlertsByCertificate(certificateId: string): Promise<AlertResponse[]> {
    const alerts = await this.repo.findByCertificateId(certificateId);
    return alerts.map(mapAlertToResponse);
  }
}

// ─── Service error class ─────────────────────────────────────────────────────

export class AlertServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'AlertServiceError';
  }
}
