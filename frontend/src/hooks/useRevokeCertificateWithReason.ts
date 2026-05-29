import { useMutation, useQueryClient } from '@tanstack/react-query';
import { revokeCertificateWithReason } from '@/services/certificateApi';
import { useUiStore } from '@/store/uiStore';
import type { RevocationParams } from '@/types/lifecycle';

export function useRevokeCertificateWithReason() {
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);

  return useMutation({
    mutationFn: ({ id, params }: { id: string; params: RevocationParams }) =>
      revokeCertificateWithReason(id, params),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ['certificate', id] });
      void queryClient.invalidateQueries({ queryKey: ['certificates'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
      addToast({ type: 'success', message: 'Certificate revoked successfully' });
    },
    onError: () => {
      addToast({ type: 'error', message: 'Failed to revoke certificate. CA may be unreachable.' });
    },
  });
}
