import styles from './EmptyState.module.css';

interface EmptyStateProps {
  hasFilters: boolean;
  hasSearch: boolean;
  onClearSearch?: () => void;
  onClearFilters?: () => void;
}

export function EmptyState({
  hasFilters,
  hasSearch,
  onClearSearch,
  onClearFilters,
}: EmptyStateProps) {
  if (hasSearch || hasFilters) {
    return (
      <div className={styles.container}>
        <div className={styles.icon}>
          <svg width="40" height="40" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </div>
        <div className={styles.title}>Nenhum resultado encontrado</div>
        <div className={styles.subtitle}>
          Tente ajustar sua busca ou remover alguns filtros.
        </div>
        <div className={styles.actions}>
          {hasSearch && onClearSearch && (
            <button className={styles.btn} onClick={onClearSearch} type="button">
              Limpar busca
            </button>
          )}
          {hasFilters && onClearFilters && (
            <button className={styles.btn} onClick={onClearFilters} type="button">
              Limpar filtros
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.icon}>
        <svg width="40" height="40" viewBox="0 0 24 24">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        </svg>
      </div>
      <div className={styles.title}>Nenhum certificado cadastrado</div>
      <div className={styles.subtitle}>
        Importe certificados para começar a gerenciar seu inventário.
      </div>
    </div>
  );
}
