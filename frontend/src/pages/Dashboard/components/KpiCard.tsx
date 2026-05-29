import type { TrendDirection } from '@certificado-digital/shared';
import { formatNumber } from '@/utils/formatters';
import styles from '../DashboardPage.module.css';

/** Severity level determines the top-bar color of the KPI card */
export type KpiSeverity = 'ok' | 'warn' | 'crit' | 'neutral';

/** Trend info rendered as a delta badge in the meta line */
export interface KpiTrendDisplay {
  direction: TrendDirection;
  delta: number;
  text: string;
}

export interface KpiCardProps {
  /** Uppercase label above the value */
  label: string;
  /** Numeric metric value (formatted with locale thousands separator) */
  value: number;
  /** Color-coded severity for the top bar */
  severity: KpiSeverity;
  /** Optional trend delta + description text */
  trend?: KpiTrendDisplay;
  /** Optional plain meta text (used when no trend delta is shown) */
  metaText?: string;
}

/**
 * Single KPI card matching the approved prototype exactly.
 *
 * Renders a color-coded top bar, mono uppercase label, large serif value,
 * and a trend meta line with optional delta arrow.
 */
export function KpiCard({ label, value, severity, trend, metaText }: KpiCardProps) {
  const severityClass = severity !== 'neutral' ? styles[severity] : '';
  const cardClasses = [styles.kpi, severityClass].filter(Boolean).join(' ');

  return (
    <div className={cardClasses} data-testid={`kpi-card-${severity}`}>
      <div className={styles.kpiLabel}>{label}</div>
      <div className={styles.kpiValue}>{formatNumber(value)}</div>
      <div className={styles.kpiMeta}>
        {trend ? (
          <>
            <span
              className={`${styles.delta} ${trend.direction === 'up' ? styles.up : ''} ${trend.direction === 'down' ? styles.down : ''}`}
            >
              {trend.delta >= 0 ? '+' : ''}
              {trend.delta}
            </span>
            {' '}
            {trend.text}
          </>
        ) : (
          metaText
        )}
      </div>
    </div>
  );
}
