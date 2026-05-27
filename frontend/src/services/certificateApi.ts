import axios from 'axios';
import type { Certificate, CertStatus, PaginatedResponse } from '@certificado-digital/shared';

const api = axios.create({ baseURL: '/api' });

// ─── Inventory (list / search / filter) ─────────────────────────────────────

/** Extended certificate with computed fields returned by the list API */
export type CertificateRow = Certificate & {
  daysUntilExpiry: number;
};

/** Query params accepted by GET /api/certificates */
export interface ListCertificatesParams {
  q?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
  sortDir?: 'asc' | 'desc';
  expiresIn?: string;
  environment?: string[];
  ca?: string[];
  status?: CertStatus[];
  owner?: string;
  algorithm?: string[];
  tags?: string;
}

/** Metadata for filter dropdowns from GET /api/meta/filters */
export interface FilterMeta {
  environments: string[];
  caProviders: string[];
  statuses: string[];
  owners: string[];
  algorithms: string[];
  tagKeys: string[];
}

/**
 * Fetch paginated certificates with search, filter, sort.
 */
export async function listCertificates(
  params: ListCertificatesParams,
): Promise<PaginatedResponse<CertificateRow>> {
  const query: Record<string, string> = {};

  if (params.q) query.q = params.q;
  if (params.page !== undefined) query.page = String(params.page);
  if (params.pageSize !== undefined) query.pageSize = String(params.pageSize);
  if (params.sort) query.sort = params.sort;
  if (params.sortDir) query.sortDir = params.sortDir;
  if (params.expiresIn) query.expiresIn = params.expiresIn;
  if (params.environment?.length) query.environment = params.environment.join(',');
  if (params.ca?.length) query.ca = params.ca.join(',');
  if (params.status?.length) query.status = params.status.join(',');
  if (params.owner) query.owner = params.owner;
  if (params.algorithm?.length) query.algorithm = params.algorithm.join(',');
  if (params.tags) query.tags = params.tags;

  const { data } = await api.get<PaginatedResponse<CertificateRow>>('/certificates', {
    params: query,
  });
  return data;
}

/**
 * Fetch filter metadata for dropdowns.
 */
export async function fetchFilterMeta(): Promise<FilterMeta> {
  const { data } = await api.get<FilterMeta>('/meta/filters');
  return data;
}

// ─── Detail / Single certificate ────────────────────────────────────────────

/** Fetch a single certificate by ID */
export async function getCertificate(id: string): Promise<Certificate> {
  const { data } = await api.get<Certificate>(`/certificates/${id}`);
  return data;
}

/** Export certificate in the given format — returns a Blob for download */
export async function exportCertificate(
  id: string,
  format: 'pem' | 'json',
): Promise<{ blob: Blob; filename: string }> {
  const { data, headers } = await api.get(`/certificates/${id}/export`, {
    params: { format },
    responseType: 'blob',
  });

  const disposition = headers['content-disposition'] as string | undefined;
  const fallbackExt = format === 'pem' ? '.pem' : '.json';
  const filename =
    disposition?.match(/filename="?(.+?)"?$/)?.[1] ?? `certificate-${id}${fallbackExt}`;

  return { blob: data as Blob, filename };
}

/** Soft-delete (revoke) a certificate */
export async function revokeCertificate(id: string): Promise<void> {
  await api.patch(`/certificates/${id}/revoke`);
}

/** Hard-delete a certificate */
export async function deleteCertificate(id: string): Promise<void> {
  await api.delete(`/certificates/${id}`);
}
