import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { AuditFilterParams } from '@certificado-digital/shared';
import { getAuditEntries } from '@/services/auditApi';

export function useAuditLog(filters: AuditFilterParams) {
  return useQuery({
    queryKey: ['audit', filters],
    queryFn: () => getAuditEntries(filters),
    placeholderData: keepPreviousData,
  });
}
