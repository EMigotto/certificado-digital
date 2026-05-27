import { PAGE_SIZE_OPTIONS } from '@/hooks/usePagination';
import styles from './Pagination.module.css';

interface PaginationProps {
  page: number;
  pageSize: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function Pagination({
  page,
  pageSize,
  totalPages,
  total,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const isFirst = page <= 1;
  const isLast = page >= totalPages;

  return (
    <div className={styles.container}>
      <div className={styles.info}>
        <span className={styles.total}>
          {total.toLocaleString('pt-BR')} certificado{total !== 1 ? 's' : ''}
        </span>
      </div>

      <div className={styles.controls}>
        <div className={styles.sizeSelector}>
          <label className={styles.sizeLabel} htmlFor="page-size">
            Exibir
          </label>
          <select
            id="page-size"
            className={styles.sizeSelect}
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {PAGE_SIZE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        <span className={styles.pageInfo}>
          Página {page} de {Math.max(1, totalPages)}
        </span>

        <button
          className={styles.pageBtn}
          onClick={() => onPageChange(page - 1)}
          disabled={isFirst}
          aria-label="Página anterior"
          type="button"
        >
          <svg width="14" height="14" viewBox="0 0 24 24">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <button
          className={styles.pageBtn}
          onClick={() => onPageChange(page + 1)}
          disabled={isLast}
          aria-label="Próxima página"
          type="button"
        >
          <svg width="14" height="14" viewBox="0 0 24 24">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
