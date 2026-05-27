import styles from './Skeleton.module.css';

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

/**
 * Skeleton loader for the certificate inventory table.
 * Shows animated placeholder rows while data is loading.
 */
export function TableSkeleton({ rows = 5, columns = 6 }: TableSkeletonProps) {
  return (
    <div className={styles.tableWrap}>
      {/* Header */}
      <div className={styles.tableHeader}>
        {Array.from({ length: columns }, (_, i) => (
          <div key={i} className={styles.headerCell}>
            <div className={`${styles.skeleton} ${styles.headerSkeleton}`} />
          </div>
        ))}
      </div>

      {/* Rows */}
      {Array.from({ length: rows }, (_, rowIdx) => (
        <div key={rowIdx} className={styles.tableRow}>
          {Array.from({ length: columns }, (_, colIdx) => (
            <div key={colIdx} className={styles.cell}>
              <div
                className={`${styles.skeleton} ${styles.cellSkeleton}`}
                style={{ width: colIdx === 0 ? '80%' : `${40 + Math.random() * 40}%` }}
              />
              {colIdx === 0 && (
                <div
                  className={`${styles.skeleton} ${styles.cellSkeletonSmall}`}
                  style={{ width: '50%', marginTop: '6px' }}
                />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
