import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailNotificationService, type Logger } from '../services/emailService.js';
import { AlertRepository } from '../repositories/alertRepo.js';
import type { PrismaClient, ExpirationAlert, ExpirationPolicy } from '@prisma/client';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';

// ─── Factories ─────────────────────────────────────────────────────────────

function makeAlert(overrides: Partial<ExpirationAlert> = {}): ExpirationAlert {
  return {
    id: 'alert-001',
    certificateId: 'cert-001',
    threshold: 30,
    triggeredAt: new Date('2025-07-01T10:00:00.000Z'),
    status: 'PENDING',
    certificateCn: 'api.example.com',
    certificateSans: ['api.example.com', 'www.example.com'],
    daysUntilExpiryAtAlert: 28,
    caName: 'DigiCert',
    owner: 'platform-team@example.com',
    zone: 'us-east-1',
    environment: 'PRD',
    acknowledgedAt: null,
    acknowledgedBy: null,
    createdAt: new Date('2025-07-01T10:00:00.000Z'),
    updatedAt: new Date('2025-07-01T10:00:00.000Z'),
    ...overrides,
  };
}

function makePolicy(overrides: Partial<ExpirationPolicy> = {}): ExpirationPolicy {
  return {
    id: 'policy-001',
    name: 'Default Policy',
    description: null,
    zoneId: null,
    isDefault: true,
    thresholds: JSON.stringify({
      days_90: { enabled: true, channels: ['EMAIL'] },
      days_30: { enabled: true, channels: ['EMAIL'] },
      days_7: { enabled: true, channels: ['EMAIL', 'WEBHOOK'] },
      days_1: { enabled: true, channels: ['EMAIL', 'WEBHOOK'] },
    }),
    emailEnabled: true,
    emailRecipientsAdditional: null,
    emailSubjectPrefix: null,
    createdBy: 'admin',
    updatedBy: null,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function createMockTransporter(): Transporter<SMTPTransport.SentMessageInfo> {
  return {
    sendMail: vi.fn().mockResolvedValue({ messageId: '<mock@example.com>' }),
    verify: vi.fn().mockResolvedValue(true),
  } as unknown as Transporter<SMTPTransport.SentMessageInfo>;
}

function createMockPrisma() {
  return {
    notificationRecord: {
      create: vi.fn().mockResolvedValue({ id: 'notif-001' }),
    },
    expirationAlert: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  } as unknown as PrismaClient;
}

function createSilentLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function buildService(
  prisma: PrismaClient,
  transporter: Transporter<SMTPTransport.SentMessageInfo>,
  overrides?: { backoffMs?: number[]; maxRetries?: number },
) {
  const repo = new AlertRepository(prisma);
  const logger = createSilentLogger();
  return new EmailNotificationService(repo, {
    logger,
    transporter,
    backoffMs: overrides?.backoffMs ?? [0, 0, 0], // no-wait in tests
    maxRetries: overrides?.maxRetries ?? 3,
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('EmailNotificationService.sendAlertEmail', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let transporter: ReturnType<typeof createMockTransporter>;
  let service: EmailNotificationService;

  beforeEach(() => {
    prisma = createMockPrisma();
    transporter = createMockTransporter();
    service = buildService(prisma as unknown as PrismaClient, transporter);
  });

  it('should send email successfully on first attempt (AC 2.1)', async () => {
    const alert = makeAlert();
    const policy = makePolicy();

    const result = await service.sendAlertEmail(alert, policy);

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.errorMessage).toBeUndefined();

    // Verify transporter.sendMail was called once
    expect(transporter.sendMail).toHaveBeenCalledTimes(1);

    // Verify mail options
    const call = (transporter.sendMail as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.to).toBe('platform-team@example.com');
    expect(call.subject).toContain('[ALERT]');
    expect(call.subject).toContain('api.example.com');
    expect(call.subject).toContain('28 days');
    expect(call.html).toContain('api.example.com');
    expect(call.text).toContain('api.example.com');
    expect(call.cc).toBeUndefined();

    // Verify notification record was created with SUCCESS
    expect(prisma.notificationRecord.create).toHaveBeenCalledTimes(1);
    const record = (prisma.notificationRecord.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(record.data.channel).toBe('EMAIL');
    expect(record.data.status).toBe('SUCCESS');
    expect(record.data.attemptNumber).toBe(1);
    expect(record.data.alertId).toBe('alert-001');
  });

  it('should include CC recipients from policy (AC 2.2)', async () => {
    const alert = makeAlert();
    const policy = makePolicy({
      emailRecipientsAdditional: 'security@example.com, ops@example.com',
    });

    await service.sendAlertEmail(alert, policy);

    const call = (transporter.sendMail as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.cc).toBe('security@example.com, ops@example.com');
  });

  it('should use custom subject prefix from policy', async () => {
    const alert = makeAlert();
    const policy = makePolicy({
      emailSubjectPrefix: '[CERT-EXPIRY]',
    });

    await service.sendAlertEmail(alert, policy);

    const call = (transporter.sendMail as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.subject).toMatch(/^\[CERT-EXPIRY\]/);
  });

  it('should skip when emailEnabled is false (AC 2.4)', async () => {
    const alert = makeAlert();
    const policy = makePolicy({ emailEnabled: false });

    const result = await service.sendAlertEmail(alert, policy);

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(0);

    // No email should have been sent
    expect(transporter.sendMail).not.toHaveBeenCalled();

    // Notification record should be created with SKIPPED status
    expect(prisma.notificationRecord.create).toHaveBeenCalledTimes(1);
    const record = (prisma.notificationRecord.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(record.data.status).toBe('SKIPPED');
    expect(record.data.channel).toBe('EMAIL');
  });

  it('should handle alert with no zone/environment', async () => {
    const alert = makeAlert({ zone: null, environment: null });
    const policy = makePolicy();

    const result = await service.sendAlertEmail(alert, policy);

    expect(result.success).toBe(true);

    const call = (transporter.sendMail as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.html).toContain('—'); // dash for null fields
    expect(call.text).toContain('—');
  });

  it('should handle alert with empty SANs', async () => {
    const alert = makeAlert({ certificateSans: [] });
    const policy = makePolicy();

    const result = await service.sendAlertEmail(alert, policy);

    expect(result.success).toBe(true);
    const call = (transporter.sendMail as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.text).toContain('(none)');
  });

  it('should handle 1-day threshold with singular wording', async () => {
    const alert = makeAlert({ daysUntilExpiryAtAlert: 1, threshold: 1 });
    const policy = makePolicy();

    await service.sendAlertEmail(alert, policy);

    const call = (transporter.sendMail as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.subject).toContain('1 day:');
    expect(call.html).toContain('URGENT');
  });
});

describe('EmailNotificationService.sendWithRetry', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let transporter: ReturnType<typeof createMockTransporter>;
  let service: EmailNotificationService;

  const mailOptions = {
    to: 'user@example.com',
    subject: 'Test',
    html: '<p>Test</p>',
    text: 'Test',
  };

  beforeEach(() => {
    prisma = createMockPrisma();
    transporter = createMockTransporter();
    service = buildService(prisma as unknown as PrismaClient, transporter);
  });

  it('should succeed on first attempt', async () => {
    const result = await service.sendWithRetry(mailOptions);

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
    expect(transporter.sendMail).toHaveBeenCalledTimes(1);
  });

  it('should retry and succeed on second attempt (AC 2.3)', async () => {
    (transporter.sendMail as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('Connection timeout'))
      .mockResolvedValueOnce({ messageId: '<ok@test>' });

    const result = await service.sendWithRetry(mailOptions);

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
    expect(transporter.sendMail).toHaveBeenCalledTimes(2);
  });

  it('should retry and succeed on third attempt (AC 2.3)', async () => {
    (transporter.sendMail as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce({ messageId: '<ok@test>' });

    const result = await service.sendWithRetry(mailOptions);

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(3);
    expect(transporter.sendMail).toHaveBeenCalledTimes(3);
  });

  it('should fail after all retries exhausted (AC 2.3)', async () => {
    const error = new Error('Permanent SMTP failure');
    (transporter.sendMail as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    const result = await service.sendWithRetry(mailOptions);

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(3);
    expect(result.errorMessage).toBe('Permanent SMTP failure');
    expect(transporter.sendMail).toHaveBeenCalledTimes(3);
  });

  it('should create FAILED notification record on exhausted retries', async () => {
    (transporter.sendMail as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('SMTP server unavailable'),
    );

    const alert = makeAlert();
    const policy = makePolicy();

    const result = await service.sendAlertEmail(alert, policy);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('SMTP server unavailable');

    // Verify the FAILED notification record
    const record = (prisma.notificationRecord.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(record.data.status).toBe('FAILED');
    expect(record.data.errorMessage).toBe('SMTP server unavailable');
    expect(record.data.attemptNumber).toBe(3);
  });

  it('should handle non-Error throw objects', async () => {
    (transporter.sendMail as ReturnType<typeof vi.fn>).mockRejectedValue('string error');

    const result = await service.sendWithRetry(mailOptions);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('string error');
  });

  it('should respect custom maxRetries', async () => {
    (transporter.sendMail as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('fail'));

    const result = await service.sendWithRetry(mailOptions, 1);

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(1);
    expect(transporter.sendMail).toHaveBeenCalledTimes(1);
  });
});

describe('EmailNotificationService.testConnection', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let transporter: ReturnType<typeof createMockTransporter>;
  let service: EmailNotificationService;

  beforeEach(() => {
    prisma = createMockPrisma();
    transporter = createMockTransporter();
    service = buildService(prisma as unknown as PrismaClient, transporter);
  });

  it('should return true when SMTP connection succeeds', async () => {
    const result = await service.testConnection();
    expect(result).toBe(true);
    expect(transporter.verify).toHaveBeenCalledTimes(1);
  });

  it('should return false when SMTP connection fails', async () => {
    (transporter.verify as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Connection refused'),
    );

    const result = await service.testConnection();
    expect(result).toBe(false);
  });
});

// ─── Template unit tests ───────────────────────────────────────────────────

describe('Email templates', () => {
  // Import templates directly
  let buildAlertEmailHtml: typeof import('../templates/alertEmail.js')['buildAlertEmailHtml'];
  let buildAlertEmailText: typeof import('../templates/alertEmail.js')['buildAlertEmailText'];
  let buildAlertSubject: typeof import('../templates/alertEmail.js')['buildAlertSubject'];

  beforeEach(async () => {
    const mod = await import('../templates/alertEmail.js');
    buildAlertEmailHtml = mod.buildAlertEmailHtml;
    buildAlertEmailText = mod.buildAlertEmailText;
    buildAlertSubject = mod.buildAlertSubject;
  });

  const templateData = {
    certificateCn: 'api.example.com',
    owner: 'platform-team@example.com',
    expiryDate: '2025-08-01T00:00:00.000Z',
    daysUntilExpiry: 28,
    caName: 'DigiCert',
    zone: 'us-east-1',
    environment: 'PRD',
    sans: ['api.example.com', 'www.example.com'],
    threshold: 30,
  };

  describe('buildAlertEmailHtml', () => {
    it('should produce valid HTML with all fields', () => {
      const html = buildAlertEmailHtml(templateData);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('api.example.com');
      expect(html).toContain('platform-team@example.com');
      expect(html).toContain('DigiCert');
      expect(html).toContain('us-east-1');
      expect(html).toContain('PRD');
      expect(html).toContain('www.example.com');
      expect(html).toContain('28');
      expect(html).toContain('WARNING');
    });

    it('should show URGENT for 1-day alerts', () => {
      const html = buildAlertEmailHtml({ ...templateData, daysUntilExpiry: 1 });
      expect(html).toContain('URGENT');
    });

    it('should show CRITICAL for 7-day alerts', () => {
      const html = buildAlertEmailHtml({ ...templateData, daysUntilExpiry: 7 });
      expect(html).toContain('CRITICAL');
    });

    it('should show INFO for 90-day alerts', () => {
      const html = buildAlertEmailHtml({ ...templateData, daysUntilExpiry: 90 });
      expect(html).toContain('INFO');
    });

    it('should escape HTML special characters in CN', () => {
      const html = buildAlertEmailHtml({
        ...templateData,
        certificateCn: '<script>alert("xss")</script>',
      });
      expect(html).toContain('&lt;script&gt;');
      expect(html).not.toContain('<script>alert');
    });

    it('should include action button when actionUrl is provided', () => {
      const html = buildAlertEmailHtml({
        ...templateData,
        actionUrl: 'https://app.example.com/certs/123',
      });
      expect(html).toContain('View Certificate Details');
      expect(html).toContain('https://app.example.com/certs/123');
    });

    it('should handle null zone and environment', () => {
      const html = buildAlertEmailHtml({
        ...templateData,
        zone: null,
        environment: null,
      });
      // Should display dash placeholders (multiple occurrences)
      expect(html).toContain('—');
    });

    it('should handle empty SANs list', () => {
      const html = buildAlertEmailHtml({ ...templateData, sans: [] });
      expect(html).toContain('None');
    });
  });

  describe('buildAlertEmailText', () => {
    it('should produce plain text with all fields', () => {
      const text = buildAlertEmailText(templateData);

      expect(text).toContain('CERTIFICATE EXPIRATION WARNING');
      expect(text).toContain('api.example.com');
      expect(text).toContain('platform-team@example.com');
      expect(text).toContain('DigiCert');
      expect(text).toContain('us-east-1');
      expect(text).toContain('PRD');
      expect(text).toContain('www.example.com');
      expect(text).toContain('28');
      expect(text).toContain('30-day policy');
    });

    it('should show URGENT for 1-day alerts', () => {
      const text = buildAlertEmailText({ ...templateData, daysUntilExpiry: 1 });
      expect(text).toContain('URGENT');
    });

    it('should handle null zone/environment with dashes', () => {
      const text = buildAlertEmailText({
        ...templateData,
        zone: null,
        environment: null,
      });
      expect(text).toContain('—');
    });

    it('should handle empty SANs', () => {
      const text = buildAlertEmailText({ ...templateData, sans: [] });
      expect(text).toContain('(none)');
    });

    it('should include action URL when provided', () => {
      const text = buildAlertEmailText({
        ...templateData,
        actionUrl: 'https://app.example.com/certs/123',
      });
      expect(text).toContain('https://app.example.com/certs/123');
    });
  });

  describe('buildAlertSubject', () => {
    it('should use default [ALERT] prefix', () => {
      const subject = buildAlertSubject({
        certificateCn: 'api.example.com',
        daysUntilExpiry: 28,
      });
      expect(subject).toBe('[ALERT] Certificate expiring in 28 days: api.example.com');
    });

    it('should use custom prefix when provided', () => {
      const subject = buildAlertSubject(
        { certificateCn: 'api.example.com', daysUntilExpiry: 28 },
        '[PROD-CERT]',
      );
      expect(subject).toBe('[PROD-CERT] Certificate expiring in 28 days: api.example.com');
    });

    it('should fall back to [ALERT] when prefix is null', () => {
      const subject = buildAlertSubject(
        { certificateCn: 'test.com', daysUntilExpiry: 7 },
        null,
      );
      expect(subject).toBe('[ALERT] Certificate expiring in 7 days: test.com');
    });

    it('should use singular "day" for 1-day alerts', () => {
      const subject = buildAlertSubject({
        certificateCn: 'test.com',
        daysUntilExpiry: 1,
      });
      expect(subject).toContain('1 day:');
      expect(subject).not.toContain('1 days:');
    });

    it('should use plural "days" for multi-day alerts', () => {
      const subject = buildAlertSubject({
        certificateCn: 'test.com',
        daysUntilExpiry: 30,
      });
      expect(subject).toContain('30 days:');
    });
  });
});
