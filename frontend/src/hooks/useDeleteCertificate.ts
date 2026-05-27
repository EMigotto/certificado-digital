import { useMutation, useQueryClient } from '@tanstack/react-query';
import { revokeCertificate, deleteCertificate } from '@/services/certificateApi';
import { useUiStore } from '@/store/uiStore';

export function useRevokeCertificate() {
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);

  return useMutation({
    mutationFn: (id: string) => revokeCertificate(id),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: ['certificate', id] });
      void queryClient.invalidateQueries({ queryKey: ['certificates'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
      addToast({ type: 'success', message: 'Certificado revogado com sucesso' });
    },
    onError: () => {
      addToast({ type: 'error', message: 'Falha ao revogar certificado' });
    },
  });
}

export function useDeleteCertificate() {
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);

  return useMutation({
    mutationFn: (id: string) => deleteCertificate(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['certificates'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
      addToast({ type: 'success', message: 'Certificado excluído com sucesso' });
    },
    onError: () => {
      addToast({ type: 'error', message: 'Falha ao excluir certificado' });
    },
  });
}
