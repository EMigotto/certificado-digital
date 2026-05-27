/**
 * ProgressBar — import progress indicator.
 */

import styles from '../BulkImportPage.module.css';

interface ProgressBarProps {
  /** Progress percentage (0–100) */
  progress: number;
  /** Status message */
  message?: string;
  /** Whether the import is complete */
  complete?: boolean;
}

export function ProgressBar({ progress, message, complete }: ProgressBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div className={styles.progressPanel}>
      <div className={styles.progressTitle}>
        {complete ? (
          <svg width="18" height="18" viewBox="0 0 24 24" style={{ color: 'var(--ok)' }}>
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        ) : (
          <span className={styles.spinner} />
        )}
        {complete ? 'Importação concluída' : 'Importando certificados...'}
      </div>

      <div className={styles.progressTrack}>
        <div className={styles.progressFill} style={{ width: `${clampedProgress}%` }} />
      </div>

      <div className={styles.progressMeta}>
        <span>{message ?? 'Processando...'}</span>
        <span>{clampedProgress}%</span>
      </div>
    </div>
  );
}
