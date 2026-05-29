import { useState, useCallback } from 'react';
import type { AuditFilterParams } from '@certificado-digital/shared';
import { exportAuditLog } from '@/services/auditApi';

/**
 * Hook that exports the current audit log view (with active filters) as CSV or JSON.
 * Includes lifecycle events (ISSUE, RENEW, KEY_ROTATED, NOTIFICATION_SENT, REVOKE).
 */
export function useAuditExport() {
  const [loading, setLoading] = useState(false);

  const doExport = useCallback(
    async (filters: AuditFilterParams, format: 'csv' | 'json') => {
      setLoading(true);
      try {
        const blob = await exportAuditLog(filters, format);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { doExport, loading };
}
