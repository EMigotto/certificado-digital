import styles from './SanList.module.css';

interface SanListProps {
  sans: string[];
}

export function SanList({ sans }: SanListProps) {
  if (sans.length === 0) {
    return (
      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <span className={styles.panelTitle}>Subject Alternative Names</span>
          <span className={styles.count}>0</span>
        </div>
        <div className={styles.empty}>Nenhum SAN registrado</div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>Subject Alternative Names</span>
        <span className={styles.count}>{sans.length}</span>
      </div>
      <div className={styles.list} data-testid="san-list">
        {sans.map((san, i) => (
          <div key={i} className={styles.sanItem}>
            <span className={styles.sanIndex}>{String(i + 1).padStart(2, '0')}</span>
            <span className={styles.sanValue}>{san}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
