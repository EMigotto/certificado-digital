import axios from 'axios';
import type { AuditLogEntry, AuditFilterParams, PaginatedResponse } from '@certificado-digital/shared';

const api = axios.create({ baseURL: '/api' });

/** Fetch paginated & filtered audit log entries */
export async function getAuditEntries(
  filters: AuditFilterParams = {},
): Promise<PaginatedResponse<AuditLogEntry>> {
  // Strip undefined/empty values
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== undefined && v !== ''),
  );

  const { data } = await api.get<PaginatedResponse<AuditLogEntry>>('/audit', { params });
  return data;
}

/**
 * Export audit log entries as CSV or JSON blob.
 * Includes lifecycle events when present in the current filter set.
 */
export async function exportAuditLog(
  filters: AuditFilterParams = {},
  format: 'csv' | 'json' = 'csv',
): Promise<Blob> {
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== undefined && v !== ''),
  );

  const { data } = await api.get('/audit/export', {
    params: { ...params, format },
    responseType: 'blob',
  });

  return data as Blob;
}
