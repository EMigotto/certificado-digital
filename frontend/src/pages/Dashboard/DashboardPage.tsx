import { useDashboardSnapshot } from '@/hooks/useDashboardSnapshot';
import { KpiGrid } from './components/KpiGrid';
import { formatDateTime } from '@/utils/formatters';
import styles from './DashboardPage.module.css';

/**
 * Main Dashboard page component.
 *
 * Renders the section header ("01 · Dashboard de expiração") and the KPI grid.
 * Uses useDashboardSnapshot() hook for data fetching via TanStack Query.
 *
 * Future chunks will add heatmap and critical alerts below the KPI grid.
 */
export default function DashboardPage() {
  const { data: snapshot, isLoading, isError, refetch } = useDashboardSnapshot();

  // Format the "last refresh" timestamp
  const lastRefresh = snapshot
    ? formatDateTime(snapshot.generatedAt)
    : '—';

  return (
    <section className={styles.dashboardSection}>
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

      {/* KPI Grid */}
      {isLoading && (
        <div className={styles.kpiGrid} data-testid="kpi-loading">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={styles.kpiSkeleton} />
          ))}
        </div>
      )}

      {isError && (
        <div className={styles.errorState} data-testid="kpi-error">
          <p>Erro ao carregar métricas do dashboard.</p>
          <button className={styles.retryButton} onClick={() => refetch()}>
            Tentar novamente
          </button>
        </div>
      )}

      {snapshot && <KpiGrid snapshot={snapshot} />}
    </section>
  );
}
