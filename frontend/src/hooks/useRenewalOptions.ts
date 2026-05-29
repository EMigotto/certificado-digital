import { useQuery } from '@tanstack/react-query';
import { getRenewalOptions } from '@/services/lifecycleApi';

/**
 * Query hook for fetching renewal eligibility and options for a certificate.
 *
 * Disabled when no certificate ID is provided.
 */
export function useRenewalOptions(id: string | undefined) {
  return useQuery({
    queryKey: ['renewal-options', id],
    queryFn: () => getRenewalOptions(id!),
    enabled: !!id,
    staleTime: 60_000,
  });
}
