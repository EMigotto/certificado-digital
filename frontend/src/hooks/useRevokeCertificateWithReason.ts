import { useMutation, useQueryClient } from '@tanstack/react-query';
import { revokeCertificateWithReason } from '@/services/lifecycleApi';
import { useUiStore } from '@/store/uiStore';
import type { RevokeCertificateRequest } from '@certificado-digital/shared';

/** Parameters for the enhanced revocation mutation */
export interface RevokeCertificateWithReasonParams {
  id: string;
  params: RevokeCertificateRequest;
}

/**
 * Enhanced revocation mutation hook with RFC 5280 reason codes.
 *
 * Replaces the simple revoke for lifecycle workflows where a reason
 * code and justification are required.
 *
 * On success, invalidates certificate detail, list, timeline, and audit queries.
 */
export function useRevokeCertificateWithReason() {
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);

  return useMutation({
    mutationFn: ({ id, params }: RevokeCertificateWithReasonParams) =>
      revokeCertificateWithReason(id, params),
    onSuccess: (data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['certificate', variables.id] });
      void queryClient.invalidateQueries({ queryKey: ['certificates'] });
      void queryClient.invalidateQueries({ queryKey: ['certificate-timeline', variables.id] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
      addToast({
        type: 'success',
        message: `Certificado ${data.certificate.commonName} revogado com sucesso`,
      });
    },
    onError: () => {
      addToast({ type: 'error', message: 'Falha ao revogar certificado' });
    },
  });
}
