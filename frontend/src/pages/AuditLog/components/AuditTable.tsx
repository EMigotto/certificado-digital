import type { AuditLogEntry } from '@certificado-digital/shared';
import { AuditRow } from './AuditRow';
import styles from './AuditRow.module.css';

interface AuditTableProps {
  entries: AuditLogEntry[];
}

export function AuditTable({ entries }: AuditTableProps) {
  return (
    <div>
      {/* Header */}
      <div className={styles.headerRow}>
        <div className={styles.headerCell}>Timestamp</div>
        <div className={styles.headerCell}>Ator</div>
        <div className={styles.headerCell}>Evento</div>
        <div className={styles.headerCell}>Resultado</div>
      </div>

      {/* Rows */}
      {entries.map((entry) => (
        <AuditRow key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
