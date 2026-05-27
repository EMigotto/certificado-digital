import type { Certificate, CertificateStatus } from '@certificado-digital/shared';
import { InfoItem } from './InfoItem';
import styles from './MetadataGrid.module.css';

interface MetadataGridProps {
  cert: Certificate;
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
    <div className={styles.infoGrid} data-testid="metadata-grid">
      <InfoItem label="Serial Number" value={cert.serial} copyable />
      <InfoItem label="Fingerprint SHA-256" value={cert.fingerprintSha256} copyable truncate />
      <InfoItem label="Not Before" value={formatDate(cert.notBefore)} />
      <InfoItem label="Not After" value={formatDate(cert.notAfter)} />
      <InfoItem
        label="Dias até expiração"
        value={daysLabel(daysUntilExpiry)}
        colorClass={status === 'revoked' ? undefined : daysColorClass(daysUntilExpiry)}
      />
      <InfoItem label="Algoritmo" value={cert.algorithm} />
      <InfoItem label="Issuer" value={cert.issuer} copyable truncate />
      <InfoItem label="CA Provider" value={cert.caProvider} />
      <InfoItem label="Owner" value={cert.owner} sans />
      <InfoItem label="Application" value={cert.application || '—'} sans />
      <InfoItem label="Zona" value={cert.zone || '—'} />
      <InfoItem label="Environment" value={cert.environment} />
      <InfoItem label="Tags" value={tags} sans />
      <InfoItem label="Descrição" value={cert.description || '—'} sans />
    </div>
  );
}
