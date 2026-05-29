import { useQuery } from '@tanstack/react-query';
import { getCertificateTimeline } from '@/services/lifecycleApi';

/**
 * Query hook for fetching a certificate's lifecycle timeline.
 *
 * Returns chronological events: ISSUED, ACTIVATED, RENEWED, REVOKED,
 * KEY_ROTATED, NOTIFICATION_SENT.
 *
 * Disabled when no certificate ID is provided.
 */
export function useCertificateTimeline(id: string | undefined) {
  return useQuery({
    queryKey: ['certificate-timeline', id],
    queryFn: () => getCertificateTimeline(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}
