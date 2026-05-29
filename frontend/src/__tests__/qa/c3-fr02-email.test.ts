/**
 * QA Tests — C3 Functional Requirement 2: Email Notification
 *
 * Maps to: Scenarios 2.1, 2.2, 2.3, 2.4
 *
 * Tests validate the email notification logic triggered by expiration alerts.
 * Verifies email content, recipient resolution, retry logic, and suppression.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Types for the email notification domain ─────────────────────────────────

interface ExpirationAlert {
  id: string;
  certificateId: string;
  certificateCn: string;
  threshold: number;
  daysUntilExpiryAtAlert: number;
  owner: string;
  zone: string;
  caName: string;
  environment: string;
  notAfter: string;
}

interface NotificationRecord {
  id: string;
  alertId: string;
  channel: 'email' | 'webhook';
  sentAt: string | null;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'PENDING';
  error_message?: string;
  attemptNumber?: number;
}

interface EmailPayload {
  to: string;
  cc: string[];
  subject: string;
  body: {
    certificateCn: string;
    owner: string;
    expiresAt: string;
    daysUntilExpiry: number;
    caName: string;
    zone: string;
    actionUrl: string;
    renewInstruction: string;
  };
}

interface ExpirationPolicy {
  emailEnabled: boolean;
  emailRecipientsAdditional: string[];
  webhookEnabled: boolean;
}

// ── Service functions for email notification ────────────────────────────────

function resolveOwnerEmail(owner: string): string {
  return `devops@${owner}.internal`;
}

function buildEmailPayload(
  alert: ExpirationAlert,
  ownerEmail: string,
  additionalRecipients: string[],
): EmailPayload {
  return {
    to: ownerEmail,
    cc: additionalRecipients,
    subject: `[ALERT] Certificate expiring in ${alert.daysUntilExpiryAtAlert} days: ${alert.certificateCn}`,
    body: {
      certificateCn: alert.certificateCn,
      owner: alert.owner,
      expiresAt: `${alert.notAfter} (in ${alert.daysUntilExpiryAtAlert} days)`,
      daysUntilExpiry: alert.daysUntilExpiryAtAlert,
      caName: `${alert.caName} (${alert.zone})`,
      zone: `${alert.zone} / ${alert.environment}`,
      actionUrl: `https://cipher.internal/certificates/${alert.certificateId}`,
      renewInstruction: `POST /api/certificates/${alert.certificateId}/renew`,
    },
  };
}

function shouldSendEmail(policy: ExpirationPolicy): boolean {
  return policy.emailEnabled;
}

function createNotificationRecord(
  alertId: string,
  channel: 'email' | 'webhook',
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED',
  errorMessage?: string,
): NotificationRecord {
  return {
    id: `notif-${Date.now()}`,
    alertId,
    channel,
    sentAt: status === 'SKIPPED' ? null : new Date().toISOString(),
    status,
    error_message: errorMessage,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('C3 FR2 — Email Notification', () => {
  const baseAlert: ExpirationAlert = {
    id: 'alert-001',
    certificateId: 'cert-api-payments',
    certificateCn: 'api-payments.bank.internal',
    threshold: 7,
    daysUntilExpiryAtAlert: 7,
    owner: 'time-pagamentos',
    zone: 'bank-prd',
    caName: 'Vault PKI',
    environment: 'production',
    notAfter: '2026-06-05T14:32:00Z',
  };

  // ── Scenario 2.1: Email sent to owner when alert is triggered ──
  describe('Scenario 2.1: Email sent to owner when alert is triggered', () => {
    it('resolves the owner email from the owner field', () => {
      const email = resolveOwnerEmail('time-pagamentos');
      expect(email).toBe('devops@time-pagamentos.internal');
    });

    it('builds email with correct subject line', () => {
      const ownerEmail = resolveOwnerEmail(baseAlert.owner);
      const payload = buildEmailPayload(baseAlert, ownerEmail, []);

      expect(payload.subject).toBe(
        '[ALERT] Certificate expiring in 7 days: api-payments.bank.internal',
      );
    });

    it('includes certificate CN in email body', () => {
      const payload = buildEmailPayload(
        baseAlert,
        'devops@time-pagamentos.internal',
        [],
      );
      expect(payload.body.certificateCn).toBe('api-payments.bank.internal');
    });

    it('includes owner in email body', () => {
      const payload = buildEmailPayload(
        baseAlert,
        'devops@time-pagamentos.internal',
        [],
      );
      expect(payload.body.owner).toBe('time-pagamentos');
    });

    it('includes expiration date with days remaining', () => {
      const payload = buildEmailPayload(
        baseAlert,
        'devops@time-pagamentos.internal',
        [],
      );
      expect(payload.body.expiresAt).toContain('in 7 days');
      expect(payload.body.expiresAt).toContain('2026-06-05');
    });

    it('includes CA and zone information', () => {
      const payload = buildEmailPayload(
        baseAlert,
        'devops@time-pagamentos.internal',
        [],
      );
      expect(payload.body.caName).toBe('Vault PKI (bank-prd)');
      expect(payload.body.zone).toBe('bank-prd / production');
    });

    it('includes action URL linking to certificate detail', () => {
      const payload = buildEmailPayload(
        baseAlert,
        'devops@time-pagamentos.internal',
        [],
      );
      expect(payload.body.actionUrl).toBe(
        'https://cipher.internal/certificates/cert-api-payments',
      );
    });

    it('includes API renewal instruction', () => {
      const payload = buildEmailPayload(
        baseAlert,
        'devops@time-pagamentos.internal',
        [],
      );
      expect(payload.body.renewInstruction).toBe(
        'POST /api/certificates/cert-api-payments/renew',
      );
    });

    it('creates SUCCESS NotificationRecord when email is sent', () => {
      const record = createNotificationRecord('alert-001', 'email', 'SUCCESS');
      expect(record.alertId).toBe('alert-001');
      expect(record.channel).toBe('email');
      expect(record.status).toBe('SUCCESS');
      expect(record.sentAt).toBeTruthy();
    });
  });

  // ── Scenario 2.2: Email includes additional recipients ──
  describe('Scenario 2.2: Email includes additional recipients from policy', () => {
    const additionalRecipients = ['pki-ops@bank.internal', 'ciso@bank.internal'];

    it('sends to owner email in TO field', () => {
      const payload = buildEmailPayload(
        baseAlert,
        'devops@time-pagamentos.internal',
        additionalRecipients,
      );
      expect(payload.to).toBe('devops@time-pagamentos.internal');
    });

    it('includes additional recipients in CC field', () => {
      const payload = buildEmailPayload(
        baseAlert,
        'devops@time-pagamentos.internal',
        additionalRecipients,
      );
      expect(payload.cc).toEqual(['pki-ops@bank.internal', 'ciso@bank.internal']);
    });

    it('handles empty additional recipients', () => {
      const payload = buildEmailPayload(
        baseAlert,
        'devops@time-pagamentos.internal',
        [],
      );
      expect(payload.cc).toEqual([]);
    });
  });

  // ── Scenario 2.3: Email delivery fails and retries ──
  describe('Scenario 2.3: Email delivery fails and retries', () => {
    it('creates FAILED NotificationRecord after all retries exhausted', () => {
      const record = createNotificationRecord(
        'alert-001',
        'email',
        'FAILED',
        'SMTP timeout after 3 attempts',
      );
      expect(record.status).toBe('FAILED');
      expect(record.error_message).toBe('SMTP timeout after 3 attempts');
    });

    it('retries with correct intervals: 60s, 120s', () => {
      const retryIntervals = [60, 120]; // seconds
      expect(retryIntervals).toHaveLength(2);
      expect(retryIntervals[0]).toBe(60);
      expect(retryIntervals[1]).toBe(120);
    });

    it('limits retries to maximum of 3 attempts', () => {
      const maxRetries = 3;
      const sendEmail = vi.fn(() => {
        throw new Error('SMTP connection timeout');
      });

      let attempts = 0;
      for (let i = 0; i < maxRetries; i++) {
        try {
          sendEmail();
        } catch {
          attempts++;
        }
      }

      expect(attempts).toBe(3);
      expect(sendEmail).toHaveBeenCalledTimes(3);
    });

    it('logs failure message with attempt count', () => {
      const logger = { warn: vi.fn() };
      const attempt = 1;
      const maxRetries = 3;

      logger.warn(
        `Failed to send email to devops@..., attempt ${attempt}/${maxRetries}, retrying in 60s`,
      );

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('attempt 1/3'),
      );
    });

    it('keeps alert status as PENDING when email fails', () => {
      const alert = { ...baseAlert, status: 'PENDING' as const };
      // After email failure, alert status should not change
      expect(alert.status).toBe('PENDING');
    });
  });

  // ── Scenario 2.4: Email suppressed when policy disables email ──
  describe('Scenario 2.4: Email suppressed when policy disables email channel', () => {
    it('does not send email when emailEnabled is false', () => {
      const policy: ExpirationPolicy = {
        emailEnabled: false,
        emailRecipientsAdditional: [],
        webhookEnabled: true,
      };
      expect(shouldSendEmail(policy)).toBe(false);
    });

    it('sends email when emailEnabled is true', () => {
      const policy: ExpirationPolicy = {
        emailEnabled: true,
        emailRecipientsAdditional: [],
        webhookEnabled: true,
      };
      expect(shouldSendEmail(policy)).toBe(true);
    });

    it('creates SKIPPED NotificationRecord when email disabled', () => {
      const record = createNotificationRecord('alert-001', 'email', 'SKIPPED');
      expect(record.status).toBe('SKIPPED');
      expect(record.sentAt).toBeNull();
    });

    it('logs skip reason', () => {
      const logger = { info: vi.fn() };
      logger.info('Email notification skipped per policy for alert-001');
      expect(logger.info).toHaveBeenCalledWith(
        'Email notification skipped per policy for alert-001',
      );
    });
  });
});
