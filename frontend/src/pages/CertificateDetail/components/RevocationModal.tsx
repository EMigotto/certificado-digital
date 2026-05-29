import { useState } from 'react';
import { Modal } from '@/components/Modal/Modal';
import { Button } from '@/components/Button/Button';
import { RFC5280_REASONS } from '@/types/lifecycle';
import styles from './RevocationModal.module.css';

interface RevocationModalProps {
  commonName: string;
  onClose: () => void;
  onSubmit: (params: {
    reasonCode: number;
    justification: string;
    notifyOwner: boolean;
  }) => void;
  loading: boolean;
}

export function RevocationModal({
  commonName,
  onClose,
  onSubmit,
  loading,
}: RevocationModalProps) {
  const [reasonCode, setReasonCode] = useState<number | null>(null);
  const [justification, setJustification] = useState('');
  const [notifyOwner, setNotifyOwner] = useState(true);

  const isJustificationValid =
    justification.length === 0 || justification.length >= 3;
  const canSubmit = reasonCode !== null && isJustificationValid;

  const handleSubmit = () => {
    if (reasonCode === null) return;
    onSubmit({
      reasonCode,
      justification: justification.trim(),
      notifyOwner,
    });
  };

  return (
    <Modal title="Revogar certificado" onClose={onClose}>
      {/* Red warning banner */}
      <div className={styles.warningBanner}>
        <svg width="16" height="16" viewBox="0 0 24 24">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span>
          This action is irreversible. The certificate will be permanently
          revoked.
        </span>
      </div>

      <div className={styles.subtitle}>
        Certificate: <span className={styles.cn}>{commonName}</span>
      </div>

      {/* RFC 5280 reason code dropdown */}
      <div className={styles.formRow}>
        <label className={styles.formLabel} htmlFor="revoke-reason">
          RFC 5280 Reason Code
        </label>
        <select
          id="revoke-reason"
          className={styles.formSelect}
          value={reasonCode ?? ''}
          onChange={(e) =>
            setReasonCode(e.target.value ? Number(e.target.value) : null)
          }
          disabled={loading}
        >
          <option value="">Select a reason…</option>
          {RFC5280_REASONS.map((r) => (
            <option key={r.code} value={r.code}>
              {r.label}
            </option>
          ))}
        </select>
        {reasonCode !== null && (
          <div className={styles.formHint}>
            {RFC5280_REASONS.find((r) => r.code === reasonCode)?.description}
          </div>
        )}
      </div>

      {/* Justification textarea */}
      <div className={styles.formRow}>
        <label className={styles.formLabel} htmlFor="revoke-justification">
          Justification (optional)
        </label>
        <textarea
          id="revoke-justification"
          className={styles.formTextarea}
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          placeholder="Provide additional context for this revocation…"
          rows={3}
          disabled={loading}
        />
        {justification.length > 0 && justification.length < 3 && (
          <div className={styles.formError}>
            Justification must be at least 3 characters
          </div>
        )}
      </div>

      {/* Notify owner checkbox */}
      <label className={styles.checkLabel}>
        <input
          type="checkbox"
          checked={notifyOwner}
          onChange={(e) => setNotifyOwner(e.target.checked)}
          disabled={loading}
        />
        <span>Notify certificate owner</span>
      </label>

      {/* Actions */}
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button
          variant="danger"
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
        >
          {loading ? (
            <>
              <span className={styles.spinner} aria-hidden="true" />
              Revogando…
            </>
          ) : (
            'Revogar certificado'
          )}
        </Button>
      </div>
    </Modal>
  );
}
