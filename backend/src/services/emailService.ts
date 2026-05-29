/**
 * Email notification dispatcher for expiration alerts.
 *
 * Responsibilities:
 * - Send alert emails to certificate owners via Nodemailer
 * - Respect policy.emailEnabled flag (skip when disabled)
 * - Include additional CC recipients from policy
 * - Retry on SMTP failure with exponential backoff (3 attempts)
 * - Log every delivery attempt as an immutable NotificationRecord
 *
 * @see Issue #51 — [backend] Email notification dispatcher
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import type { ExpirationAlert, ExpirationPolicy } from '@prisma/client';
import { AlertRepository, type CreateNotificationData } from '../repositories/alertRepo.js';
import {
  buildAlertEmailHtml,
  buildAlertEmailText,
  buildAlertSubject,
  type AlertEmailData,
} from '../templates/alertEmail.js';
import { config } from '../config.js';

// ─── Logger interface (duck-typed for pino / console) ──────────────────────

export interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

// ─── Retry defaults ────────────────────────────────────────────────────────

/** Default backoff intervals in milliseconds: 1 s → 5 s → 30 s */
const DEFAULT_BACKOFF_MS = [1_000, 5_000, 30_000];

/** Maximum retry attempts (inclusive of the first try) */
const DEFAULT_MAX_RETRIES = 3;

// ─── Mail options type ─────────────────────────────────────────────────────

export interface MailOptions {
  to: string;
  cc?: string;
  subject: string;
  html: string;
  text: string;
}

// ─── Send result ───────────────────────────────────────────────────────────

export interface SendResult {
  success: boolean;
  attempts: number;
  errorMessage?: string;
}

// ─── Service ───────────────────────────────────────────────────────────────

export class EmailNotificationService {
  private readonly transporter: Transporter<SMTPTransport.SentMessageInfo>;
  private readonly fromAddress: string;
  private readonly fromName: string;
  private readonly logger: Logger;
  private readonly backoffMs: number[];
  private readonly maxRetries: number;

  constructor(
    private readonly alertRepo: AlertRepository,
    options?: {
      logger?: Logger;
      /** Override transporter for testing */
      transporter?: Transporter<SMTPTransport.SentMessageInfo>;
      backoffMs?: number[];
      maxRetries?: number;
    },
  ) {
    this.logger = options?.logger ?? console;
    this.fromAddress = config.SMTP_FROM_ADDRESS;
    this.fromName = config.SMTP_FROM_NAME;
    this.backoffMs = options?.backoffMs ?? DEFAULT_BACKOFF_MS;
    this.maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;

    if (options?.transporter) {
      this.transporter = options.transporter;
    } else {
      this.transporter = nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: config.SMTP_PORT === 465,
        auth:
          config.SMTP_USER && config.SMTP_PASSWORD
            ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD }
            : undefined,
      });
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Send an alert email respecting the policy configuration.
   *
   * 1. If `policy.emailEnabled` is false → create SKIPPED record and return.
   * 2. Build HTML + text email from template.
   * 3. Set TO = owner email; CC = `policy.emailRecipientsAdditional`.
   * 4. Send via Nodemailer with retry.
   * 5. Create NotificationRecord with outcome.
   *
   * @returns The delivery result (success, attempts, optional error).
   */
  async sendAlertEmail(
    alert: ExpirationAlert,
    policy: ExpirationPolicy,
  ): Promise<SendResult> {
    // Check policy gate
    if (!policy.emailEnabled) {
      this.logger.info(
        `Email disabled by policy "${policy.name}" — skipping alert ${alert.id}`,
      );

      await this.createRecord(alert.id, 'SKIPPED', 1, null);
      return { success: true, attempts: 0 };
    }

    // Build template data
    const templateData = this.buildTemplateData(alert);

    // Build mail options
    const subject = buildAlertSubject(templateData, policy.emailSubjectPrefix);
    const mailOptions: MailOptions = {
      to: alert.owner,
      cc: policy.emailRecipientsAdditional ?? undefined,
      subject,
      html: buildAlertEmailHtml(templateData),
      text: buildAlertEmailText(templateData),
    };

    // Send with retry
    const result = await this.sendWithRetry(mailOptions);

    // Persist notification record
    await this.createRecord(
      alert.id,
      result.success ? 'SUCCESS' : 'FAILED',
      result.attempts,
      result.errorMessage ?? null,
    );

    return result;
  }

  /**
   * Send an email with exponential-backoff retries.
   *
   * Backoff schedule: 1 s → 5 s → 30 s (configurable).
   * On persistent failure the last error message is captured.
   *
   * @returns SendResult with success flag, attempt count, and optional error.
   */
  async sendWithRetry(
    mailOptions: MailOptions,
    maxRetries?: number,
  ): Promise<SendResult> {
    const max = maxRetries ?? this.maxRetries;
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= max; attempt++) {
      try {
        this.logger.info(
          `Sending email (attempt ${attempt}/${max}) to=${mailOptions.to}`,
        );

        await this.transporter.sendMail({
          from: `"${this.fromName}" <${this.fromAddress}>`,
          to: mailOptions.to,
          cc: mailOptions.cc,
          subject: mailOptions.subject,
          html: mailOptions.html,
          text: mailOptions.text,
        });

        this.logger.info(
          `Email sent successfully on attempt ${attempt} to=${mailOptions.to}`,
        );

        return { success: true, attempts: attempt };
      } catch (err: unknown) {
        const errMsg =
          err instanceof Error ? err.message : String(err);

        this.logger.warn(
          `Email send attempt ${attempt}/${max} failed: ${errMsg}`,
        );

        lastError = errMsg;

        // Wait before retry (skip wait after last attempt)
        if (attempt < max) {
          const delay = this.backoffMs[attempt - 1] ?? this.backoffMs[this.backoffMs.length - 1];
          await this.sleep(delay);
        }
      }
    }

    this.logger.error(
      `Email delivery failed after ${max} attempts to=${mailOptions.to}: ${lastError}`,
    );

    return { success: false, attempts: max, errorMessage: lastError };
  }

  /**
   * Verify SMTP connectivity on startup.
   *
   * @throws If the SMTP server is unreachable or credentials are invalid.
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      this.logger.info('SMTP connection verified successfully');
      return true;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`SMTP connection test failed: ${errMsg}`);
      return false;
    }
  }

  // ── Internal helpers ───────────────────────────────────────────────────

  /**
   * Map an ExpirationAlert Prisma model to the template data shape.
   */
  private buildTemplateData(alert: ExpirationAlert): AlertEmailData {
    // Compute the original expiry date from the alert snapshot:
    // triggeredAt + daysUntilExpiryAtAlert
    const expiryDate = new Date(alert.triggeredAt);
    expiryDate.setDate(expiryDate.getDate() + alert.daysUntilExpiryAtAlert);

    return {
      certificateCn: alert.certificateCn,
      owner: alert.owner,
      expiryDate: expiryDate.toISOString(),
      daysUntilExpiry: alert.daysUntilExpiryAtAlert,
      caName: alert.caName,
      zone: alert.zone,
      environment: alert.environment,
      sans: alert.certificateSans,
      threshold: alert.threshold,
    };
  }

  /**
   * Create an immutable notification delivery record.
   */
  private async createRecord(
    alertId: string,
    status: 'SUCCESS' | 'FAILED' | 'SKIPPED',
    attemptNumber: number,
    errorMessage: string | null,
  ): Promise<void> {
    const data: CreateNotificationData = {
      alertId,
      channel: 'EMAIL',
      sentAt: new Date(),
      status,
      errorMessage,
      attemptNumber,
    };

    await this.alertRepo.createNotificationRecord(data);
  }

  /**
   * Async sleep helper (extracted for testability).
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
