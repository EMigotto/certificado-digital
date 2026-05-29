import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { CertificateStatus, CertificateWithLifecycle } from '@/types/lifecycle';
import { Breadcrumb } from '@/components/Breadcrumb/Breadcrumb';
import { useCertificateDetail } from '@/hooks/useCertificateDetail';
import { useExportCertificate } from '@/hooks/useExportCertificate';
import { useDeleteCertificate } from '@/hooks/useDeleteCertificate';
import { useRenewCertificate } from '@/hooks/useRenewCertificate';
import { useRevokeCertificateWithReason } from '@/hooks/useRevokeCertificateWithReason';
import { DetailHeader } from './components/DetailHeader';
import { MetadataGrid } from './components/MetadataGrid';
import { SanList } from './components/SanList';
import { Timeline } from './components/Timeline';
import { ActionPanel } from './components/ActionPanel';
import { ConfirmDialog } from './components/ConfirmDialog';
import { RenewalModal } from './components/RenewalModal';
import { RevocationModal } from './components/RevocationModal';
import styles from './CertificateDetailPage.module.css';

function computeStatus(
  notAfter: string,
  revoked: boolean,
  renewalChildId?: string | null,
): { status: CertificateStatus; daysUntilExpiry: number } {
  if (revoked) return { status: 'revoked', daysUntilExpiry: 0 };
  if (renewalChildId) return { status: 'renewed', daysUntilExpiry: 0 };
  const now = Date.now();
  const expiry = new Date(notAfter).getTime();
  const diffMs = expiry - now;
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return { status: 'expired', daysUntilExpiry: days };
  if (days <= 30) return { status: 'expiring', daysUntilExpiry: days };
  return { status: 'active', daysUntilExpiry: days };
}

type ModalState = 'renewal' | 'revocation' | 'delete' | null;

export default function CertificateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: cert, isLoading, isError } = useCertificateDetail(id);
  const { doExport, loading: exportLoading } = useExportCertificate();
  const deleteMutation = useDeleteCertificate();
  const renewMutation = useRenewCertificate();
  const revokeMutation = useRevokeCertificateWithReason();

  const [activeModal, setActiveModal] = useState<ModalState>(null);

  // Certificate now has lifecycle fields directly (shared types updated)
  const certLifecycle = cert as CertificateWithLifecycle | undefined;

  const { status, daysUntilExpiry } = useMemo(() => {
    if (!certLifecycle) return { status: 'active' as CertificateStatus, daysUntilExpiry: 0 };
    return computeStatus(
      certLifecycle.notAfter,
      certLifecycle.revoked,
      certLifecycle.renewalChildId,
    );
  }, [certLifecycle]);

  if (isLoading) {
    return <div className={styles.loading}>Carregando certificado…</div>;
  }

  if (isError || !cert || !certLifecycle) {
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
  const isRevoked = certLifecycle.revoked;
  const hasRenewalChild = !!certLifecycle.renewalChildId;

  const handleConfirmDelete = () => {
    deleteMutation.mutate(certLifecycle.id, {
      onSuccess: () => {
        setActiveModal(null);
        navigate('/certificates');
      },
    });
  };

  const handleRenewSubmit = (params: {
    rotateKey: boolean;
    validityDays: number;
    notifyOwner: boolean;
  }) => {
    renewMutation.mutate(
      {
        id: certLifecycle.id,
        params: {
          validityDays: params.validityDays,
          rotateKey: params.rotateKey,
          keyAlgorithm: params.rotateKey ? certLifecycle.keyAlgorithm : null,
        },
      },
      {
        onSuccess: (data) => {
          setActiveModal(null);
          navigate(`/certificates/${data.certificate.id}`);
        },
      },
    );
  };

  const handleRevokeSubmit = (params: {
    reasonCode: number;
    justification: string;
    notifyOwner: boolean;
  }) => {
    revokeMutation.mutate(
      {
        id: certLifecycle.id,
        params: {
          reasonCode: 'unspecified',
          justification: params.justification,
        },
      },
      {
        onSuccess: () => {
          setActiveModal(null);
        },
      },
    );
  };

  return (
    <div>
      {/* Header section */}
      <div className={styles.detailHead}>
        <Breadcrumb
          segments={[
            { label: 'Certificados', path: '/certificates' },
            { label: certLifecycle.commonName },
          ]}
        />

        <DetailHeader
          commonName={certLifecycle.commonName}
          status={status}
          environment={certLifecycle.environment}
          caProvider={certLifecycle.caProvider ?? '—'}
          owner={certLifecycle.owner}
          isExpired={isExpired}
          notAfter={certLifecycle.notAfter}
        />

        <div className={styles.detailActions}>
          <button
            className={styles.backBtn}
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
        {/* Left — Metadata + SANs + Timeline */}
        <div>
          <MetadataGrid
            cert={certLifecycle}
            status={status}
            daysUntilExpiry={daysUntilExpiry}
          />
          <div style={{ marginTop: '20px' }}>
            <SanList sans={certLifecycle.sans} />
          </div>
          <div style={{ marginTop: '20px' }}>
            <Timeline certificateId={certLifecycle.id} />
          </div>
        </div>

        {/* Right — Action panel */}
        <div>
          <ActionPanel
            onExportPem={() => void doExport(certLifecycle.id, 'pem')}
            onExportJson={() => void doExport(certLifecycle.id, 'json')}
            onRevoke={() => setActiveModal('revocation')}
            onRenew={() => setActiveModal('renewal')}
            onDelete={() => setActiveModal('delete')}
            isRevoked={isRevoked}
            isExpired={isExpired}
            exportLoading={exportLoading}
            daysUntilExpiry={daysUntilExpiry}
            hasRenewalChild={hasRenewalChild}
          />
        </div>
      </div>

      {/* === Modals === */}

      {/* Renewal modal */}
      {activeModal === 'renewal' && (
        <RenewalModal
          commonName={certLifecycle.commonName}
          onClose={() => setActiveModal(null)}
          onSubmit={handleRenewSubmit}
          loading={renewMutation.isPending}
        />
      )}

      {/* Revocation modal with RFC 5280 reasons */}
      {activeModal === 'revocation' && (
        <RevocationModal
          commonName={certLifecycle.commonName}
          onClose={() => setActiveModal(null)}
          onSubmit={handleRevokeSubmit}
          loading={revokeMutation.isPending}
        />
      )}

      {/* Delete confirm dialog */}
      {activeModal === 'delete' && (
        <ConfirmDialog
          title="Excluir certificado"
          message={`Tem certeza que deseja excluir permanentemente o certificado "${certLifecycle.commonName}"? Esta ação é irreversível.`}
          confirmLabel="Excluir"
          variant="danger"
          onConfirm={handleConfirmDelete}
          onCancel={() => setActiveModal(null)}
          loading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
