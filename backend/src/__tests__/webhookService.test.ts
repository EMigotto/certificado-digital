import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  WebhookNotificationService,
  getRetryDelay,
  type WebhookPayload,
  type HttpDispatchFn,
  type WebhookLogger,
} from '../services/webhookService.js';
import type { AlertRepository } from '../repositories/alertRepo.js';
import type { ExpirationAlert, ExpirationWebhook } from '@prisma/client';

// ─── Test helpers ───────────────────────────────────────────────────────────

function makeAlert(overrides: Partial<ExpirationAlert> = {}): ExpirationAlert {
  return {
    id: 'alert-001',
    certificateId: 'cert-001',
    threshold: 30,
    triggeredAt: new Date('2025-06-01T10:00:00.000Z'),
    status: 'PENDING',
    certificateCn: 'api.example.com',
    certificateSans: ['api.example.com', '*.api.example.com'],
    daysUntilExpiryAtAlert: 28,
    caName: 'DigiCert',
    owner: 'platform-team',
    zone: 'us-east-1',
    environment: 'PRD',
    acknowledgedAt: null,
    acknowledgedBy: null,
    createdAt: new Date('2025-06-01T10:00:00.000Z'),
    updatedAt: new Date('2025-06-01T10:00:00.000Z'),
    ...overrides,
  } as ExpirationAlert;
}

function makeWebhook(overrides: Partial<ExpirationWebhook> = {}): ExpirationWebhook {
  return {
    id: 'wh-001',
    policyId: 'policy-001',
    url: 'https://hooks.example.com/alerts',
    headers: {},
    retryStrategy: 'exponential',
    maxRetries: 3,
    timeoutSeconds: 10,
    isActive: true,
    testResult: null,
    lastTestAt: null,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    ...overrides,
  } as ExpirationWebhook;
}

function createMockRepo(): AlertRepository {
  return {
    createNotificationRecord: vi.fn().mockResolvedValue({
      id: 'notif-new',
      alertId: 'alert-001',
      channel: 'WEBHOOK',
      sentAt: new Date(),
      status: 'SUCCESS',
      errorMessage: null,
      webhookId: 'wh-001',
      attemptNumber: 1,
    }),
  } as unknown as AlertRepository;
}

function createSilentLogger(): WebhookLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function createOkHttpDispatch(): HttpDispatchFn {
  return vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });
}

function createFailHttpDispatch(status = 500, statusText = 'Internal Server Error'): HttpDispatchFn {
  return vi.fn().mockResolvedValue({ ok: false, status, statusText });
}

function createService(
  repo: AlertRepository,
  httpDispatch: HttpDispatchFn,
  logger?: WebhookLogger,
): WebhookNotificationService {
  const svc = new WebhookNotificationService(repo, {
    logger: logger ?? createSilentLogger(),
    httpDispatch,
  });
  // Override sleep to be instant in tests
  (svc as unknown as { sleep: (ms: number) => Promise<void> }).sleep = () => Promise.resolve();
  return svc;
}

// ─── getRetryDelay ──────────────────────────────────────────────────────────

describe('getRetryDelay', () => {
  it('should return 1000ms for attempt 0', () => {
    expect(getRetryDelay(0)).toBe(1_000);
  });

  it('should return 5000ms for attempt 1', () => {
    expect(getRetryDelay(1)).toBe(5_000);
  });

  it('should return 30000ms for attempt 2', () => {
    expect(getRetryDelay(2)).toBe(30_000);
  });

  it('should cap at 30000ms for attempts beyond array length', () => {
    expect(getRetryDelay(5)).toBe(30_000);
    expect(getRetryDelay(100)).toBe(30_000);
  });

  it('should work regardless of strategy parameter', () => {
    expect(getRetryDelay(0, 'exponential')).toBe(1_000);
    expect(getRetryDelay(0, null)).toBe(1_000);
    expect(getRetryDelay(0, undefined)).toBe(1_000);
  });
});

// ─── buildPayload ───────────────────────────────────────────────────────────

describe('WebhookNotificationService.buildPayload', () => {
  let service: WebhookNotificationService;

  beforeEach(() => {
    service = createService(createMockRepo(), createOkHttpDispatch());
  });

  it('should build correct JSON payload per PRD spec (AC 3.1)', () => {
    const alert = makeAlert();
    const payload: WebhookPayload = service.buildPayload(alert);

    expect(payload.alert_id).toBe('alert-001');
    expect(payload.timestamp).toBe('2025-06-01T10:00:00.000Z');
    expect(payload.event).toBe('certificate.expiring');
    expect(payload.threshold_days).toBe(30);

    expect(payload.certificate).toEqual({
      id: 'cert-001',
      common_name: 'api.example.com',
      sans: ['api.example.com', '*.api.example.com'],
      days_until_expiry: 28,
      ca_name: 'DigiCert',
      owner: 'platform-team',
      zone: 'us-east-1',
      environment: 'PRD',
    });
  });

  it('should handle null zone and environment', () => {
    const alert = makeAlert({ zone: null, environment: null });
    const payload = service.buildPayload(alert);

    expect(payload.certificate.zone).toBeNull();
    expect(payload.certificate.environment).toBeNull();
  });

  it('should handle empty SANs array', () => {
    const alert = makeAlert({ certificateSans: [] });
    const payload = service.buildPayload(alert);

    expect(payload.certificate.sans).toEqual([]);
  });
});

// ─── dispatchWebhook ────────────────────────────────────────────────────────

describe('WebhookNotificationService.dispatchWebhook', () => {
  it('should skip inactive webhook and record SKIPPED notification (AC 3.4)', async () => {
    const repo = createMockRepo();
    const httpDispatch = createOkHttpDispatch();
    const service = createService(repo, httpDispatch);

    const webhook = makeWebhook({ isActive: false });
    const alert = makeAlert();

    const result = await service.dispatchWebhook(alert, webhook);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('Webhook is inactive');

    // Should record SKIPPED notification
    expect(repo.createNotificationRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        alertId: 'alert-001',
        channel: 'WEBHOOK',
        status: 'SKIPPED',
        errorMessage: 'Webhook is inactive',
        webhookId: 'wh-001',
      }),
    );

    // HTTP dispatch should NOT be called
    expect(httpDispatch).not.toHaveBeenCalled();
  });

  it('should send HTTP POST with correct payload and headers (AC 3.1)', async () => {
    const httpDispatch = createOkHttpDispatch();
    const service = createService(createMockRepo(), httpDispatch);

    const webhook = makeWebhook({
      headers: { 'X-Custom-Key': 'secret-value', Authorization: 'Bearer tok123' },
    });
    const alert = makeAlert();

    const result = await service.dispatchWebhook(alert, webhook);

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);

    // Verify HTTP dispatch was called with correct parameters
    expect(httpDispatch).toHaveBeenCalledTimes(1);
    const call = (httpDispatch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('https://hooks.example.com/alerts');

    const opts = call[1];
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(opts.headers['X-Custom-Key']).toBe('secret-value');
    expect(opts.headers['Authorization']).toBe('Bearer tok123');

    // Verify body is valid JSON with expected structure
    const body = JSON.parse(opts.body);
    expect(body.alert_id).toBe('alert-001');
    expect(body.event).toBe('certificate.expiring');
    expect(body.certificate.common_name).toBe('api.example.com');
  });

  it('should return failure on non-2xx response', async () => {
    const httpDispatch = createFailHttpDispatch(503, 'Service Unavailable');
    const service = createService(createMockRepo(), httpDispatch);

    const result = await service.dispatchWebhook(makeAlert(), makeWebhook());

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(503);
    expect(result.errorMessage).toBe('HTTP 503 Service Unavailable');
  });

  it('should return failure on 4xx response', async () => {
    const httpDispatch = createFailHttpDispatch(400, 'Bad Request');
    const service = createService(createMockRepo(), httpDispatch);

    const result = await service.dispatchWebhook(makeAlert(), makeWebhook());

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(400);
    expect(result.errorMessage).toBe('HTTP 400 Bad Request');
  });

  it('should handle network errors gracefully', async () => {
    const httpDispatch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const service = createService(createMockRepo(), httpDispatch);

    const result = await service.dispatchWebhook(makeAlert(), makeWebhook());

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('ECONNREFUSED');
  });

  it('should handle timeout via AbortError (AC 3.3)', async () => {
    const httpDispatch = vi.fn().mockRejectedValue(
      new DOMException('The operation was aborted', 'AbortError'),
    );
    const service = createService(createMockRepo(), httpDispatch);

    const webhook = makeWebhook({ timeoutSeconds: 5 });
    const result = await service.dispatchWebhook(makeAlert(), webhook);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('timed out');
    expect(result.errorMessage).toContain('5000ms');
  });

  it('should pass attempt number through', async () => {
    const httpDispatch = createOkHttpDispatch();
    const service = createService(createMockRepo(), httpDispatch);

    const result = await service.dispatchWebhook(makeAlert(), makeWebhook(), 3);

    expect(result.attemptNumber).toBe(3);
  });

  it('should handle non-Error thrown values', async () => {
    const httpDispatch = vi.fn().mockRejectedValue('string error');
    const service = createService(createMockRepo(), httpDispatch);

    const result = await service.dispatchWebhook(makeAlert(), makeWebhook());

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('Unknown error');
  });
});

// ─── dispatchWithRetry ──────────────────────────────────────────────────────

describe('WebhookNotificationService.dispatchWithRetry', () => {
  it('should succeed on first attempt without retries', async () => {
    const repo = createMockRepo();
    const httpDispatch = createOkHttpDispatch();
    const service = createService(repo, httpDispatch);

    const result = await service.dispatchWithRetry(makeAlert(), makeWebhook());

    expect(result.success).toBe(true);
    expect(result.attemptNumber).toBe(1);
    expect(httpDispatch).toHaveBeenCalledTimes(1);

    // Should create SUCCESS notification record
    expect(repo.createNotificationRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        alertId: 'alert-001',
        channel: 'WEBHOOK',
        status: 'SUCCESS',
        webhookId: 'wh-001',
        attemptNumber: 1,
      }),
    );
  });

  it('should retry on failure and succeed on second attempt (AC 3.2)', async () => {
    const repo = createMockRepo();
    const httpDispatch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error' })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' });

    const service = createService(repo, httpDispatch);

    const result = await service.dispatchWithRetry(makeAlert(), makeWebhook());

    expect(result.success).toBe(true);
    expect(result.attemptNumber).toBe(2);
    expect(httpDispatch).toHaveBeenCalledTimes(2);

    // Should create SUCCESS record (only on final success)
    expect(repo.createNotificationRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'SUCCESS',
        attemptNumber: 2,
      }),
    );
  });

  it('should retry on 4xx responses (AC 3.2)', async () => {
    const repo = createMockRepo();
    const httpDispatch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, statusText: 'Too Many Requests' })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' });

    const service = createService(repo, httpDispatch);

    const result = await service.dispatchWithRetry(makeAlert(), makeWebhook());

    expect(result.success).toBe(true);
    expect(httpDispatch).toHaveBeenCalledTimes(2);
  });

  it('should fail after exhausting all retries', async () => {
    const repo = createMockRepo();
    const httpDispatch = createFailHttpDispatch(502, 'Bad Gateway');
    const service = createService(repo, httpDispatch);

    const webhook = makeWebhook({ maxRetries: 3 });
    const result = await service.dispatchWithRetry(makeAlert(), webhook);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('HTTP 502 Bad Gateway');
    // 1 initial + 3 retries = 4 total
    expect(httpDispatch).toHaveBeenCalledTimes(4);

    // Should create FAILED notification record
    expect(repo.createNotificationRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        alertId: 'alert-001',
        channel: 'WEBHOOK',
        status: 'FAILED',
        errorMessage: 'HTTP 502 Bad Gateway',
        webhookId: 'wh-001',
        attemptNumber: 4,
      }),
    );
  });

  it('should work with maxRetries = 0 (single attempt only)', async () => {
    const repo = createMockRepo();
    const httpDispatch = createFailHttpDispatch(500, 'Internal Server Error');
    const service = createService(repo, httpDispatch);

    const webhook = makeWebhook({ maxRetries: 0 });
    const result = await service.dispatchWithRetry(makeAlert(), webhook);

    expect(result.success).toBe(false);
    expect(httpDispatch).toHaveBeenCalledTimes(1);

    // Should create FAILED notification record
    expect(repo.createNotificationRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED',
        attemptNumber: 1,
      }),
    );
  });

  it('should succeed on the last retry attempt', async () => {
    const repo = createMockRepo();
    const httpDispatch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Error' })
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Error' })
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Error' })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' });

    const service = createService(repo, httpDispatch);
    const webhook = makeWebhook({ maxRetries: 3 });

    const result = await service.dispatchWithRetry(makeAlert(), webhook);

    expect(result.success).toBe(true);
    expect(result.attemptNumber).toBe(4);
    expect(httpDispatch).toHaveBeenCalledTimes(4);

    // Should create SUCCESS (not FAILED) record
    expect(repo.createNotificationRecord).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'SUCCESS', attemptNumber: 4 }),
    );
  });

  it('should skip inactive webhook via dispatchWithRetry (AC 3.4)', async () => {
    const repo = createMockRepo();
    const httpDispatch = createOkHttpDispatch();
    const service = createService(repo, httpDispatch);

    const webhook = makeWebhook({ isActive: false });
    const result = await service.dispatchWithRetry(makeAlert(), webhook);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('Webhook is inactive');
    expect(httpDispatch).not.toHaveBeenCalled();

    // Should record SKIPPED notification
    expect(repo.createNotificationRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'SKIPPED',
        errorMessage: 'Webhook is inactive',
      }),
    );
  });

  it('should handle notification record persistence failure gracefully', async () => {
    const repo = createMockRepo();
    (repo.createNotificationRecord as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('DB connection lost'),
    );

    const httpDispatch = createOkHttpDispatch();
    const logger = createSilentLogger();
    const service = createService(repo, httpDispatch, logger);

    // Should not throw even when notification record fails to persist
    const result = await service.dispatchWithRetry(makeAlert(), makeWebhook());

    expect(result.success).toBe(true);
    // Logger should have recorded the persistence error
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to persist notification record',
      expect.objectContaining({ alertId: 'alert-001' }),
    );
  });

  it('should log retry details with correct delay values', async () => {
    const repo = createMockRepo();
    const httpDispatch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Error' })
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Error' })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' });

    const logger = createSilentLogger();
    const service = createService(repo, httpDispatch, logger);
    const webhook = makeWebhook({ maxRetries: 3 });

    await service.dispatchWithRetry(makeAlert(), webhook);

    // Should have logged retry warnings
    const warnCalls = (logger.warn as ReturnType<typeof vi.fn>).mock.calls;
    const retryCalls = warnCalls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('scheduling retry'),
    );
    expect(retryCalls.length).toBe(2); // 2 retries before success on attempt 3

    // Verify delay values are logged
    expect(retryCalls[0][1]).toEqual(expect.objectContaining({ nextRetryDelayMs: 1_000 }));
    expect(retryCalls[1][1]).toEqual(expect.objectContaining({ nextRetryDelayMs: 5_000 }));
  });

  it('should handle network errors during retry', async () => {
    const repo = createMockRepo();
    const httpDispatch = vi.fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' });

    const service = createService(repo, httpDispatch);

    const result = await service.dispatchWithRetry(makeAlert(), makeWebhook());

    expect(result.success).toBe(true);
    expect(result.attemptNumber).toBe(2);
  });
});
