import { useQuery } from '@tanstack/react-query';
import { getCaList } from '@/services/lifecycleApi';

/**
 * Query hook for fetching the list of available Certificate Authorities.
 *
 * Stale time is set to 5 minutes since CA configurations rarely change.
 */
export function useCaList() {
  return useQuery({
    queryKey: ['ca-list'],
    queryFn: getCaList,
    staleTime: 5 * 60_000,
  });
}
