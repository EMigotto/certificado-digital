/**
 * LastUpdatedBanner — shows auto-refresh status in the dashboard section header.
 *
 * Displays:
 *   - "Auto-refresh 60s" label
 *   - "Última: HH:MM:SS" timestamp
 *   - Subtle spinner while a background refetch is in progress
 *
 * Matches prototype: "Auto-refresh 60s · Última: 14:32:08"
 *
 * AC 4.6: Shows "Last updated: HH:MM:SS" timestamp.
 * AC 4.6: Loading spinner during slow API calls.
 */

import styles from './LastUpdatedBanner.module.css';

interface LastUpdatedBannerProps {
  /** When data was last successfully fetched (null = never) */
  lastUpdated: Date | null;

  /** Whether a background refetch is currently in progress */
  isFetching: boolean;
}

/**
 * Format a Date to HH:MM:SS (24-hour, zero-padded).
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function LastUpdatedBanner({ lastUpdated, isFetching }: LastUpdatedBannerProps) {
  return (
    <div className={styles.banner} aria-live="polite" data-testid="last-updated-banner">
      {isFetching && (
        <div
          className={styles.spinner}
          role="status"
          aria-label="Refreshing data"
          data-testid="refresh-spinner"
        />
      )}
      <span>Auto-refresh 60s</span>
      {lastUpdated && (
        <>
          <span aria-hidden="true">·</span>
          <span className={styles.timestamp} data-testid="last-updated-time">
            Última: {formatTime(lastUpdated)}
          </span>
        </>
      )}
    </div>
  );
}
