import { useQuery } from '@tanstack/react-query';
import {
  listCertificates,
  fetchFilterMeta,
  type ListCertificatesParams,
} from '@/services/certificateApi';

/**
 * Fetch paginated certificates with all current query params.
 */
export function useCertificates(params: ListCertificatesParams) {
  return useQuery({
    queryKey: ['certificates', params],
    queryFn: () => listCertificates(params),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

/**
 * Fetch filter metadata (distinct values for dropdowns).
 */
export function useFilterMeta() {
  return useQuery({
    queryKey: ['filter-meta'],
    queryFn: () => fetchFilterMeta(),
    staleTime: 60_000,
  });
}
