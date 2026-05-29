import type { PrismaClient, ExpirationSnapshot } from '@prisma/client';
import type { HeatmapData, KpiData, KpiTrend, CriticalAlert, AlertSeverity } from '@certificado-digital/shared';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Raw KPI aggregation result */
export interface RawKpis {
  totalManaged: number;
  validCount: number;
  expiringLessThan30d: number;
  expiredOrRevoked: number;
}

/** Snapshot row mapped from DB */
export interface SnapshotRow {
  id: string;
  snapshotDate: Date;
  totalManaged: number;
  validCount: number;
  expiringLessThan30d: number;
  expiredOrRevoked: number;
  expirationsByDay: string;
  createdAt: Date;
}

/** Heatmap bucket from raw query */
interface HeatmapBucket {
  expiry_date: Date;
  count: bigint;
}

/** Critical alert row from raw query */
interface CriticalAlertRow {
  certificate_cn: string;
  owner: string;
  environment: string | null;
  days_until_expiry_at_alert: number;
}

// ─── Repository class ───────────────────────────────────────────────────────

export class DashboardRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Snapshot CRUD ──────────────────────────────────────────────────────────

  /**
   * Fetch today's snapshot row (if it exists).
   */
  async getLatestSnapshot(): Promise<ExpirationSnapshot | null> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.prisma.expirationSnapshot.findUnique({
      where: { snapshotDate: today },
    });
  }

  /**
   * Upsert snapshot for today.
   * Creates if missing, updates if already exists (idempotent).
   */
  async saveSnapshot(data: {
    totalManaged: number;
    validCount: number;
    expiringLessThan30d: number;
    expiredOrRevoked: number;
    expirationsByDay: string;
  }): Promise<ExpirationSnapshot> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.prisma.expirationSnapshot.upsert({
      where: { snapshotDate: today },
      create: {
        snapshotDate: today,
        totalManaged: data.totalManaged,
        validCount: data.validCount,
        expiringLessThan30d: data.expiringLessThan30d,
        expiredOrRevoked: data.expiredOrRevoked,
        expirationsByDay: data.expirationsByDay,
      },
      update: {
        totalManaged: data.totalManaged,
        validCount: data.validCount,
        expiringLessThan30d: data.expiringLessThan30d,
        expiredOrRevoked: data.expiredOrRevoked,
        expirationsByDay: data.expirationsByDay,
      },
    });
  }

  // ── On-demand KPI aggregation ─────────────────────────────────────────────

  /**
   * Compute KPIs directly from the certificates table.
   *
   * - Total managed: certificates with status VALID or EXPIRING_SOON
   * - Valid: non-revoked certificates whose notAfter > now
   * - Expiring < 30d: notAfter between now and now + 30 days
   * - Expired/Revoked: status EXPIRED or REVOKED
   */
  async computeKpis(): Promise<RawKpis> {
    const now = new Date();
    const in30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [totalManaged, validCount, expiringLessThan30d, expiredOrRevoked] =
      await this.prisma.$transaction([
        // Total managed: VALID or EXPIRING_SOON
        this.prisma.certificate.count({
          where: { status: { in: ['VALID', 'EXPIRING_SOON'] } },
        }),
        // Valid: non-revoked and not yet expired
        this.prisma.certificate.count({
          where: {
            status: { in: ['VALID', 'EXPIRING_SOON'] },
            notAfter: { gt: now },
          },
        }),
        // Expiring within 30 days
        this.prisma.certificate.count({
          where: {
            notAfter: { gte: now, lte: in30d },
            revoked: false,
          },
        }),
        // Expired or revoked
        this.prisma.certificate.count({
          where: { status: { in: ['EXPIRED', 'REVOKED'] } },
        }),
      ]);

    return { totalManaged, validCount, expiringLessThan30d, expiredOrRevoked };
  }

  // ── Heatmap ───────────────────────────────────────────────────────────────

  /**
   * Compute heatmap data: group non-revoked certificates by DATE(notAfter)
   * for the next N days.
   *
   * Returns Record<number, number> where key = day offset from today.
   */
  async computeHeatmap(days: number = 90): Promise<HeatmapData> {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.$queryRaw<HeatmapBucket[]>`
      SELECT DATE(not_after) AS expiry_date, COUNT(*)::bigint AS count
      FROM certificates
      WHERE revoked = false
        AND not_after >= ${now}
        AND not_after < ${futureDate}
      GROUP BY DATE(not_after)
      ORDER BY expiry_date
    `;

    const heatmap: HeatmapData = {};
    for (const row of rows) {
      const expiryDate = new Date(row.expiry_date);
      expiryDate.setHours(0, 0, 0, 0);
      const dayOffset = Math.round(
        (expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
      );
      heatmap[dayOffset] = Number(row.count);
    }

    return heatmap;
  }

  // ── Critical Alerts ───────────────────────────────────────────────────────

  /**
   * Fetch the most critical alerts sorted by daysUntilExpiryAtAlert ASC.
   * Returns lightweight CriticalAlert objects for dashboard display.
   */
  async getCriticalAlerts(limit: number = 5): Promise<CriticalAlert[]> {
    const rows = await this.prisma.$queryRaw<CriticalAlertRow[]>`
      SELECT
        certificate_cn,
        owner,
        environment,
        days_until_expiry_at_alert
      FROM expiration_alerts
      WHERE status IN ('PENDING', 'NOTIFIED')
      ORDER BY days_until_expiry_at_alert ASC
      LIMIT ${limit}
    `;

    return rows.map((row) => ({
      cn: row.certificate_cn,
      owner: row.owner,
      env: row.environment ?? '',
      daysLeft: row.days_until_expiry_at_alert,
      severity: computeSeverity(row.days_until_expiry_at_alert),
    }));
  }

  // ── Trends ────────────────────────────────────────────────────────────────

  /**
   * Compute trend deltas vs the previous snapshot.
   * Returns null if there's no prior snapshot to compare against.
   */
  async computeTrends(daysAgo: number = 7): Promise<KpiData['trends'] | null> {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - daysAgo);
    targetDate.setHours(0, 0, 0, 0);

    // Find the closest previous snapshot (on or before targetDate)
    const previousSnapshot = await this.prisma.expirationSnapshot.findFirst({
      where: { snapshotDate: { lte: targetDate } },
      orderBy: { snapshotDate: 'desc' },
    });

    if (!previousSnapshot) return null;

    // Compute current KPIs for comparison
    const current = await this.computeKpis();

    return {
      totalManaged: buildTrend(current.totalManaged, previousSnapshot.totalManaged),
      validCount: buildTrend(current.validCount, previousSnapshot.validCount),
      expiringLessThan30d: buildTrend(
        current.expiringLessThan30d,
        previousSnapshot.expiringLessThan30d,
      ),
      expiredOrRevoked: buildTrend(
        current.expiredOrRevoked,
        previousSnapshot.expiredOrRevoked,
      ),
    };
  }
}

// ─── Helper functions ─────────────────────────────────────────────────────────

/**
 * Compute severity from days-until-expiry.
 * - critical: <= 7 days (or already expired)
 * - warning:  <= 30 days
 * - info:     > 30 days
 */
export function computeSeverity(daysLeft: number): AlertSeverity {
  if (daysLeft <= 7) return 'critical';
  if (daysLeft <= 30) return 'warning';
  return 'info';
}

/**
 * Build a KpiTrend from current and previous values.
 */
export function buildTrend(current: number, previous: number): KpiTrend {
  const delta = current - previous;
  if (delta > 0) return { direction: 'up', delta };
  if (delta < 0) return { direction: 'down', delta: Math.abs(delta) };
  return { direction: 'stable', delta: 0 };
}
