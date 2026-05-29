/**
 * Unit tests for cronJob.ts — scheduler lifecycle management.
 *
 * Tests cover:
 * - startScheduler() / stopScheduler() lifecycle
 * - Disabled scheduler config
 * - Invalid cron expression handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock dependencies ───────────────────────────────────────────────────────

// Mock node-cron — named exports to match `import * as cron from 'node-cron'`
const mockSchedule = vi.fn();
const mockValidate = vi.fn();

vi.mock('node-cron', () => ({
  schedule: mockSchedule,
  validate: mockValidate,
}));

// Mock config
const mockConfig = {
  EXPIRATION_SCHEDULER_ENABLED: false,
  EXPIRATION_SCHEDULER_CRON: '0 2 * * *',
};

vi.mock('../config.js', () => ({
  config: mockConfig,
}));

// Mock prismaClient
vi.mock('../prismaClient.js', () => ({
  default: {},
}));

// Mock SchedulerService
vi.mock('../services/schedulerService.js', () => ({
  SchedulerService: vi.fn().mockImplementation(() => ({
    runCheck: vi.fn().mockResolvedValue({
      certificatesEvaluated: 0,
      alertsCreated: 0,
      alertsSkipped: 0,
      snapshotStored: true,
      durationMs: 100,
      errors: [],
    }),
    getStatus: vi.fn().mockReturnValue({
      lastRunAt: null,
      lastDurationMs: null,
      lastCertificatesEvaluated: null,
      lastAlertsCreated: null,
      isRunning: false,
    }),
    getLogs: vi.fn().mockReturnValue([]),
  })),
}));

describe('cronJob', () => {
  let startScheduler: () => void;
  let stopScheduler: () => void;

  beforeEach(async () => {
    vi.resetModules();
    mockSchedule.mockReset();
    mockValidate.mockReset();

    // Re-import to get fresh module state
    const cronModule = await import('../scheduler/cronJob.js');
    startScheduler = cronModule.startScheduler;
    stopScheduler = cronModule.stopScheduler;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should not start when EXPIRATION_SCHEDULER_ENABLED is false', () => {
    mockConfig.EXPIRATION_SCHEDULER_ENABLED = false;
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    startScheduler();

    expect(mockSchedule).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('disabled'),
    );
  });

  it('should not start with an invalid cron expression', () => {
    mockConfig.EXPIRATION_SCHEDULER_ENABLED = true;
    mockConfig.EXPIRATION_SCHEDULER_CRON = 'not-a-cron';
    mockValidate.mockReturnValue(false);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    startScheduler();

    expect(mockSchedule).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid cron expression'),
    );
  });

  it('should start cron job when enabled with valid expression', () => {
    mockConfig.EXPIRATION_SCHEDULER_ENABLED = true;
    mockConfig.EXPIRATION_SCHEDULER_CRON = '0 2 * * *';
    mockValidate.mockReturnValue(true);
    mockSchedule.mockReturnValue({ stop: vi.fn() });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    startScheduler();

    expect(mockSchedule).toHaveBeenCalledWith('0 2 * * *', expect.any(Function));
  });

  it('should stop existing task before starting a new one', () => {
    mockConfig.EXPIRATION_SCHEDULER_ENABLED = true;
    mockConfig.EXPIRATION_SCHEDULER_CRON = '0 2 * * *';
    mockValidate.mockReturnValue(true);

    const mockStop = vi.fn();
    mockSchedule.mockReturnValue({ stop: mockStop });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    // Start first
    startScheduler();
    // Start again — should stop the first
    startScheduler();

    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  it('stopScheduler() should be safe to call when no task is running', () => {
    expect(() => stopScheduler()).not.toThrow();
  });
});
