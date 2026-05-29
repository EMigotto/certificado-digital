/**
 * DashboardError — inline error banner for the dashboard.
 *
 * Shows an error banner when the API call fails, without crashing the page.
 * The page remains interactive during error state; user can retry manually.
 *
 * AC 4.6: Error banner on API failure without crash.
 * AC 4.6: Page remains interactive during refresh.
 */

import { getApiErrorMessage } from '@/services/api';
import styles from './DashboardError.module.css';

interface DashboardErrorProps {
  /** The error object from the failed API call */
  error: Error | null;

  /** Callback to manually retry the failed request */
  onRetry: () => void;

  /** Whether a retry is currently in progress */
  isRetrying?: boolean;
}

export function DashboardError({ error, onRetry, isRetrying = false }: DashboardErrorProps) {
  const message = error ? getApiErrorMessage(error) : 'Erro ao carregar dados do dashboard.';

  return (
    <div
      className={styles.banner}
      role="alert"
      aria-label="Dashboard error"
      data-testid="dashboard-error"
    >
      <div className={styles.iconWrap}>
        <svg width="24" height="24" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      <div className={styles.content}>
        <div className={styles.title}>Failed to load dashboard data</div>
        <div className={styles.message}>{message}</div>
      </div>

      <button
        className={styles.retryBtn}
        onClick={onRetry}
        disabled={isRetrying}
        data-testid="dashboard-retry-btn"
      >
        <svg width="14" height="14" viewBox="0 0 24 24">
          <path d="M23 4v6h-6" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
        {isRetrying ? 'Retrying...' : 'Retry'}
      </button>
    </div>
  );
}
