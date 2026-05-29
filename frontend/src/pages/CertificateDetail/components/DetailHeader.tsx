import type { CertificateStatus } from '@/types/lifecycle';
import { Badge, type BadgeVariant } from '@/components/Badge/Badge';
import styles from '../CertificateDetailPage.module.css';

interface DetailHeaderProps {
  commonName: string;
  status: CertificateStatus;
  environment: string;
  caProvider: string;
  owner: string;
  isExpired: boolean;
  notAfter: string;
}

const STATUS_MAP: Record<CertificateStatus, { variant: BadgeVariant; label: string }> = {
  pending: { variant: 'pending', label: 'Pendente' },
  issued: { variant: 'issued', label: 'Emitido' },
  active: { variant: 'ok', label: 'Válido' },
  expiring: { variant: 'warn', label: 'Atenção' },
  renewed: { variant: 'renewed', label: 'Renovado' },
  expired: { variant: 'crit', label: 'Expirado' },
  revoked: { variant: 'rev', label: 'Revogado' },
};

function formatDatePtBr(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function DetailHeader({
  commonName,
  status,
  environment,
  caProvider,
  owner,
  isExpired,
  notAfter,
}: DetailHeaderProps) {
  const { variant, label } = STATUS_MAP[status];

  return (
    <>
      <div className={styles.detailTitle}>
        <span className={styles.titleCn} title={commonName}>
          {commonName}
        </span>
        <Badge variant={variant}>{label}</Badge>
      </div>

      <div className={styles.detailMeta}>
        <span className={`${styles.envTag} ${environment === 'prd' ? styles.prd : ''}`}>
          {caProvider}
        </span>
        <span className={`${styles.envTag} ${environment === 'prd' ? styles.prd : ''}`}>
          {environment}
        </span>
        <span className={styles.ownerMeta}>owner: {owner}</span>
      </div>

      {isExpired && (
        <div className={styles.warningBanner}>
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>
            Este certificado expirou em {formatDatePtBr(notAfter)}. Renove ou revogue-o
            imediatamente.
          </span>
        </div>
      )}
    </>
  );
}
