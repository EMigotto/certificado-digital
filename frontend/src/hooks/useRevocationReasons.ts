import { useQuery } from '@tanstack/react-query';
import { getRevocationReasons } from '@/services/lifecycleApi';

/**
 * Query hook for fetching RFC 5280 revocation reason codes.
 *
 * Stale time is set to 10 minutes since these are static reference data.
 */
export function useRevocationReasons() {
  return useQuery({
    queryKey: ['revocation-reasons'],
    queryFn: getRevocationReasons,
    staleTime: 10 * 60_000,
  });
}
