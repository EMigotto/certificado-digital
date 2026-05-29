/**
 * Expiration scheduler — manages the node-cron job that triggers
 * daily threshold evaluation for certificate expiration alerts.
 *
 * - Configurable via EXPIRATION_SCHEDULER_CRON env var
 * - Only starts when EXPIRATION_SCHEDULER_ENABLED=true
 * - On tick: calls SchedulerService.runCheck()
 * - Exposes startScheduler() and stopScheduler() for lifecycle management
 */

import * as cron from 'node-cron';
import { config } from '../config.js';
import { SchedulerService } from '../services/schedulerService.js';
import prisma from '../prismaClient.js';

let scheduledTask: cron.ScheduledTask | null = null;

const schedulerService = new SchedulerService(prisma);

/**
 * Start the expiration scheduler cron job.
 *
 * Validates the cron expression and only starts if
 * EXPIRATION_SCHEDULER_ENABLED=true. Logs lifecycle events.
 */
export function startScheduler(): void {
  if (!config.EXPIRATION_SCHEDULER_ENABLED) {
    console.log('[Scheduler] Expiration scheduler is disabled (EXPIRATION_SCHEDULER_ENABLED=false)');
    return;
  }

  const cronExpression = config.EXPIRATION_SCHEDULER_CRON;

  if (!cron.validate(cronExpression)) {
    console.error(`[Scheduler] Invalid cron expression: "${cronExpression}". Scheduler will not start.`);
    return;
  }

  // Stop any existing task before starting a new one
  stopScheduler();

  scheduledTask = cron.schedule(cronExpression, async () => {
    console.log(`[Scheduler] Expiration check triggered at ${new Date().toISOString()}`);
    try {
      const result = await schedulerService.runCheck();
      console.log(
        `[Scheduler] Expiration check completed — ` +
          `certificates evaluated: ${result.certificatesEvaluated}, ` +
          `alerts created: ${result.alertsCreated}, ` +
          `duration: ${result.durationMs}ms`,
      );
    } catch (err) {
      console.error('[Scheduler] Expiration check failed with unhandled error:', err);
    }
  });

  console.log(`[Scheduler] Expiration scheduler started with cron: "${cronExpression}"`);
  console.log(`[Scheduler] Next run will be determined by cron expression`);
}

/**
 * Stop the expiration scheduler cron job.
 *
 * Safe to call even if the scheduler is not running.
 */
export function stopScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('[Scheduler] Expiration scheduler stopped');
  }
}

/**
 * Get the scheduler service instance (for manual trigger and status).
 */
export function getSchedulerService(): SchedulerService {
  return schedulerService;
}
