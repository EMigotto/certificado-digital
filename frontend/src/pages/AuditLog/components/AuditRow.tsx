import type { AuditLogEntry, AuditAction, LifecycleAuditDetails } from '@certificado-digital/shared';
import styles from './AuditRow.module.css';

interface AuditRowProps {
  entry: AuditLogEntry;
}

/** Lifecycle actions that get enhanced detail display */
const LIFECYCLE_ACTIONS: Set<AuditAction> = new Set([
  'ISSUE',
  'RENEW',
  'REVOKE',
  'KEY_ROTATED',
  'NOTIFICATION_SENT',
]);

/** Color class for action badges */
const ACTION_BADGE_CLASS: Partial<Record<AuditAction, string>> = {
  ISSUE: styles.verbOk,
  CREATE: styles.verbOk,
  RENEW: styles.verbBlue,
  REVOKE: styles.verbCrit,
  DELETE: styles.verbCrit,
  KEY_ROTATED: styles.verbRev,
  NOTIFICATION_SENT: styles.verbMute,
};

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

/** Renders lifecycle-specific detail below the main event text */
function LifecycleDetails({ action, details }: { action: AuditAction; details: LifecycleAuditDetails }) {
  const parts: string[] = [];

  switch (action) {
    case 'ISSUE':
      if (details.caName) parts.push(`CA: ${details.caName}`);
      if (details.algorithm) parts.push(details.algorithm);
      if (details.cn) parts.push(`CN: ${details.cn}`);
      break;
    case 'RENEW':
      if (details.oldCertId && details.newCertId)
        parts.push(`${details.oldCertId.slice(0, 8)}… → ${details.newCertId.slice(0, 8)}…`);
      if (details.rotateKey) parts.push('key rotated');
      break;
    case 'REVOKE':
      if (details.reasonCode) parts.push(`reason: ${details.reasonCode}`);
      if (details.justification) parts.push(details.justification);
      break;
    case 'KEY_ROTATED':
      if (details.oldAlgorithm && details.newAlgorithm)
        parts.push(`${details.oldAlgorithm} → ${details.newAlgorithm}`);
      break;
    case 'NOTIFICATION_SENT':
      if (details.recipient) parts.push(`to: ${details.recipient}`);
      if (details.subject) parts.push(details.subject);
      break;
  }

  if (parts.length === 0) return null;

  return (
    <span className={styles.lifecycleDetail} data-testid="lifecycle-details">
      {' · '}
      {parts.join(' · ')}
    </span>
  );
}

export function AuditRow({ entry }: AuditRowProps) {
  const isLifecycle = LIFECYCLE_ACTIONS.has(entry.action);
  const verbClass = ACTION_BADGE_CLASS[entry.action] ?? '';

  return (
    <div className={styles.auditRow} data-testid="audit-row">
      <div className={styles.auditTime}>{formatTimestamp(entry.timestamp)}</div>

      <div className={styles.auditActor}>
        <div className={styles.avatar}>{getInitials(entry.actor)}</div>
        <span>{entry.actor}</span>
      </div>

      <div className={styles.auditEvent}>
        <span className={`${styles.verb} ${verbClass}`}>{entry.action}</span>
        {' → '}
        <span className={styles.target}>{entry.certCn}</span>
        {entry.batchId && <span className={styles.batchId}>batch</span>}
        {isLifecycle && entry.lifecycleDetails && (
          <LifecycleDetails action={entry.action} details={entry.lifecycleDetails} />
        )}
      </div>

      <div
        className={`${styles.auditResult} ${entry.result === 'SUCCESS' ? styles.success : styles.fail}`}
      >
        {entry.result}
      </div>
    </div>
  );
}
