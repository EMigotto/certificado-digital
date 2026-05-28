import { useState, useCallback } from 'react';
import { useUiStore } from '@/store/uiStore';
import styles from './CopyButton.module.css';

interface CopyButtonProps {
  /** Text to copy to clipboard */
  value: string;
  /** Optional label shown as toast */
  label?: string;
}

const FEEDBACK_MS = 1500;

export function CopyButton({ value, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const addToast = useUiStore((s) => s.addToast);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      addToast({
        type: 'success',
        message: label ? `${label} copiado` : 'Copiado para a área de transferência',
      });
      setTimeout(() => setCopied(false), FEEDBACK_MS);
    } catch {
      addToast({ type: 'error', message: 'Falha ao copiar' });
    }
  }, [value, label, addToast]);

  return (
    <button
      className={`${styles.btn} ${copied ? styles.copied : ''}`}
      onClick={handleCopy}
      type="button"
      aria-label={`Copiar ${label ?? 'valor'}`}
      title={`Copiar ${label ?? 'valor'}`}
    >
      {copied ? (
        <svg
          className={styles.checkAnim}
          width="14"
          height="14"
          viewBox="0 0 24 24"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}
