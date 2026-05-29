/**
 * Webhook Notification Dispatcher
 *
 * Dispatches alert payloads to configured HTTP webhook endpoints
 * with retry support and configurable timeout.
 *
 * Acceptance Criteria:
 *  AC 3.1 — Webhook POST sent to configured endpoint with correct JSON payload
 *  AC 3.2 — Retry with exponential backoff on 4xx/5xx responses (1s, 5s, 30s)
 *  AC 3.3 — Request times out after configured seconds
 *  AC 3.4 — Webhook skipped when isActive=false
 *  AC SLA — Webhook is part of the notification chain within 24-hour SLA
 */

import type { ExpirationAlert, ExpirationWebhook } from '@prisma/client';
import type { AlertRepository, CreateNotificationData } from '../repositories/alertRepo.js';
import { config } from '../config.js';

// ─── Logger interface ──────────────────────────────────────────────────────

export interface WebhookLogger {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

/** Default console-based logger */
const defaultLogger: WebhookLogger = {
  info: (msg, data) => console.log(`[webhook] ${msg}`, data ?? ''),
  warn: (msg, data) => console.warn(`[webhook] ${msg}`, data ?? ''),
  error: (msg, data) => console.error(`[webhook] ${msg}`, data ?? ''),
};

// ─── Payload types ─────────────────────────────────────────────────────────

/** JSON payload sent to webhook endpoints per PRD spec */
export interface WebhookPayload {
  alert_id: string;
  timestamp: string;
  event: string;
  threshold_days: number;
  certificate: {
    id: string;
    common_name: string;
    sans: string[];
    days_until_expiry: number;
    ca_name: string;
    owner: string;
    zone: string | null;
    environment: string | null;
  };
}

/** Result of a single dispatch attempt */
export interface DispatchResult {
  success: boolean;
  statusCode?: number;
  errorMessage?: string;
  attemptNumber: number;
}

// ─── Retry delay strategies ────────────────────────────────────────────────

/** Exponential backoff delays in milliseconds: 1s, 5s, 30s */
const EXPONENTIAL_DELAYS_MS = [1_000, 5_000, 30_000];

/**
 * Return the delay in ms for the given retry attempt (0-based).
 * Falls back to the last value for attempts beyond array length.
 */
export function getRetryDelay(attempt: number, _strategy?: string | null): number {
  // Only exponential strategy is supported; it's also the default.
  const delays = EXPONENTIAL_DELAYS_MS;
  return delays[Math.min(attempt, delays.length - 1)];
}

// ─── HTTP dispatcher (extracted for testability) ───────────────────────────

export type HttpDispatchFn = (
  url: string,
  options: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<{ ok: boolean; status: number; statusText: string }>;

/**
 * Default HTTP dispatcher using native fetch.
 */
export const defaultHttpDispatch: HttpDispatchFn = async (url, options) => {
  const response = await fetch(url, options);
  return { ok: response.ok, status: response.status, statusText: response.statusText };
};

// ─── Service class ─────────────────────────────────────────────────────────

export class WebhookNotificationService {
  private readonly logger: WebhookLogger;
  private readonly httpDispatch: HttpDispatchFn;

  constructor(
    private readonly alertRepo: AlertRepository,
    options?: {
      logger?: WebhookLogger;
      httpDispatch?: HttpDispatchFn;
    },
  ) {
    this.logger = options?.logger ?? defaultLogger;
    this.httpDispatch = options?.httpDispatch ?? defaultHttpDispatch;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Build the JSON payload for a webhook POST per PRD spec.
   */
  buildPayload(alert: ExpirationAlert): WebhookPayload {
    return {
      alert_id: alert.id,
      timestamp: alert.triggeredAt.toISOString(),
      event: 'certificate.expiring',
      threshold_days: alert.threshold,
      certificate: {
        id: alert.certificateId,
        common_name: alert.certificateCn,
        sans: alert.certificateSans,
        days_until_expiry: alert.daysUntilExpiryAtAlert,
        ca_name: alert.caName,
        owner: alert.owner,
        zone: alert.zone,
        environment: alert.environment,
      },
    };
  }

  /**
   * Dispatch a single webhook POST (no retries).
   *
   * - If the webhook is inactive, logs a SKIPPED NotificationRecord and returns.
   * - Builds the JSON payload and sends an HTTP POST with custom headers.
   * - Applies timeout from webhook config (falls back to env default).
   * - On success (2xx): creates a SUCCESS NotificationRecord.
   * - On failure (non-2xx or network error): returns the error; does NOT
   *   create a notification record (that is handled by dispatchWithRetry).
   */
  async dispatchWebhook(
    alert: ExpirationAlert,
    webhook: ExpirationWebhook,
    attemptNumber = 1,
  ): Promise<DispatchResult> {
    // AC 3.4 — Skip inactive webhooks
    if (!webhook.isActive) {
      this.logger.info('Webhook is inactive, skipping', {
        webhookId: webhook.id,
        alertId: alert.id,
      });

      await this.recordNotification({
        alertId: alert.id,
        channel: 'WEBHOOK',
        sentAt: new Date(),
        status: 'SKIPPED',
        errorMessage: 'Webhook is inactive',
        webhookId: webhook.id,
        attemptNumber,
      });

      return { success: false, errorMessage: 'Webhook is inactive', attemptNumber };
    }

    // Build payload (AC 3.1)
    const payload = this.buildPayload(alert);
    const body = JSON.stringify(payload);

    // Merge custom headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(webhook.headers as Record<string, string>),
    };

    // AC 3.3 — Timeout
    const timeoutMs = (webhook.timeoutSeconds ?? config.WEBHOOK_TIMEOUT_MS / 1_000) * 1_000;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await this.httpDispatch(webhook.url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutHandle);

      if (response.ok) {
        this.logger.info('Webhook dispatched successfully', {
          webhookId: webhook.id,
          alertId: alert.id,
          statusCode: response.status,
        });

        return { success: true, statusCode: response.status, attemptNumber };
      }

      // Non-2xx response → failure
      const errorMsg = `HTTP ${response.status} ${response.statusText}`;
      this.logger.warn('Webhook dispatch received non-2xx response', {
        webhookId: webhook.id,
        alertId: alert.id,
        statusCode: response.status,
      });

      return { success: false, statusCode: response.status, errorMessage: errorMsg, attemptNumber };
    } catch (err: unknown) {
      clearTimeout(timeoutHandle);

      const isTimeout =
        err instanceof DOMException && err.name === 'AbortError';
      const errorMsg = isTimeout
        ? `Request timed out after ${timeoutMs}ms`
        : err instanceof Error
          ? err.message
          : 'Unknown error';

      this.logger.warn('Webhook dispatch failed', {
        webhookId: webhook.id,
        alertId: alert.id,
        error: errorMsg,
        isTimeout,
      });

      return { success: false, errorMessage: errorMsg, attemptNumber };
    }
  }

  /**
   * Dispatch a webhook with retry logic (AC 3.2).
   *
   * Strategy: exponential backoff with delays 1s, 5s, 30s.
   * Max attempts: webhook.maxRetries (default from env WEBHOOK_MAX_RETRIES).
   *
   * On each failure: logs attempt number, error, and next retry delay.
   * On final failure: creates a FAILED NotificationRecord.
   * On success: creates a SUCCESS NotificationRecord.
   */
  async dispatchWithRetry(
    alert: ExpirationAlert,
    webhook: ExpirationWebhook,
  ): Promise<DispatchResult> {
    // AC 3.4 — short-circuit for inactive webhooks
    if (!webhook.isActive) {
      return this.dispatchWebhook(alert, webhook, 1);
    }

    const maxRetries = webhook.maxRetries ?? config.WEBHOOK_MAX_RETRIES;
    const totalAttempts = 1 + maxRetries; // first attempt + retries

    let lastResult: DispatchResult | undefined;

    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      lastResult = await this.dispatchWebhook(alert, webhook, attempt);

      if (lastResult.success) {
        // Record success
        await this.recordNotification({
          alertId: alert.id,
          channel: 'WEBHOOK',
          sentAt: new Date(),
          status: 'SUCCESS',
          webhookId: webhook.id,
          attemptNumber: attempt,
        });
        return lastResult;
      }

      // Log failure details
      const isLastAttempt = attempt >= totalAttempts;

      if (!isLastAttempt) {
        const delay = getRetryDelay(attempt - 1, webhook.retryStrategy);
        this.logger.warn('Webhook dispatch failed, scheduling retry', {
          webhookId: webhook.id,
          alertId: alert.id,
          attempt,
          maxAttempts: totalAttempts,
          error: lastResult.errorMessage,
          nextRetryDelayMs: delay,
        });

        // Wait before retrying
        await this.sleep(delay);
      } else {
        this.logger.error('Webhook dispatch failed after all retries', {
          webhookId: webhook.id,
          alertId: alert.id,
          attempt,
          maxAttempts: totalAttempts,
          error: lastResult.errorMessage,
        });
      }
    }

    // All attempts exhausted — record final failure
    const errorMessage = lastResult?.errorMessage ?? 'All retry attempts exhausted';

    await this.recordNotification({
      alertId: alert.id,
      channel: 'WEBHOOK',
      sentAt: new Date(),
      status: 'FAILED',
      errorMessage,
      webhookId: webhook.id,
      attemptNumber: totalAttempts,
    });

    return lastResult ?? { success: false, errorMessage, attemptNumber: totalAttempts };
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  /**
   * Persist a notification record via the alert repository.
   */
  private async recordNotification(data: CreateNotificationData): Promise<void> {
    try {
      await this.alertRepo.createNotificationRecord(data);
    } catch (err) {
      this.logger.error('Failed to persist notification record', {
        alertId: data.alertId,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  /**
   * Wrapper around setTimeout for testability (can be overridden in tests).
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
