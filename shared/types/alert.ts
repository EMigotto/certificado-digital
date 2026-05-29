/**
 * Expiration alert and notification domain types.
 *
 * These are the API-level representations (dates as ISO-8601 strings).
 * The Prisma model uses native Date objects; conversion happens at the API boundary.
 */

// ─── Enums / Unions ────────────────────────────────────────────────────────

/** Alert lifecycle status */
export type AlertStatus = 'PENDING' | 'NOTIFIED' | 'FAILED' | 'ACKNOWLEDGED';

/** Notification delivery channel */
export type NotificationChannel = 'email' | 'webhook';

/** Outcome of a single notification delivery attempt */
export type NotificationStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED';

// ─── Alert ─────────────────────────────────────────────────────────────────

/** Full expiration alert record, matching the Prisma model */
export interface ExpirationAlert {
  id: string;

  /** Related certificate ID */
  certificateId: string;

  /** Threshold in days that triggered this alert (e.g. 90, 30, 7, 1) */
  threshold: number;

  /** When the alert was generated (ISO-8601) */
  triggeredAt: string;

  /** Current lifecycle status */
  status: AlertStatus;

  // ── Snapshot fields (frozen at alert creation time) ──

  /** Certificate common name at time of alert */
  certificateCn: string;

  /** Certificate SANs at time of alert */
  certificateSans: string[];

  /** Days remaining until expiry when the alert was raised */
  daysUntilExpiryAtAlert: number;

  /** Certificate authority name */
  caName: string;

  /** Certificate owner */
  owner: string;

  /** Zone identifier */
  zone: string | null;

  /** Deployment environment */
  environment: string;

  // ── Acknowledgement ──

  /** When the alert was acknowledged (ISO-8601, null if not yet) */
  acknowledgedAt: string | null;

  /** Who acknowledged the alert (null if not yet) */
  acknowledgedBy: string | null;

  // ── System timestamps ──

  /** Record creation timestamp (ISO-8601) */
  createdAt: string;

  /** Record last-update timestamp (ISO-8601) */
  updatedAt: string;
}

// ─── Notification Record ───────────────────────────────────────────────────

/** Immutable record of a single notification delivery attempt */
export interface NotificationRecord {
  id: string;

  /** Parent alert ID */
  alertId: string;

  /** Delivery channel used */
  channel: NotificationChannel;

  /** When the notification was sent (ISO-8601) */
  sentAt: string;

  /** Delivery outcome */
  status: NotificationStatus;

  /** Error details if delivery failed (null on success) */
  errorMessage: string | null;

  /** Webhook endpoint ID used for delivery (null for email) */
  webhookId: string | null;

  /** 1-based attempt counter for retries */
  attemptNumber: number;
}

// ─── Mutation / Query Payloads ─────────────────────────────────────────────

/** Payload for creating a new expiration alert (system fields omitted) */
export type ExpirationAlertCreate = Omit<
  ExpirationAlert,
  'id' | 'status' | 'acknowledgedAt' | 'acknowledgedBy' | 'createdAt' | 'updatedAt'
>;

/** Query parameters for listing / filtering expiration alerts */
export interface ExpirationAlertListParams {
  /** 1-based page number */
  page?: number;

  /** Items per page (max 100) */
  pageSize?: number;

  /** Filter by alert status */
  status?: AlertStatus;

  /** Filter by threshold value (days) */
  threshold?: number;

  /** Filter by related certificate ID */
  certificateId?: string;
}
