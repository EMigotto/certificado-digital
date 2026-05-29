/**
 * SchedulerService — expiration threshold evaluation orchestrator.
 *
 * Responsibilities:
 * - Query all active certificates (VALID / EXPIRING_SOON, not yet expired)
 * - Process in batches of 500
 * - Evaluate each certificate against policy thresholds (90, 30, 7, 1 days)
 * - Upsert alerts (deduplication via DB unique constraint)
 * - Compute and store daily ExpirationSnapshot
 * - Track execution status (last run, duration, counts)
 * - Retry on DB failure with exponential backoff (AC 1.4)
 */

import type { PrismaClient } from '@prisma/client';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Default thresholds (days) evaluated in descending order */
const DEFAULT_THRESHOLDS = [90, 30, 7, 1] as const;

/** Number of certificates to process per batch */
const BATCH_SIZE = 500;

/** Default maximum retry attempts on DB failure */
const DEFAULT_MAX_RETRIES = 3;

/** Default base delay in ms for exponential backoff */
const DEFAULT_BASE_RETRY_DELAY_MS = 1000;

/** Optional configuration for retry behaviour (useful for testing) */
export interface SchedulerRetryConfig {
  maxRetries?: number;
  baseRetryDelayMs?: number;
}

// ─── Types ────────────────────────────────────────────────────────────────────

/** Parsed threshold configuration from a policy */
interface ParsedThresholds {
  days_90: { enabled: boolean; channels: string[] };
  days_30: { enabled: boolean; channels: string[] };
  days_7: { enabled: boolean; channels: string[] };
  days_1: { enabled: boolean; channels: string[] };
}

/** Result of a single runCheck() execution */
export interface SchedulerRunResult {
  certificatesEvaluated: number;
  alertsCreated: number;
  alertsSkipped: number;
  snapshotStored: boolean;
  durationMs: number;
  errors: string[];
}

/** Status of the last scheduler execution */
export interface SchedulerStatus {
  lastRunAt: string | null;
  lastDurationMs: number | null;
  lastCertificatesEvaluated: number | null;
  lastAlertsCreated: number | null;
  isRunning: boolean;
}

/** Execution log entry for recent runs */
export interface SchedulerLogEntry {
  timestamp: string;
  certificatesEvaluated: number;
  alertsCreated: number;
  alertsSkipped: number;
  durationMs: number;
  snapshotStored: boolean;
  errors: string[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class SchedulerService {
  private lastRunAt: string | null = null;
  private lastDurationMs: number | null = null;
  private lastCertificatesEvaluated: number | null = null;
  private lastAlertsCreated: number | null = null;
  private isRunning = false;
  private recentLogs: SchedulerLogEntry[] = [];
  private readonly maxLogEntries = 50;
  private readonly maxRetries: number;
  private readonly baseRetryDelayMs: number;

  constructor(
    private readonly prisma: PrismaClient,
    retryConfig?: SchedulerRetryConfig,
  ) {
    this.maxRetries = retryConfig?.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.baseRetryDelayMs = retryConfig?.baseRetryDelayMs ?? DEFAULT_BASE_RETRY_DELAY_MS;
  }

  /**
   * Main orchestrator — evaluates all active certificates against thresholds.
   *
   * Steps:
   * 1. Query certificates: status IN (VALID, EXPIRING_SOON), notAfter > now()
   * 2. Process in batches of 500
   * 3. For each certificate: compute daysUntilExpiry, look up policy, upsert alerts
   * 4. Compute and store ExpirationSnapshot
   */
  async runCheck(): Promise<SchedulerRunResult> {
    if (this.isRunning) {
      return {
        certificatesEvaluated: 0,
        alertsCreated: 0,
        alertsSkipped: 0,
        snapshotStored: false,
        durationMs: 0,
        errors: ['Scheduler is already running — skipping concurrent execution'],
      };
    }

    this.isRunning = true;
    const startTime = Date.now();
    const errors: string[] = [];
    let certificatesEvaluated = 0;
    let alertsCreated = 0;
    let alertsSkipped = 0;
    let snapshotStored = false;

    try {
      const now = new Date();

      // ── Step 1 & 2: Query active certificates in batches ────────────────
      let skip = 0;
      let hasMore = true;

      while (hasMore) {
        const batch = await this.withRetry(async () => {
          const results = await this.prisma.certificate.findMany({
            where: {
              status: { in: ['VALID', 'EXPIRING_SOON'] },
              notAfter: { gt: now },
              revoked: false,
            },
            orderBy: { notAfter: 'asc' },
            skip,
            take: BATCH_SIZE,
          });
          return results as Array<{
            id: string;
            commonName: string;
            sans: string[];
            notAfter: Date;
            status: string;
            revoked: boolean;
            caName: string;
            owner: string;
            zone: string | null;
            environment: string;
          }>;
        });

        if (batch.length === 0) {
          hasMore = false;
          break;
        }

        // ── Step 3: Evaluate each certificate ───────────────────────────
        for (const cert of batch) {
          try {
            const daysUntilExpiry = Math.ceil(
              (cert.notAfter.getTime() - now.getTime()) / 86_400_000,
            );

            // Look up effective policy for this certificate's zone
            const policy = await this.findEffectivePolicy(cert.zone);
            const enabledThresholds = this.getEnabledThresholds(policy);

            for (const threshold of enabledThresholds) {
              if (daysUntilExpiry <= threshold) {
                const created = await this.upsertAlert({
                  certificateId: cert.id,
                  threshold,
                  triggeredAt: now,
                  certificateCn: cert.commonName,
                  certificateSans: cert.sans,
                  daysUntilExpiryAtAlert: daysUntilExpiry,
                  caName: cert.caName,
                  owner: cert.owner,
                  zone: cert.zone,
                  environment: cert.environment,
                });

                if (created) {
                  alertsCreated++;
                } else {
                  alertsSkipped++;
                }
              }
            }
          } catch (err) {
            const message =
              err instanceof Error ? err.message : String(err);
            errors.push(
              `Error processing certificate ${cert.id}: ${message}`,
            );
          }
        }

        certificatesEvaluated += batch.length;
        skip += BATCH_SIZE;

        if (batch.length < BATCH_SIZE) {
          hasMore = false;
        }
      }

      // ── Step 5: Compute and store ExpirationSnapshot ──────────────────
      try {
        await this.computeAndStoreSnapshot(now);
        snapshotStored = true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`Error storing snapshot: ${message}`);
      }
    } finally {
      const durationMs = Date.now() - startTime;
      this.lastRunAt = new Date().toISOString();
      this.lastDurationMs = durationMs;
      this.lastCertificatesEvaluated = certificatesEvaluated;
      this.lastAlertsCreated = alertsCreated;
      this.isRunning = false;

      // Store log entry
      const logEntry: SchedulerLogEntry = {
        timestamp: this.lastRunAt,
        certificatesEvaluated,
        alertsCreated,
        alertsSkipped,
        durationMs,
        snapshotStored,
        errors,
      };
      this.recentLogs.unshift(logEntry);
      if (this.recentLogs.length > this.maxLogEntries) {
        this.recentLogs.pop();
      }
    }

    return {
      certificatesEvaluated,
      alertsCreated,
      alertsSkipped,
      snapshotStored,
      durationMs: Date.now() - startTime,
      errors,
    };
  }

  /**
   * Returns last execution time, duration, certs evaluated, alerts created.
   */
  getStatus(): SchedulerStatus {
    return {
      lastRunAt: this.lastRunAt,
      lastDurationMs: this.lastDurationMs,
      lastCertificatesEvaluated: this.lastCertificatesEvaluated,
      lastAlertsCreated: this.lastAlertsCreated,
      isRunning: this.isRunning,
    };
  }

  /**
   * Returns recent execution log entries.
   */
  getLogs(): SchedulerLogEntry[] {
    return [...this.recentLogs];
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Find the effective policy for a given zone.
   *
   * Resolution order:
   * 1. Zone-specific default policy (matching zoneId, isDefault=true)
   * 2. Global default policy (zoneId IS NULL, isDefault=true)
   * 3. null — use hardcoded DEFAULT_THRESHOLDS
   */
  private async findEffectivePolicy(
    zone: string | null,
  ): Promise<{ thresholds: string } | null> {
    // Try zone-specific policy first
    if (zone) {
      const zonePolicy = await this.prisma.expirationPolicy.findFirst({
        where: { zoneId: zone, isDefault: true },
        select: { thresholds: true },
      });
      if (zonePolicy) return zonePolicy;
    }

    // Fall back to global default
    const globalPolicy = await this.prisma.expirationPolicy.findFirst({
      where: { zoneId: null, isDefault: true },
      select: { thresholds: true },
    });

    return globalPolicy;
  }

  /**
   * Parse a policy's thresholds and return enabled threshold values (in days).
   * Falls back to DEFAULT_THRESHOLDS if policy is null or malformed.
   */
  private getEnabledThresholds(
    policy: { thresholds: string } | null,
  ): number[] {
    if (!policy) {
      return [...DEFAULT_THRESHOLDS];
    }

    try {
      const parsed: ParsedThresholds = JSON.parse(policy.thresholds);
      const enabled: number[] = [];

      if (parsed.days_90?.enabled) enabled.push(90);
      if (parsed.days_30?.enabled) enabled.push(30);
      if (parsed.days_7?.enabled) enabled.push(7);
      if (parsed.days_1?.enabled) enabled.push(1);

      return enabled.length > 0 ? enabled : [...DEFAULT_THRESHOLDS];
    } catch {
      return [...DEFAULT_THRESHOLDS];
    }
  }

  /**
   * Upsert an expiration alert.
   *
   * Uses the unique constraint (certificate_id, threshold) for deduplication.
   * Returns true if a new alert was created, false if it already existed.
   */
  private async upsertAlert(data: {
    certificateId: string;
    threshold: number;
    triggeredAt: Date;
    certificateCn: string;
    certificateSans: string[];
    daysUntilExpiryAtAlert: number;
    caName: string;
    owner: string;
    zone: string | null;
    environment: string;
  }): Promise<boolean> {
    return this.withRetry(async () => {
      // Check if an alert already exists for this cert + threshold
      const existing = await this.prisma.expirationAlert.findUnique({
        where: {
          uq_alert_cert_threshold: {
            certificateId: data.certificateId,
            threshold: data.threshold,
          },
        },
        select: { id: true },
      });

      if (existing) {
        return false; // Deduplicated — alert already exists
      }

      await this.prisma.expirationAlert.create({
        data: {
          certificateId: data.certificateId,
          threshold: data.threshold,
          triggeredAt: data.triggeredAt,
          status: 'PENDING',
          certificateCn: data.certificateCn,
          certificateSans: data.certificateSans,
          daysUntilExpiryAtAlert: data.daysUntilExpiryAtAlert,
          caName: data.caName,
          owner: data.owner,
          zone: data.zone,
          environment: data.environment,
        },
      });

      return true;
    });
  }

  /**
   * Compute daily KPI snapshot and upsert into the expiration_snapshots table.
   */
  private async computeAndStoreSnapshot(now: Date): Promise<void> {
    await this.withRetry(async () => {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const d30 = new Date(now.getTime() + 30 * 86_400_000);

      // Aggregate certificate counts
      const [totalManaged, validCount, expiringLessThan30d, expiredOrRevoked] =
        await Promise.all([
          this.prisma.certificate.count(),
          this.prisma.certificate.count({
            where: { status: { in: ['VALID', 'EXPIRING_SOON'] }, notAfter: { gt: now }, revoked: false },
          }),
          this.prisma.certificate.count({
            where: { notAfter: { gt: now, lte: d30 }, revoked: false },
          }),
          this.prisma.certificate.count({
            where: {
              OR: [{ notAfter: { lte: now } }, { revoked: true }],
            },
          }),
        ]);

      // Compute expirations-by-day for the next 90 days
      const expirationsByDay: Record<string, number> = {};
      for (let i = 0; i < 90; i++) {
        const dayStart = new Date(today.getTime() + i * 86_400_000);
        const dayEnd = new Date(dayStart.getTime() + 86_400_000);
        const count = await this.prisma.certificate.count({
          where: {
            notAfter: { gte: dayStart, lt: dayEnd },
            revoked: false,
          },
        });
        if (count > 0) {
          expirationsByDay[i.toString()] = count;
        }
      }

      // Upsert snapshot for today
      await this.prisma.expirationSnapshot.upsert({
        where: { snapshotDate: today },
        update: {
          totalManaged,
          validCount,
          expiringLessThan30d,
          expiredOrRevoked,
          expirationsByDay: JSON.stringify(expirationsByDay),
        },
        create: {
          snapshotDate: today,
          totalManaged,
          validCount,
          expiringLessThan30d,
          expiredOrRevoked,
          expirationsByDay: JSON.stringify(expirationsByDay),
        },
      });
    });
  }

  /**
   * Retry wrapper with exponential backoff for DB operations (AC 1.4).
   *
   * Retries up to MAX_RETRIES times with exponential delay.
   */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;

        if (attempt < this.maxRetries) {
          const delay = this.baseRetryDelayMs * Math.pow(2, attempt);
          console.warn(
            `[SchedulerService] DB operation failed (attempt ${attempt + 1}/${this.maxRetries + 1}), ` +
              `retrying in ${delay}ms: ${err instanceof Error ? err.message : String(err)}`,
          );
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Promisified sleep helper for retry backoff.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
