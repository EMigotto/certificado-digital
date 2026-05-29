import { useState } from 'react';
import { Modal } from '@/components/Modal/Modal';
import { Button } from '@/components/Button/Button';
import styles from './RenewalModal.module.css';

interface RenewalModalProps {
  commonName: string;
  currentValidityDays?: number;
  onClose: () => void;
  onSubmit: (params: {
    rotateKey: boolean;
    validityDays: number;
    notifyOwner: boolean;
  }) => void;
  loading: boolean;
}

export function RenewalModal({
  commonName,
  currentValidityDays = 365,
  onClose,
  onSubmit,
  loading,
}: RenewalModalProps) {
  const [rotateKey, setRotateKey] = useState(true);
  const [validityDays, setValidityDays] = useState(currentValidityDays);
  const [notifyOwner, setNotifyOwner] = useState(true);

  const handleSubmit = () => {
    onSubmit({ rotateKey, validityDays, notifyOwner });
  };

  return (
    <Modal title="Renovar certificado" onClose={onClose}>
      <div className={styles.subtitle}>
        <span className={styles.cn}>{commonName}</span>
      </div>

      {/* Key rotation option cards */}
      <div className={styles.optionCards}>
        <button
          type="button"
          className={`${styles.optionCard} ${!rotateKey ? styles.selected : ''}`}
          onClick={() => setRotateKey(false)}
          disabled={loading}
        >
          <div className={styles.optionIcon}>
            <svg width="20" height="20" viewBox="0 0 24 24">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div className={styles.optionLabel}>Keep Same Key</div>
          <div className={styles.optionDesc}>
            Faster renewal, reuses existing private key
          </div>
        </button>

        <button
          type="button"
          className={`${styles.optionCard} ${rotateKey ? styles.selected : ''}`}
          onClick={() => setRotateKey(true)}
          disabled={loading}
        >
          <div className={styles.optionIcon}>
            <svg width="20" height="20" viewBox="0 0 24 24">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </div>
          <div className={styles.optionLabel}>Rotate Key</div>
          <div className={styles.optionBadge}>Recommended</div>
          <div className={styles.optionDesc}>
            Generates a new key pair for enhanced security
          </div>
        </button>
      </div>

      {/* Key rotation info note */}
      {rotateKey && (
        <div className={styles.policyNote}>
          <svg width="16" height="16" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <div>
            <strong>Key Rotation:</strong> A new key pair will be generated. All
            services using this certificate must be updated with the new key
            material.
          </div>
        </div>
      )}

      {/* Validity period */}
      <div className={styles.formRow}>
        <label className={styles.formLabel} htmlFor="renewal-validity">
          Validity Period (days)
        </label>
        <input
          id="renewal-validity"
          type="number"
          className={styles.formInput}
          value={validityDays}
          onChange={(e) =>
            setValidityDays(Math.max(1, parseInt(e.target.value) || 1))
          }
          min={1}
          max={825}
          disabled={loading}
        />
        <div className={styles.formHint}>
          Maximum: 825 days (TLS/BR guidelines)
        </div>
      </div>

      {/* Notify owner — only visible when rotating key */}
      {rotateKey && (
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={notifyOwner}
            onChange={(e) => setNotifyOwner(e.target.checked)}
            disabled={loading}
          />
          <span>Notify certificate owner about key rotation</span>
        </label>
      )}

      {/* Actions */}
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button variant="primary" onClick={handleSubmit} disabled={loading}>
          {loading ? (
            <>
              <span className={styles.spinner} aria-hidden="true" />
              Renovando…
            </>
          ) : (
            'Renovar certificado'
          )}
        </Button>
      </div>
    </Modal>
  );
}
