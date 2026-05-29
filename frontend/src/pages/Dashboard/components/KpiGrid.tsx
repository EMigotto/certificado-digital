import type { DashboardSnapshot } from '@certificado-digital/shared';
import { KpiCard } from './KpiCard';
import styles from '../DashboardPage.module.css';

export interface KpiGridProps {
  snapshot: DashboardSnapshot;
}

/**
 * Renders 4 KPI metric cards in a CSS grid (4 columns).
 *
 * Maps the DashboardSnapshot KPI data to individual KpiCard props,
 * matching the approved prototype layout and copy exactly.
 */
export function KpiGrid({ snapshot }: KpiGridProps) {
  const { kpis } = snapshot;

  // Calculate percentage for "valid" card meta
  const validPercent =
    kpis.totalManaged > 0
      ? ((kpis.validCount / kpis.totalManaged) * 100).toFixed(1)
      : '0.0';

  return (
    <div className={styles.kpiGrid}>
      {/* Total managed */}
      <KpiCard
        label="Total gerenciados"
        value={kpis.totalManaged}
        severity="ok"
        trend={{
          direction: kpis.trends.totalManaged.direction,
          delta: kpis.trends.totalManaged.delta,
          text: 'nos últimos 7d',
        }}
      />

      {/* Valid */}
      <KpiCard
        label="Válidos"
        value={kpis.validCount}
        severity="neutral"
        metaText={`${validPercent}% do inventário`}
      />

      {/* Expiring < 30d */}
      <KpiCard
        label="Expiram < 30 dias"
        value={kpis.expiringLessThan30d}
        severity="warn"
        trend={{
          direction: kpis.trends.expiringLessThan30d.direction,
          delta: kpis.trends.expiringLessThan30d.delta,
          text: 'vs. ontem',
        }}
      />

      {/* Expired / Revoked */}
      <KpiCard
        label="Vencidos / Revogados"
        value={kpis.expiredOrRevoked}
        severity="crit"
        metaText={`${kpis.expiredOrRevoked} vencidos · revogados`}
      />
    </div>
  );
}
