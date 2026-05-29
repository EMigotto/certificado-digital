import { useQuery } from '@tanstack/react-query';
import { getCertificateTimeline } from '@/services/timelineApi';

/**
 * Fetches the lifecycle timeline for a given certificate.
 * Returns chronological events: CREATED, ISSUED, RENEWED, REVOKED, KEY_ROTATED, NOTIFICATION_SENT.
 */
export function useCertificateTimeline(certificateId: string | undefined) {
  return useQuery({
    queryKey: ['certificate-timeline', certificateId],
    queryFn: () => getCertificateTimeline(certificateId!),
    enabled: !!certificateId,
  });
}
