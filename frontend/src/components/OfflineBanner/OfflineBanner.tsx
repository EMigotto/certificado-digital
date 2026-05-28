import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import styles from './OfflineBanner.module.css';

/**
 * Network status indicator — shows a banner when the user is offline.
 * Uses navigator.onLine + event listeners via useNetworkStatus hook.
 */
export function OfflineBanner() {
  const isOnline = useNetworkStatus();

  if (isOnline) return null;

  return (
    <div className={styles.banner} role="alert" aria-live="assertive">
      <svg width="16" height="16" viewBox="0 0 24 24" className={styles.icon}>
        <line x1="1" y1="1" x2="23" y2="23" />
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
        <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
      <span className={styles.text}>
        Sem conexão com a internet. Algumas funcionalidades podem não estar disponíveis.
      </span>
    </div>
  );
}
