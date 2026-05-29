import { useMutation, useQueryClient } from '@tanstack/react-query';
import { renewCertificate } from '@/services/certificateApi';
import { useUiStore } from '@/store/uiStore';
import type { RenewalParams } from '@/types/lifecycle';

export function useRenewCertificate() {
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);

  return useMutation({
    mutationFn: ({ id, params }: { id: string; params: RenewalParams }) =>
      renewCertificate(id, params),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ['certificate', id] });
      void queryClient.invalidateQueries({ queryKey: ['certificates'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
      addToast({ type: 'success', message: 'Certificate renewed successfully' });
    },
    onError: () => {
      addToast({ type: 'error', message: 'Failed to renew certificate' });
    },
  });
}
