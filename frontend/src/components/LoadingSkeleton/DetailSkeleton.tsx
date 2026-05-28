import styles from './Skeleton.module.css';

/**
 * Skeleton loader for the certificate detail page.
 * Shows animated placeholder blocks while certificate data is loading.
 */
export function DetailSkeleton() {
  return (
    <div className={styles.detailWrap}>
      {/* Breadcrumb */}
      <div className={`${styles.skeleton} ${styles.breadcrumbSkeleton}`} />

      {/* Header card */}
      <div className={styles.detailHeader}>
        <div className={`${styles.skeleton} ${styles.titleSkeleton}`} />
        <div className={`${styles.skeleton} ${styles.badgeSkeleton}`} />

        {/* Info grid */}
        <div className={styles.infoGrid}>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={styles.infoItem}>
              <div className={`${styles.skeleton} ${styles.labelSkeleton}`} />
              <div className={`${styles.skeleton} ${styles.valueSkeleton}`} />
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className={styles.actionRow}>
          <div className={`${styles.skeleton} ${styles.buttonSkeleton}`} />
          <div className={`${styles.skeleton} ${styles.buttonSkeleton}`} />
          <div className={`${styles.skeleton} ${styles.buttonSkeleton}`} />
        </div>
      </div>
    </div>
  );
}
