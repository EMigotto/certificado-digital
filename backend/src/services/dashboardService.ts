import type { DashboardSnapshot, KpiData, HeatmapData, CriticalAlert } from '@certificado-digital/shared';
import { DashboardRepository } from '../repositories/dashboardRepo.js';

// ─── Cache config ───────────────────────────────────────────────────────────

/** Maximum age (in ms) before a cached snapshot is considered stale. */
const SNAPSHOT_TTL_MS = 30_000; // 30 seconds

// ─── In-memory cache ────────────────────────────────────────────────────────

interface CachedSnapshot {
  snapshot: DashboardSnapshot;
  cachedAt: number; // Date.now()
}

let snapshotCache: CachedSnapshot | null = null;

// ─── Service class ──────────────────────────────────────────────────────────

export class DashboardService {
  constructor(private readonly repo: DashboardRepository) {}

  /**
   * Get the full dashboard snapshot: KPIs + heatmap + critical alerts + trends.
   *
   * Uses a 30-second in-memory cache (AC 4.7: < 2s query SLA).
   * If the cache is stale or empty, recomputes on demand.
   */
  async getSnapshot(): Promise<DashboardSnapshot> {
    // Check in-memory cache first
    if (snapshotCache && Date.now() - snapshotCache.cachedAt < SNAPSHOT_TTL_MS) {
      return snapshotCache.snapshot;
    }

    // Compute everything in parallel for performance
    const [rawKpis, heatmap, alerts, trends] = await Promise.all([
      this.repo.computeKpis(),
      this.repo.computeHeatmap(90),
      this.repo.getCriticalAlerts(5),
      this.repo.computeTrends(7),
    ]);

    const kpis: KpiData = {
      totalManaged: rawKpis.totalManaged,
      validCount: rawKpis.validCount,
      expiringLessThan30d: rawKpis.expiringLessThan30d,
      expiredOrRevoked: rawKpis.expiredOrRevoked,
      trends: trends ?? {
        totalManaged: { direction: 'stable', delta: 0 },
        validCount: { direction: 'stable', delta: 0 },
        expiringLessThan30d: { direction: 'stable', delta: 0 },
        expiredOrRevoked: { direction: 'stable', delta: 0 },
      },
    };

    const snapshot: DashboardSnapshot = {
      kpis,
      heatmap,
      alerts,
      generatedAt: new Date().toISOString(),
    };

    // Cache the result
    snapshotCache = { snapshot, cachedAt: Date.now() };

    return snapshot;
  }

  /**
   * Get detailed heatmap data for a custom number of days.
   *
   * Unlike getSnapshot(), this always queries live data since the caller
   * may request a different day range than the cached default (90).
   */
  async getHeatmap(days: number = 90): Promise<HeatmapData> {
    return this.repo.computeHeatmap(days);
  }

  /**
   * Get the most critical alerts, always live (alerts change frequently).
   *
   * Sorted by daysUntilExpiryAtAlert ASC (most urgent first).
   */
  async getCriticalAlerts(limit: number = 5): Promise<CriticalAlert[]> {
    return this.repo.getCriticalAlerts(limit);
  }

  /**
   * Refresh the cached snapshot and persist it to the database.
   *
   * Called by the scheduler after the daily evaluation job completes.
   * This ensures that subsequent dashboard queries use fresh data.
   */
  async refreshSnapshot(): Promise<DashboardSnapshot> {
    // Invalidate in-memory cache
    snapshotCache = null;

    // Compute fresh KPIs and heatmap
    const [rawKpis, heatmap] = await Promise.all([
      this.repo.computeKpis(),
      this.repo.computeHeatmap(90),
    ]);

    // Persist snapshot to DB for historical trend calculations
    await this.repo.saveSnapshot({
      totalManaged: rawKpis.totalManaged,
      validCount: rawKpis.validCount,
      expiringLessThan30d: rawKpis.expiringLessThan30d,
      expiredOrRevoked: rawKpis.expiredOrRevoked,
      expirationsByDay: JSON.stringify(heatmap),
    });

    // Return a full fresh snapshot (this also re-populates the cache)
    return this.getSnapshot();
  }

  /**
   * Clear the in-memory cache (useful for testing).
   */
  clearCache(): void {
    snapshotCache = null;
  }
}

// ─── Exported for testing ─────────────────────────────────────────────────────

/**
 * Reset the module-level cache. Useful in unit tests.
 */
export function _resetSnapshotCache(): void {
  snapshotCache = null;
}
