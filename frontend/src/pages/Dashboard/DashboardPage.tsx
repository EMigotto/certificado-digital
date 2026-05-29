/**
 * DashboardPage — Expiration monitoring dashboard (C3).
 *
 * Displays KPI cards, 90-day expiration heatmap, and critical alerts.
 * Features:
 *   - 60-second auto-refresh via useDashboardSnapshot and useCriticalAlerts
 *   - Proper loading skeleton on initial load (DashboardSkeleton)
 *   - Inline error banner with retry on API failure (DashboardError)
 *   - "Last updated" timestamp with background refresh spinner (LastUpdatedBanner)
 *
 * AC 4.6: Dashboard auto-refreshes every 60 seconds without page reload.
 * AC 4.6: Shows "Last updated: HH:MM:SS" timestamp.
 * AC 4.6: Loading spinner during slow API calls.
 * AC 4.6: Error banner on API failure without crash.
 * AC 4.6: Page remains interactive during refresh.
 */

import { useDashboardSnapshot } from '@/hooks/useDashboardSnapshot';
import { useCriticalAlerts } from '@/hooks/useCriticalAlerts';
import { KpiGrid } from './components/KpiGrid';
import { HeatmapPanel } from './components/HeatmapPanel';
import { CriticalAlertsPanel } from './components/CriticalAlertsPanel';
import { LastUpdatedBanner } from './components/LastUpdatedBanner';
import { DashboardSkeleton } from './components/DashboardSkeleton';
import { DashboardError } from './components/DashboardError';
import styles from './DashboardPage.module.css';

export default function DashboardPage() {
  const snapshot = useDashboardSnapshot();
  const alerts = useCriticalAlerts();

  // Initial load → show full-page skeleton
  if (snapshot.isLoading) {
    return <DashboardSkeleton />;
  }

  // Combined fetching state for the banner spinner
  const isFetching = snapshot.isFetching || alerts.isFetching;

  // Handle retry for both queries
  const handleRetry = () => {
    void snapshot.refetch();
    void alerts.refetch();
  };

  return (
    <section className={styles.dashboardSection} id="dashboard" data-testid="dashboard-page">
      {/* Section header — matches prototype */}
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
        <LastUpdatedBanner
          lastUpdated={snapshot.lastUpdated}
          isFetching={isFetching}
        />
      </div>

      {/* Error banner (non-blocking — page stays interactive) */}
      {snapshot.isError && (
        <DashboardError
          error={snapshot.error}
          onRetry={handleRetry}
          isRetrying={isFetching}
        />
      )}

      {/* Alert-specific error (only if snapshot succeeded but alerts failed) */}
      {!snapshot.isError && alerts.isError && (
        <DashboardError
          error={alerts.error}
          onRetry={() => void alerts.refetch()}
          isRetrying={alerts.isFetching}
        />
      )}

      {/* Dashboard content — render with whatever data is available */}
      {snapshot.data && (
        <>
          <KpiGrid snapshot={snapshot.data} />

          <div className={styles.grid2}>
            <HeatmapPanel heatmapData={snapshot.data.heatmap} />
            <CriticalAlertsPanel
              alerts={alerts.data.length > 0 ? alerts.data : snapshot.data.alerts}
              totalCount={
                alerts.data.length > 0
                  ? alerts.data.length
                  : snapshot.data.alerts.length
              }
            />
          </div>
        </>
      )}
    </section>
  );
}
