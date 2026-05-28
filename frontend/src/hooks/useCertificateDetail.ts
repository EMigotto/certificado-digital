import { useQuery } from '@tanstack/react-query';
import { getCertificate } from '@/services/certificateApi';

export function useCertificateDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['certificate', id],
    queryFn: () => getCertificate(id!),
    enabled: !!id,
  });
}
