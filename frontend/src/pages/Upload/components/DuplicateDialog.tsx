/**
 * DuplicateDialog — shown when the server returns 409 (duplicate certificate).
 *
 * Uses the shared Modal component from the design system.
 * Offers three actions: overwrite existing, create new version, or cancel.
 */

import { Modal } from '@/components/Modal/Modal';
import { Button } from '@/components/Button/Button';
import type { DuplicateInfo } from '@/services/certificateApi';
import styles from '../UploadPage.module.css';

interface DuplicateDialogProps {
  duplicate: DuplicateInfo;
  onOverwrite: () => void;
  onNewVersion: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function DuplicateDialog({
  duplicate,
  onOverwrite,
  onNewVersion,
  onCancel,
  loading,
}: DuplicateDialogProps) {
  return (
    <Modal title="⚠ Certificado duplicado" onClose={loading ? () => {} : onCancel}>
      <div className={styles.dialogBody}>
        Um certificado com{' '}
        {duplicate.matchType === 'fingerprint'
          ? 'a mesma impressão digital'
          : 'o mesmo CN e emissor'}{' '}
        já existe no inventário. Escolha como deseja prosseguir:
      </div>

      <div className={styles.dialogMeta}>
        <div className={styles.dialogMetaRow}>
          <span className={styles.dialogMetaLabel}>Common Name</span>
          <span>{duplicate.commonName}</span>
        </div>
        <div className={styles.dialogMetaRow}>
          <span className={styles.dialogMetaLabel}>Emissor</span>
          <span>{duplicate.issuer}</span>
        </div>
        <div className={styles.dialogMetaRow}>
          <span className={styles.dialogMetaLabel}>Match</span>
          <span>
            {duplicate.matchType === 'fingerprint' ? 'Fingerprint SHA-256' : 'CN + Issuer'}
          </span>
        </div>
        <div className={styles.dialogMetaRow}>
          <span className={styles.dialogMetaLabel}>ID existente</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>
            {duplicate.existingId}
          </span>
        </div>
      </div>

      <div className={styles.dialogActions}>
        <Button variant="secondary" onClick={onCancel} disabled={loading}>
          Cancelar
        </Button>
        <Button variant="danger" onClick={onOverwrite} disabled={loading}>
          Sobrescrever existente
        </Button>
        <Button variant="primary" onClick={onNewVersion} disabled={loading}>
          Criar nova versão
        </Button>
      </div>
    </Modal>
  );
}
