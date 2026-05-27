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
