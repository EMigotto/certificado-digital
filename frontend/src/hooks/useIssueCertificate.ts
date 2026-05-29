import { useMutation, useQueryClient } from '@tanstack/react-query';
import { issueCertificate } from '@/services/lifecycleApi';
import { useUiStore } from '@/store/uiStore';
import type { IssueCertificateRequest } from '@certificado-digital/shared';

/**
 * Mutation hook for issuing a new certificate.
 *
 * On success, invalidates the certificates list and audit log queries,
 * then shows a success toast.
 */
export function useIssueCertificate() {
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);

  return useMutation({
    mutationFn: (params: IssueCertificateRequest) => issueCertificate(params),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['certificates'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
      void queryClient.invalidateQueries({ queryKey: ['filter-meta'] });
      addToast({
        type: 'success',
        message: `Certificado ${data.certificate.commonName} emitido com sucesso`,
      });
    },
    onError: () => {
      addToast({ type: 'error', message: 'Falha ao emitir certificado' });
    },
  });
}
