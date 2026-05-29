import { useDashboardSnapshot } from '@/hooks/useDashboardSnapshot';
import { KpiGrid } from './components/KpiGrid';
import { HeatmapPanel } from './components/HeatmapPanel';
import { CriticalAlertsPanel } from './components/CriticalAlertsPanel';
import { formatDateTime } from '@/utils/formatters';
import styles from './DashboardPage.module.css';

/**
 * Main Dashboard page component.
 *
 * Renders the section header ("01 · Dashboard de expiração"), KPI grid,
 * 90-day expiration heatmap, and critical alerts panel.
 * Uses useDashboardSnapshot() hook for data fetching via TanStack Query.
 */
export default function DashboardPage() {
  const { data: snapshot, isLoading, isError, refetch } = useDashboardSnapshot();

  // Format the "last refresh" timestamp
  const lastRefresh = snapshot
    ? formatDateTime(snapshot.generatedAt)
    : '—';

  return (
    <section className={styles.dashboardSection} id="dashboard">
      {/* Section header — matches prototype exactly */}
      <div className={styles.secHead}>
        <div>
          <div className={styles.secTitle}>
            01 · <em className={styles.secTitleEm}>Dashboard</em> de expiração
          </div>
          <div className={styles.secTag} style={{ marginTop: 8 }}>
            Tela inicial — heatmap, KPIs e alertas críticos
            <span className={styles.secTagCap}>C3 · Monitoring &amp; Alerts</span>
          </div>
        </div>
        <div className={styles.secTag}>
          Auto-refresh 60s · Última: {lastRefresh}
        </div>
      </div>

      {/* KPI Grid — loading skeleton */}
      {isLoading && (
        <>
          <div className={styles.kpiGrid} data-testid="kpi-loading">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={styles.kpiSkeleton} />
            ))}
          </div>
          <div className={styles.grid2} data-testid="panels-loading">
            <div className={styles.skeletonPanel} />
            <div className={styles.skeletonPanel} />
          </div>
        </>
      )}

      {/* Error state */}
      {isError && (
        <div className={styles.errorState} data-testid="kpi-error">
          <p>Erro ao carregar métricas do dashboard.</p>
          <button className={styles.retryButton} onClick={() => refetch()}>
            Tentar novamente
          </button>
        </div>
      )}

      {/* Loaded state: KPI cards + Heatmap + Critical alerts */}
      {snapshot && (
        <>
          <KpiGrid snapshot={snapshot} />

          <div className={styles.grid2}>
            <HeatmapPanel heatmapData={snapshot.heatmap} />
            <CriticalAlertsPanel
              alerts={snapshot.alerts}
              totalCount={snapshot.alerts.length}
            />
          </div>
        </>
      )}
    </section>
  );
}
