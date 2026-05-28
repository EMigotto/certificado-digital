import styles from './ErrorFallback.module.css';

interface ErrorFallbackProps {
  error: Error | null;
  onRetry: () => void;
}

/**
 * Fallback UI shown when ErrorBoundary catches a render crash.
 * Provides a retry button and shows the error message in dev mode.
 */
export function ErrorFallback({ error, onRetry }: ErrorFallbackProps) {
  return (
    <div className={styles.container} role="alert" aria-label="Erro na aplicação">
      <div className={styles.card}>
        <div className={styles.iconWrap}>
          <svg width="40" height="40" viewBox="0 0 24 24" className={styles.icon}>
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>

        <h2 className={styles.title}>Algo deu errado</h2>

        <p className={styles.description}>
          Ocorreu um erro inesperado. Tente recarregar a página ou clique no botão abaixo.
        </p>

        {error && (
          <pre className={styles.errorDetail}>
            {error.message}
          </pre>
        )}

        <div className={styles.actions}>
          <button className={styles.retryBtn} onClick={onRetry}>
            <svg width="14" height="14" viewBox="0 0 24 24">
              <path d="M23 4v6h-6" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Tentar novamente
          </button>
          <button
            className={styles.reloadBtn}
            onClick={() => window.location.reload()}
          >
            Recarregar página
          </button>
        </div>
      </div>
    </div>
  );
}
