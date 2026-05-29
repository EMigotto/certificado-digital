/**
 * Expiration policy and webhook domain types.
 *
 * Policies define per-zone alert thresholds and notification preferences.
 * Dates are ISO-8601 strings at the API level.
 */

import type { NotificationChannel } from './alert.js';

// ─── Threshold Configuration ───────────────────────────────────────────────

/** Configuration for a single threshold tier */
export interface ThresholdConfig {
  /** Whether this threshold is active */
  enabled: boolean;

  /** Notification channels to use when this threshold fires */
  channels: NotificationChannel[];
}

/** Map of all supported threshold tiers */
export interface ThresholdsMap {
  /** 90-day warning */
  days_90: ThresholdConfig;

  /** 30-day warning */
  days_30: ThresholdConfig;

  /** 7-day critical */
  days_7: ThresholdConfig;

  /** 1-day urgent */
  days_1: ThresholdConfig;
}

// ─── Expiration Policy ─────────────────────────────────────────────────────

/** Full expiration policy record */
export interface ExpirationPolicy {
  id: string;

  /** Human-readable policy name */
  name: string;

  /** Optional description */
  description: string | null;

  /** Zone this policy applies to (null = global default) */
  zoneId: string | null;

  /** Whether this is the default policy for its zone */
  isDefault: boolean;

  /** Threshold tier configurations (JSON-encoded in DB) */
  thresholds: ThresholdsMap;

  /** Whether email notifications are enabled */
  emailEnabled: boolean;

  /** Additional email recipients (comma-separated, null if none) */
  emailRecipientsAdditional: string | null;

  /** Prefix added to email subject lines (null for default) */
  emailSubjectPrefix: string | null;

  /** User who created this policy */
  createdBy: string;

  /** User who last updated this policy (null if never updated) */
  updatedBy: string | null;

  /** Record creation timestamp (ISO-8601) */
  createdAt: string;

  /** Record last-update timestamp (ISO-8601) */
  updatedAt: string;
}

// ─── Webhook ───────────────────────────────────────────────────────────────

/** Webhook endpoint configuration for a policy */
export interface ExpirationWebhook {
  id: string;

  /** Parent policy ID */
  policyId: string;

  /** Webhook endpoint URL */
  url: string;

  /** Custom HTTP headers sent with webhook requests */
  headers: Record<string, string>;

  /** Retry strategy identifier (e.g. "exponential", null for default) */
  retryStrategy: string | null;

  /** Maximum number of delivery retries */
  maxRetries: number;

  /** Request timeout in seconds */
  timeoutSeconds: number;

  /** Whether this webhook is active */
  isActive: boolean;

  /** Result of the last connectivity test (null if never tested) */
  testResult: string | null;

  /** When the endpoint was last tested (ISO-8601, null if never) */
  lastTestAt: string | null;

  /** Record creation timestamp (ISO-8601) */
  createdAt: string;

  /** Record last-update timestamp (ISO-8601) */
  updatedAt: string;
}

// ─── Mutation Payloads ─────────────────────────────────────────────────────

/** Payload for creating a new expiration policy (system fields omitted) */
export type PolicyCreate = Omit<
  ExpirationPolicy,
  'id' | 'updatedBy' | 'createdAt' | 'updatedAt'
>;

/** Payload for updating an existing expiration policy (all fields optional) */
export type PolicyUpdate = Partial<Omit<PolicyCreate, 'createdBy'>>;
