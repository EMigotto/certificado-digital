import type { AuditLogEntry } from '@certificado-digital/shared';
import styles from './AuditRow.module.css';

interface AuditRowProps {
  entry: AuditLogEntry;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('pt-BR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const time = d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return `${date} ${time}`;
}

function getInitials(actor: string): string {
  return actor
    .split(/[\s._-]+/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

export function AuditRow({ entry }: AuditRowProps) {
  return (
    <div className={styles.auditRow} data-testid="audit-row">
      <div className={styles.auditTime}>{formatTimestamp(entry.timestamp)}</div>

      <div className={styles.auditActor}>
        <div className={styles.avatar}>{getInitials(entry.actor)}</div>
        <span>{entry.actor}</span>
      </div>

      <div className={styles.auditEvent}>
        <span className={styles.verb}>{entry.action}</span>
        {' → '}
        <span className={styles.target}>{entry.certCn}</span>
        {entry.batchId && <span className={styles.batchId}>batch</span>}
      </div>

      <div
        className={`${styles.auditResult} ${entry.result === 'SUCCESS' ? styles.success : styles.fail}`}
      >
        {entry.result}
      </div>
    </div>
  );
}
