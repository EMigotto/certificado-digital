import { useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import type { CertStatus } from '@certificado-digital/shared';
import { useSearch } from '@/hooks/useSearch';
import { useFilters } from '@/hooks/useFilters';
import { usePagination } from '@/hooks/usePagination';
import { useCertificates, useFilterMeta } from '@/hooks/useCertificates';
import { SearchInput } from '@/components/SearchInput/SearchInput';
import { FilterBar } from '@/components/FilterBar/FilterBar';
import { Pagination } from '@/components/Pagination/Pagination';
import { Button } from '@/components/Button/Button';
import { CertificateTable } from './components/CertificateTable';
import styles from './InventoryPage.module.css';

export default function InventoryPage() {
  const navigate = useNavigate();
  const { inputValue, searchTerm, hint, setInputValue, clearSearch } = useSearch();
  const {
    activeFilters,
    filterParams,
    toggleFilter,
    removeFilter,
    clearAllFilters,
    isActive,
    hasFilters,
  } = useFilters();
  const { page, pageSize, setPage, setPageSize } = usePagination();
  const [searchParams, setSearchParams] = useSearchParams();

  // Build API query params
  const queryParams = useMemo(
    () => ({
      q: searchTerm || undefined,
      page,
      pageSize,
      sort: searchParams.get('sort') ?? undefined,
      sortDir: (searchParams.get('sortDir') as 'asc' | 'desc') ?? undefined,
      ...filterParams,
      // Cast status strings to CertStatus enum values
      status: filterParams.status as CertStatus[] | undefined,
    }),
    [searchTerm, page, pageSize, filterParams, searchParams],
  );

  const { data, isLoading, isFetching } = useCertificates(queryParams);
  const { data: filterMeta } = useFilterMeta();

  const certificates = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const handleSortChange = useCallback(
    (sort: string, sortDir: 'asc' | 'desc') => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('sort', sort);
          next.set('sortDir', sortDir);
          next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const handleRowClick = useCallback(
    (id: string) => {
      navigate(`/certificates/${id}`);
    },
    [navigate],
  );

  // Results count label
  const resultsLabel = useMemo(() => {
    if (searchTerm || hasFilters) {
      return `${total.toLocaleString('pt-BR')} certificados`;
    }
    return `${total.toLocaleString('pt-BR')} certificados`;
  }, [total, searchTerm, hasFilters]);

  return (
    <section className={styles.section}>
      {/* Section header — matches prototype */}
      <div className={styles.secHead}>
        <div>
          <div className={styles.secTitle}>
            02 · <em>Inventário</em> centralizado
          </div>
          <div className={styles.secTag}>
            Lista, busca, filtros
            <span className={styles.cap}>C1 · Inventory</span>
          </div>
        </div>
        <div className={styles.secTag}>{resultsLabel}</div>
      </div>

      {/* Toolbar: search + filters + action */}
      <div className={styles.toolbar}>
        <SearchInput
          value={inputValue}
          onChange={setInputValue}
          onClear={clearSearch}
          hint={hint}
          placeholder="busca: CN, SAN, serial, owner..."
        />

        <FilterBar
          activeFilters={activeFilters}
          filterMeta={filterMeta}
          filterParams={filterParams}
          onToggleFilter={toggleFilter}
          onRemoveFilter={removeFilter}
          onClearAll={clearAllFilters}
          isActive={isActive}
          hasFilters={hasFilters}
        />

        <Button variant="primary" className={styles.btnEmit}>
          <svg width="14" height="14" viewBox="0 0 24 24">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Emitir certificado
        </Button>
      </div>

      {/* Loading indicator */}
      {isFetching && certificates.length > 0 && (
        <div className={styles.fetchingBar} />
      )}

      {/* Table */}
      <CertificateTable
        data={certificates}
        isLoading={isLoading}
        hasFilters={hasFilters}
        hasSearch={!!searchTerm}
        onClearSearch={clearSearch}
        onClearFilters={clearAllFilters}
        onSortChange={handleSortChange}
        onRowClick={handleRowClick}
        currentSort={searchParams.get('sort') ?? undefined}
        currentSortDir={
          (searchParams.get('sortDir') as 'asc' | 'desc') ?? undefined
        }
      />

      {/* Pagination */}
      {certificates.length > 0 && (
        <Pagination
          page={page}
          pageSize={pageSize}
          totalPages={totalPages}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      )}
    </section>
  );
}
