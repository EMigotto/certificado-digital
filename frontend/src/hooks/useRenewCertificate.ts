import { useMutation, useQueryClient } from '@tanstack/react-query';
import { renewCertificate } from '@/services/lifecycleApi';
import { useUiStore } from '@/store/uiStore';
import type { RenewCertificateRequest } from '@certificado-digital/shared';

/** Parameters for the renew mutation — certificate ID plus renewal options */
export interface RenewCertificateParams {
  id: string;
  params: RenewCertificateRequest;
}

/**
 * Mutation hook for renewing an existing certificate.
 *
 * On success, invalidates the old and new certificate detail queries,
 * the certificates list, timeline, and audit log.
 */
export function useRenewCertificate() {
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);

  return useMutation({
    mutationFn: ({ id, params }: RenewCertificateParams) => renewCertificate(id, params),
    onSuccess: (data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['certificate', variables.id] });
      void queryClient.invalidateQueries({ queryKey: ['certificate', data.certificate.id] });
      void queryClient.invalidateQueries({ queryKey: ['certificates'] });
      void queryClient.invalidateQueries({ queryKey: ['certificate-timeline', variables.id] });
      void queryClient.invalidateQueries({ queryKey: ['renewal-options', variables.id] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
      addToast({
        type: 'success',
        message: `Certificado ${data.certificate.commonName} renovado com sucesso`,
      });
    },
    onError: () => {
      addToast({ type: 'error', message: 'Falha ao renovar certificado' });
    },
  });
}
