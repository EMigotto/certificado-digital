import { Link } from 'react-router-dom';
import type { TimelineEvent, TimelineAction, AuditResult } from '@certificado-digital/shared';
import { useCertificateTimeline } from '@/hooks/useCertificateTimeline';
import styles from './Timeline.module.css';

interface TimelineProps {
  certificateId: string;
}

/** Map action types to human-readable labels */
const ACTION_LABELS: Record<TimelineAction, string> = {
  CREATED: 'Created',
  ISSUED: 'Issued',
  RENEWED: 'Renewed',
  REVOKED: 'Revoked',
  KEY_ROTATED: 'Key Rotated',
  NOTIFICATION_SENT: 'Notification',
};

/** Map action types to CSS class names for color coding */
const ACTION_CSS: Record<TimelineAction, string> = {
  CREATED: 'created',
  ISSUED: 'issued',
  RENEWED: 'renewed',
  REVOKED: 'revoked',
  KEY_ROTATED: 'keyRotated',
  NOTIFICATION_SENT: 'notificationSent',
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

/** Render lifecycle-specific detail lines */
function renderEventDetails(event: TimelineEvent): React.ReactNode {
  const d = event.details;
  if (!d || Object.keys(d).length === 0) return null;

  const lines: Array<{ key: string; value: string }> = [];

  switch (event.action) {
    case 'CREATED':
    case 'ISSUED':
      if (d.caName) lines.push({ key: 'CA', value: String(d.caName) });
      if (d.algorithm) lines.push({ key: 'Algorithm', value: String(d.algorithm) });
      if (d.cn) lines.push({ key: 'CN', value: String(d.cn) });
      break;
    case 'RENEWED':
      if (d.oldCertId) lines.push({ key: 'Old cert', value: String(d.oldCertId) });
      if (d.newCertId) lines.push({ key: 'New cert', value: String(d.newCertId) });
      if (d.rotateKey !== undefined)
        lines.push({ key: 'Key rotated', value: d.rotateKey ? 'yes' : 'no' });
      break;
    case 'REVOKED':
      if (d.reasonCode) lines.push({ key: 'Reason', value: String(d.reasonCode) });
      if (d.justification)
        lines.push({ key: 'Justification', value: String(d.justification) });
      break;
    case 'KEY_ROTATED':
      if (d.oldAlgorithm) lines.push({ key: 'From', value: String(d.oldAlgorithm) });
      if (d.newAlgorithm) lines.push({ key: 'To', value: String(d.newAlgorithm) });
      break;
    case 'NOTIFICATION_SENT':
      if (d.recipient) lines.push({ key: 'To', value: String(d.recipient) });
      if (d.subject) lines.push({ key: 'Subject', value: String(d.subject) });
      break;
  }

  if (lines.length === 0) return null;

  return (
    <div className={styles.eventDetails}>
      {lines.map((l) => (
        <div key={l.key}>
          <span className={styles.detailKey}>{l.key}:</span>{' '}
          <span className={styles.detailValue}>{l.value}</span>
        </div>
      ))}
    </div>
  );
}

function resultClass(result: AuditResult): string {
  return result === 'SUCCESS' ? styles.success : styles.fail;
}

function TimelineLoading() {
  return (
    <div className={styles.timelinePanel}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>Lifecycle Timeline</span>
      </div>
      <div className={styles.timeline}>
        {[1, 2, 3].map((i) => (
          <div key={i} className={styles.skeletonNode}>
            <div className={styles.skeletonCard}>
              <div className={`${styles.skeletonBar} ${styles.skeletonBarShort}`} />
              <div className={`${styles.skeletonBar} ${styles.skeletonBarMed}`} />
              <div className={`${styles.skeletonBar} ${styles.skeletonBarLong}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineEmpty() {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon}>
        <svg width="24" height="24" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      </div>
      <div>No timeline data available</div>
      <div style={{ marginTop: '4px', fontSize: '11px' }}>
        Imported certificates may not have lifecycle history
      </div>
    </div>
  );
}

export function Timeline({ certificateId }: TimelineProps) {
  const { data: events, isLoading } = useCertificateTimeline(certificateId);

  if (isLoading) {
    return <TimelineLoading />;
  }

  const hasEvents = events && events.length > 0;

  return (
    <div className={styles.timelinePanel} data-testid="certificate-timeline">
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>Lifecycle Timeline</span>
        <span className={styles.panelSub}>
          {hasEvents ? `${events.length} events` : ''}
        </span>
      </div>

      {!hasEvents ? (
        <TimelineEmpty />
      ) : (
        <div className={styles.timeline}>
          {events.map((event) => {
            const cssVariant = ACTION_CSS[event.action] ?? 'created';
            return (
              <div
                key={event.id}
                className={`${styles.eventNode} ${styles[cssVariant] ?? ''}`}
                data-testid="timeline-event"
              >
                {/* Dot on the timeline track */}
                <div className={styles.eventDot}>
                  <div className={styles.eventDotInner} />
                </div>

                {/* Card */}
                <div className={styles.eventCard}>
                  {/* Header: badge + timestamp + result */}
                  <div className={styles.eventHeader}>
                    <span className={`${styles.actionBadge} ${styles[cssVariant] ?? ''}`}>
                      {ACTION_LABELS[event.action] ?? event.action}
                    </span>
                    <span className={styles.eventTimestamp}>
                      {formatTimestamp(event.timestamp)}
                    </span>
                    <span className={`${styles.eventResult} ${resultClass(event.result)}`}>
                      {event.result}
                    </span>
                  </div>

                  {/* Actor */}
                  <div className={styles.eventActor}>
                    <div className={styles.actorAvatar}>{getInitials(event.actor)}</div>
                    <span>{event.actor}</span>
                  </div>

                  {/* Details */}
                  {renderEventDetails(event)}

                  {/* Related cert link */}
                  {event.relatedCertId && (
                    <Link
                      to={`/certificates/${event.relatedCertId}`}
                      className={styles.relatedLink}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                      View related certificate →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
