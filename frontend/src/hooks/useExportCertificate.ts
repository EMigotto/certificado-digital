import { useCallback, useState } from 'react';
import { exportCertificate } from '@/services/certificateApi';
import { useUiStore } from '@/store/uiStore';

export function useExportCertificate() {
  const addToast = useUiStore((s) => s.addToast);
  const [loading, setLoading] = useState(false);

  const doExport = useCallback(
    async (id: string, format: 'pem' | 'json') => {
      setLoading(true);
      try {
        const { blob, filename } = await exportCertificate(id, format);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        addToast({ type: 'success', message: `Exportado como ${format.toUpperCase()}` });
      } catch {
        addToast({ type: 'error', message: `Falha ao exportar ${format.toUpperCase()}` });
      } finally {
        setLoading(false);
      }
    },
    [addToast],
  );

  return { doExport, loading };
}
