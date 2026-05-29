/**
 * DashboardSkeleton — loading skeleton for the dashboard initial load.
 *
 * Shows animated placeholder cards matching the dashboard layout:
 *   - 4 KPI skeleton cards
 *   - Heatmap skeleton panel
 *   - Alert list skeleton panel
 *
 * Uses the shared Skeleton.module.css shimmer animation.
 *
 * AC 4.6: Loading spinner during slow API calls.
 */

import skeletonStyles from '@/components/LoadingSkeleton/Skeleton.module.css';
import styles from './DashboardSkeleton.module.css';

/** Number of heatmap cells to render (90 days) */
const HEATMAP_CELLS = 90;

/** Number of alert placeholder items */
const ALERT_ITEMS = 5;

export function DashboardSkeleton() {
  return (
    <div data-testid="dashboard-skeleton" role="status" aria-label="Loading dashboard">
      {/* Section header skeleton */}
      <div className={styles.secHead}>
        <div>
          <div className={`${skeletonStyles.skeleton} ${styles.secTitle}`} />
          <div className={`${skeletonStyles.skeleton} ${styles.secTag}`} />
        </div>
        <div className={`${skeletonStyles.skeleton} ${styles.secRefresh}`} />
      </div>

      {/* KPI cards skeleton */}
      <div className={styles.kpiGrid}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={styles.kpiCard}>
            <div className={`${skeletonStyles.skeleton} ${styles.kpiLabel}`} />
            <div className={`${skeletonStyles.skeleton} ${styles.kpiValue}`} />
            <div className={`${skeletonStyles.skeleton} ${styles.kpiMeta}`} />
          </div>
        ))}
      </div>

      {/* Panels row: heatmap + alerts */}
      <div className={styles.panelGrid}>
        {/* Heatmap panel skeleton */}
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div className={`${skeletonStyles.skeleton} ${styles.panelTitle}`} />
            <div className={`${skeletonStyles.skeleton} ${styles.panelSub}`} />
          </div>
          <div className={styles.heatmapGrid}>
            {Array.from({ length: HEATMAP_CELLS }, (_, i) => (
              <div key={i} className={`${skeletonStyles.skeleton} ${styles.heatCell}`} />
            ))}
          </div>
          <div className={styles.heatmapAxis}>
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className={`${skeletonStyles.skeleton} ${styles.axisLabel}`} />
            ))}
          </div>
        </div>

        {/* Alert list panel skeleton */}
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div className={`${skeletonStyles.skeleton} ${styles.panelTitle}`} />
            <div className={`${skeletonStyles.skeleton} ${styles.panelSub}`} />
          </div>
          <div className={styles.alertList}>
            {Array.from({ length: ALERT_ITEMS }, (_, i) => (
              <div key={i} className={styles.alertItem}>
                <div className={styles.alertContent}>
                  <div className={`${skeletonStyles.skeleton} ${styles.alertCn}`} />
                  <div className={`${skeletonStyles.skeleton} ${styles.alertMeta}`} />
                </div>
                <div className={`${skeletonStyles.skeleton} ${styles.alertDays}`} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
