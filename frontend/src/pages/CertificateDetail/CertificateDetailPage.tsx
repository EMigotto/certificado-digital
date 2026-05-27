import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { CertificateStatus } from '@certificado-digital/shared';
import { Breadcrumb } from '@/components/Breadcrumb/Breadcrumb';
import { useCertificateDetail } from '@/hooks/useCertificateDetail';
import { useExportCertificate } from '@/hooks/useExportCertificate';
import { useRevokeCertificate, useDeleteCertificate } from '@/hooks/useDeleteCertificate';
import { DetailHeader } from './components/DetailHeader';
import { MetadataGrid } from './components/MetadataGrid';
import { SanList } from './components/SanList';
import { ActionPanel } from './components/ActionPanel';
import { ConfirmDialog } from './components/ConfirmDialog';
import styles from './CertificateDetailPage.module.css';

function computeStatus(
  notAfter: string,
  revoked: boolean,
): { status: CertificateStatus; daysUntilExpiry: number } {
  if (revoked) return { status: 'revoked', daysUntilExpiry: 0 };
  const now = Date.now();
  const expiry = new Date(notAfter).getTime();
  const diffMs = expiry - now;
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return { status: 'expired', daysUntilExpiry: days };
  if (days <= 30) return { status: 'expiring', daysUntilExpiry: days };
  return { status: 'active', daysUntilExpiry: days };
}

export default function CertificateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: cert, isLoading, isError } = useCertificateDetail(id);
  const { doExport, loading: exportLoading } = useExportCertificate();
  const revokeMutation = useRevokeCertificate();
  const deleteMutation = useDeleteCertificate();

  const [confirmAction, setConfirmAction] = useState<'revoke' | 'delete' | null>(null);

  const { status, daysUntilExpiry } = useMemo(() => {
    if (!cert) return { status: 'active' as CertificateStatus, daysUntilExpiry: 0 };
    return computeStatus(cert.notAfter, cert.revoked);
  }, [cert]);

  if (isLoading) {
    return <div className={styles.loading}>Carregando certificado…</div>;
  }

  if (isError || !cert) {
    return (
      <div className={styles.error}>
        <svg width="24" height="24" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
        <span>Certificado não encontrado</span>
        <button
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '6px 14px',
            color: 'var(--text)',
            cursor: 'pointer',
            fontFamily: 'var(--mono)',
            fontSize: '12px',
          }}
          onClick={() => navigate('/certificates')}
        >
          ← Voltar ao inventário
        </button>
      </div>
    );
  }

  const isExpired = status === 'expired';
  const isRevoked = cert.revoked;

  const handleConfirmRevoke = () => {
    revokeMutation.mutate(cert.id, {
      onSuccess: () => setConfirmAction(null),
    });
  };

  const handleConfirmDelete = () => {
    deleteMutation.mutate(cert.id, {
      onSuccess: () => {
        setConfirmAction(null);
        navigate('/certificates');
      },
    });
  };

  return (
    <div>
      {/* Header section */}
      <div className={styles.detailHead}>
        <Breadcrumb
          segments={[
            { label: 'Certificados', path: '/certificates' },
            { label: cert.commonName },
          ]}
        />

        <DetailHeader
          commonName={cert.commonName}
          status={status}
          environment={cert.environment}
          caProvider={cert.caProvider}
          owner={cert.owner}
          isExpired={isExpired}
          notAfter={cert.notAfter}
        />

        <div className={styles.detailActions}>
          <button
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '6px 14px',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              fontFamily: 'var(--mono)',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            onClick={() => navigate('/certificates')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Voltar
          </button>
        </div>
      </div>

      {/* Warning banner for expired certs — shown below header */}
      {isExpired && (
        <div className={styles.warningBanner}>
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>
            Este certificado está expirado. Dias desde a expiração:{' '}
            <strong>{Math.abs(daysUntilExpiry)}</strong>
          </span>
        </div>
      )}

      {/* Two-column layout */}
      <div className={styles.detailGrid}>
        {/* Left — Metadata + SANs */}
        <div>
          <MetadataGrid cert={cert} status={status} daysUntilExpiry={daysUntilExpiry} />
          <div style={{ marginTop: '20px' }}>
            <SanList sans={cert.sans} />
          </div>
        </div>

        {/* Right — Action panel */}
        <div>
          <ActionPanel
            onExportPem={() => void doExport(cert.id, 'pem')}
            onExportJson={() => void doExport(cert.id, 'json')}
            onRevoke={() => setConfirmAction('revoke')}
            onDelete={() => setConfirmAction('delete')}
            isRevoked={isRevoked}
            exportLoading={exportLoading}
          />
        </div>
      </div>

      {/* Confirm dialogs */}
      {confirmAction === 'revoke' && (
        <ConfirmDialog
          title="Revogar certificado"
          message={`Tem certeza que deseja revogar o certificado "${cert.commonName}"? Esta ação não pode ser desfeita.`}
          confirmLabel="Revogar"
          variant="danger"
          onConfirm={handleConfirmRevoke}
          onCancel={() => setConfirmAction(null)}
          loading={revokeMutation.isPending}
        />
      )}

      {confirmAction === 'delete' && (
        <ConfirmDialog
          title="Excluir certificado"
          message={`Tem certeza que deseja excluir permanentemente o certificado "${cert.commonName}"? Esta ação é irreversível.`}
          confirmLabel="Excluir"
          variant="danger"
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmAction(null)}
          loading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
