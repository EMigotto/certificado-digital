import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export interface UsePaginationReturn {
  page: number;
  pageSize: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  resetPage: () => void;
}

export function usePagination(): UsePaginationReturn {
  const [searchParams, setSearchParams] = useSearchParams();

  const page = useMemo(() => {
    const raw = searchParams.get('page');
    const parsed = raw ? parseInt(raw, 10) : DEFAULT_PAGE;
    return Number.isNaN(parsed) || parsed < 1 ? DEFAULT_PAGE : parsed;
  }, [searchParams]);

  const pageSize = useMemo(() => {
    const raw = searchParams.get('pageSize');
    const parsed = raw ? parseInt(raw, 10) : DEFAULT_PAGE_SIZE;
    if (Number.isNaN(parsed)) return DEFAULT_PAGE_SIZE;
    const options: readonly number[] = PAGE_SIZE_OPTIONS;
    return options.includes(parsed) ? parsed : DEFAULT_PAGE_SIZE;
  }, [searchParams]);

  const setPage = useCallback(
    (newPage: number) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (newPage <= 1) {
            next.delete('page');
          } else {
            next.set('page', String(newPage));
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setPageSize = useCallback(
    (newSize: number) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (newSize === DEFAULT_PAGE_SIZE) {
            next.delete('pageSize');
          } else {
            next.set('pageSize', String(newSize));
          }
          next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const nextPage = useCallback(() => setPage(page + 1), [page, setPage]);
  const prevPage = useCallback(() => setPage(Math.max(1, page - 1)), [page, setPage]);
  const resetPage = useCallback(() => setPage(1), [setPage]);

  return { page, pageSize, setPage, setPageSize, nextPage, prevPage, resetPage };
}
