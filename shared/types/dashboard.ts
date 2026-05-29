/**
 * Expiration monitoring dashboard types.
 *
 * Used by both the frontend dashboard view and the backend snapshot endpoints.
 */

// ─── KPI Data ──────────────────────────────────────────────────────────────

/** Trend direction indicator for KPI metrics */
export type TrendDirection = 'up' | 'down' | 'stable';

/** Trend metadata for a single KPI metric */
export interface KpiTrend {
  /** Direction of change compared to previous period */
  direction: TrendDirection;

  /** Absolute change value */
  delta: number;
}

/** Key Performance Indicator data for the monitoring dashboard */
export interface KpiData {
  /** Total number of managed certificates */
  totalManaged: number;

  /** Certificates currently valid */
  validCount: number;

  /** Certificates expiring within the next 30 days */
  expiringLessThan30d: number;

  /** Certificates that are expired or revoked */
  expiredOrRevoked: number;

  /** Trend indicators per metric (compared to previous snapshot) */
  trends: {
    totalManaged: KpiTrend;
    validCount: KpiTrend;
    expiringLessThan30d: KpiTrend;
    expiredOrRevoked: KpiTrend;
  };
}

// ─── Heatmap ───────────────────────────────────────────────────────────────

/**
 * Heatmap data mapping day offsets to expiration counts.
 *
 * Key: number of days from today (positive = future expiry).
 * Value: number of certificates expiring on that day.
 */
export type HeatmapData = Record<number, number>;

// ─── Critical Alert ────────────────────────────────────────────────────────

/** Severity level for dashboard critical alerts */
export type AlertSeverity = 'critical' | 'warning' | 'info';

/** Lightweight alert summary for dashboard display */
export interface CriticalAlert {
  /** Certificate common name */
  cn: string;

  /** Certificate owner */
  owner: string;

  /** Deployment environment */
  env: string;

  /** Days remaining until expiry (negative = already expired) */
  daysLeft: number;

  /** Severity classification */
  severity: AlertSeverity;
}

// ─── Dashboard Snapshot ────────────────────────────────────────────────────

/** Combined dashboard response: KPIs + heatmap + critical alerts */
export interface DashboardSnapshot {
  /** KPI metrics */
  kpis: KpiData;

  /** Expiration heatmap (day offset → count) */
  heatmap: HeatmapData;

  /** List of most critical upcoming alerts */
  alerts: CriticalAlert[];

  /** When this snapshot was generated (ISO-8601) */
  generatedAt: string;
}
