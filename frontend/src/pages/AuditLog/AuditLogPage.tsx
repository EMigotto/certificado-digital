import { useState, useCallback, useMemo } from 'react';
import type { AuditFilterParams } from '@certificado-digital/shared';
import { useAuditLog } from '@/hooks/useAuditLog';
import { AuditFilters, type AuditFilterState } from './components/AuditFilters';
import { AuditTable } from './components/AuditTable';
import styles from './AuditLogPage.module.css';

const DEFAULT_PAGE_SIZE = 20;

const EMPTY_FILTERS: AuditFilterState = {
  action: '',
  actor: '',
  certCn: '',
  dateFrom: '',
  dateTo: '',
  result: '',
};

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<AuditFilterState>(EMPTY_FILTERS);

  const queryParams: AuditFilterParams = useMemo(
    () => ({
      page: String(page),
      pageSize: String(DEFAULT_PAGE_SIZE),
      ...(filters.action && { action: filters.action }),
      ...(filters.actor && { actor: filters.actor }),
      ...(filters.certCn && { certificateId: filters.certCn }),
      ...(filters.dateFrom && { dateFrom: filters.dateFrom }),
      ...(filters.dateTo && { dateTo: filters.dateTo }),
      ...(filters.result && { result: filters.result }),
    }),
    [page, filters],
  );

  const { data, isLoading } = useAuditLog(queryParams);

  const handleFilterChange = useCallback((update: Partial<AuditFilterState>) => {
    setFilters((prev) => ({ ...prev, ...update }));
    setPage(1); // Reset to first page on filter change
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }, []);

  const totalPages = data?.totalPages ?? 1;

  return (
    <div>
      {/* Section header */}
      <div className={styles.secHead}>
        <div>
          <div className={styles.secTitle}>
            05 · <em>Audit</em> Log
          </div>
          <div className={styles.secTag} style={{ marginTop: '8px' }}>
            Registro completo de todas as ações em certificados
          </div>
        </div>
        <div className={styles.secTag}>
          {data ? `${data.total} registros` : '…'}
        </div>
      </div>

      {/* Filters */}
      <AuditFilters filters={filters} onChange={handleFilterChange} onClear={handleClearFilters} />

      {/* Table */}
      <div className={styles.panel}>
        {isLoading ? (
          <div className={styles.loading}>Carregando registros…</div>
        ) : !data || data.data.length === 0 ? (
          <div className={styles.empty}>Nenhum registro de auditoria encontrado</div>
        ) : (
          <>
            <AuditTable entries={data.data} />

            {/* Pagination */}
            <div className={styles.pagination}>
              <span>
                Página {data.page} de {data.totalPages} · {data.total} registros
              </span>
              <div className={styles.pageControls}>
                <button
                  className={styles.pageBtn}
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ← Anterior
                </button>
                <button
                  className={styles.pageBtn}
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima →
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
