import { useNavigate } from 'react-router-dom';
import type { CriticalAlert } from '@certificado-digital/shared';
import { AlertItem } from './AlertItem';
import styles from './CriticalAlertsPanel.module.css';

export interface CriticalAlertsPanelProps {
  alerts: CriticalAlert[];
  totalCount: number;
}

/**
 * Right-side panel showing the top 5 most urgent certificate alerts.
 *
 * Shows "5 of N critical alerts →" link when there are more than 5 alerts total.
 * Matches the prototype's "Alertas críticos" / "Top 5" panel exactly.
 */
export function CriticalAlertsPanel({ alerts, totalCount }: CriticalAlertsPanelProps) {
  const navigate = useNavigate();

  const handleViewAll = () => {
    void navigate('/certificates?expiresIn=<30d');
  };

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <div className={styles.panelTitle}>Alertas críticos</div>
        <div className={styles.panelSub}>Top {Math.min(alerts.length, 5)}</div>
      </div>

      {alerts.length === 0 ? (
        <div className={styles.empty}>Nenhum alerta crítico</div>
      ) : (
        <div className={styles.alertList}>
          {alerts.slice(0, 5).map((alert, index) => (
            <AlertItem key={`${alert.cn}-${index}`} alert={alert} />
          ))}
        </div>
      )}

      {totalCount > 5 && (
        <div
          className={styles.countLink}
          onClick={handleViewAll}
          role="link"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleViewAll();
            }
          }}
        >
          5 of {totalCount} critical alerts →
        </div>
      )}
    </div>
  );
}
