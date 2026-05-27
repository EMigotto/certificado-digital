import { useEffect } from 'react';
import { useUiStore, type Toast as ToastType } from '@/store/uiStore';
import styles from './Toast.module.css';

const ICONS: Record<ToastType['type'], React.ReactNode> = {
  success: (
    <svg className={styles.icon} width="16" height="16" viewBox="0 0 24 24">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="M22 4 12 14.01l-3-3" />
    </svg>
  ),
  error: (
    <svg className={styles.icon} width="16" height="16" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
  info: (
    <svg className={styles.icon} width="16" height="16" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
};

const AUTO_DISMISS_MS = 5000;

function ToastItem({ toast }: { toast: ToastType }) {
  const removeToast = useUiStore((s) => s.removeToast);

  useEffect(() => {
    const timer = setTimeout(() => {
      removeToast(toast.id);
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast.id, removeToast]);

  return (
    <div className={`${styles.toast} ${styles[toast.type]}`} role="alert" aria-live="polite">
      {ICONS[toast.type]}
      <span className={styles.message}>{toast.message}</span>
      <button
        className={styles.close}
        onClick={() => removeToast(toast.id)}
        aria-label="Fechar notificação"
      >
        <svg width="14" height="14" viewBox="0 0 24 24">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useUiStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className={styles.container} aria-label="Notificações">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
