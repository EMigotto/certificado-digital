import { useNavigate } from 'react-router-dom';
import type { CriticalAlert } from '@certificado-digital/shared';
import styles from './AlertItem.module.css';

export interface AlertItemProps {
  alert: CriticalAlert;
}

/**
 * Single alert row inside the CriticalAlertsPanel.
 *
 * Displays CN, meta (env · CA · owner), and days-left badge.
 * Colored left border: red for ≤ 7 days (critical), yellow for ≤ 30 days (warning).
 * Click navigates to the certificate search filtered by CN.
 */
export function AlertItem({ alert }: AlertItemProps) {
  const navigate = useNavigate();

  const isCritical = alert.severity === 'critical' || alert.daysLeft <= 7;
  const severityClass = isCritical ? styles.crit : styles.warn;
  const daysClass = isCritical ? styles.daysCrit : styles.daysWarn;

  const handleClick = () => {
    // Navigate to filtered inventory since CriticalAlert doesn't include certId
    void navigate(`/certificates?q=${encodeURIComponent(alert.cn)}`);
  };

  return (
    <div
      className={`${styles.alert} ${severityClass}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <div className={styles.alertContent}>
        <div className={styles.alertCn}>{alert.cn}</div>
        <div className={styles.alertMeta}>
          {alert.env} · {alert.owner}
        </div>
      </div>
      <div className={`${styles.alertDays} ${daysClass}`}>
        {alert.daysLeft}d
      </div>
    </div>
  );
}
