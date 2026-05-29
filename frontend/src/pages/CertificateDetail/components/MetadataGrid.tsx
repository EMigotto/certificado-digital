import { Link } from 'react-router-dom';
import type { Certificate } from '@certificado-digital/shared';
import type { CertificateStatus, CertificateWithLifecycle } from '@/types/lifecycle';
import { Badge } from '@/components/Badge/Badge';
import { InfoItem } from './InfoItem';
import styles from './MetadataGrid.module.css';

interface MetadataGridProps {
  cert: Certificate & Partial<CertificateWithLifecycle>;
  status: CertificateStatus;
  daysUntilExpiry: number;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function daysColorClass(days: number): string {
  if (days <= 0) return styles.crit;
  if (days <= 7) return styles.crit;
  if (days <= 30) return styles.warn;
  return styles.ok;
}

function daysLabel(days: number): string {
  if (days <= 0) return `Expirado (${Math.abs(days)} dias atrás)`;
  return `${days} dias`;
}

export function MetadataGrid({ cert, status, daysUntilExpiry }: MetadataGridProps) {
  const tags = cert.tags
    ? Object.entries(cert.tags)
        .map(([k, v]) => `${k}:${v}`)
        .join(', ')
    : '—';

  return (
    <div data-testid="metadata-grid">
      {/* Renewal links */}
      {(cert.renewalParentId || cert.renewalChildId) && (
        <div className={styles.renewalLinks}>
          {cert.renewalParentId && (
            <div className={styles.renewalLink}>
              <svg width="14" height="14" viewBox="0 0 24 24">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span className={styles.renewalLabel}>Renewal of:</span>
              <Link
                to={`/certificates/${cert.renewalParentId}`}
                className={styles.renewalCn}
              >
                {cert.renewalParentCn ?? cert.renewalParentId}
              </Link>
            </div>
          )}
          {cert.renewalChildId && (
            <div className={styles.renewalLink}>
              <svg width="14" height="14" viewBox="0 0 24 24">
                <polyline points="9 18 15 12 9 6" />
              </svg>
              <span className={styles.renewalLabel}>Renewed to:</span>
              <Link
                to={`/certificates/${cert.renewalChildId}`}
                className={styles.renewalCn}
              >
                {cert.renewalChildCn ?? cert.renewalChildId}
              </Link>
              <Badge variant="renewed">Renewed</Badge>
            </div>
          )}
        </div>
      )}

      {/* Main metadata grid */}
      <div className={styles.infoGrid}>
        <InfoItem label="Serial Number" value={cert.serialNumber} copyable />
        <InfoItem
          label="Fingerprint SHA-256"
          value={cert.fingerprintSha256}
          copyable
          truncate
        />
        <InfoItem label="Not Before" value={formatDate(cert.notBefore)} />
        <InfoItem label="Not After" value={formatDate(cert.notAfter)} />
        <InfoItem
          label="Dias até expiração"
          value={daysLabel(daysUntilExpiry)}
          colorClass={
            status === 'revoked' ? undefined : daysColorClass(daysUntilExpiry)
          }
        />
        <InfoItem label="Algoritmo" value={cert.signatureAlgorithm} />
        <InfoItem label="Issuer" value={cert.issuerDn ?? '—'} copyable truncate />
        <InfoItem label="CA Provider" value={cert.caProvider ?? '—'} />
        <InfoItem label="Owner" value={cert.owner} sans />
        <InfoItem label="Application" value={cert.application || '—'} sans />
        <InfoItem label="Zona" value={cert.zone || '—'} />
        <InfoItem label="Environment" value={cert.environment} />
        <InfoItem label="Tags" value={tags} sans />
        <InfoItem label="Descrição" value={cert.description || '—'} sans />
      </div>

      {/* Revocation detail section — only shown when cert is revoked */}
      {cert.revoked && (
        <div className={styles.revocationSection}>
          <div className={styles.revocationTitle}>
            <svg width="14" height="14" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
            Revocation Details
          </div>
          <div className={styles.revocationGrid}>
            <div className={styles.revocationItem}>
              <div className={styles.revocationLabel}>Revoked On</div>
              <div className={styles.revocationValue}>
                {cert.revokedAt ? formatDate(cert.revokedAt) : '—'}
              </div>
            </div>
            <div className={styles.revocationItem}>
              <div className={styles.revocationLabel}>Reason</div>
              <div className={styles.revocationValue}>
                {cert.revocationReason || '—'}
              </div>
            </div>
            <div className={styles.revocationItem}>
              <div className={styles.revocationLabel}>Justification</div>
              <div className={styles.revocationValue}>
                {cert.revocationJustification || '—'}
              </div>
            </div>
            <div className={styles.revocationItem}>
              <div className={styles.revocationLabel}>Revoked By</div>
              <div className={styles.revocationValue}>
                {cert.revokedBy || '—'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
