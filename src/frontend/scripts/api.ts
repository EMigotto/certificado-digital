/**
 * Typed fetch() wrapper for /api/v1/* endpoints.
 * Matches ADR §2.3 REST API design.
 */

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface CertificateDTO {
  id: string;
  common_name: string;
  sans: string[];
  serial: string;
  issuer: string;
  not_before: string;
  not_after: string;
  algorithm: string;
  fingerprint_sha256: string;
  owner: string;
  application: string;
  environment: 'dev' | 'hml' | 'prd';
  zone: string;
  ca_provider: string;
  revoked: boolean;
  pem_content?: string;
  tags: Record<string, string>;
  custom_fields: Record<string, unknown>;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface CertListResponse {
  items: CertificateDTO[];
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  has_next_page: boolean;
  has_previous_page: boolean;
}

export interface DashboardStats {
  total: number;
  valid: number;
  expiring_30d: number;
  expired: number;
  revoked: number;
  delta_7d: number;
}

export interface HeatmapData {
  cells: number[]; // 90 items, one per day
}

export interface AlertDTO {
  id: string;
  common_name: string;
  environment: string;
  ca_provider: string;
  owner: string;
  days_remaining: number;
}

export interface AuditEntryDTO {
  id: string;
  cert_id: string | null;
  cert_cn: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'REVOKE';
  actor: string;
  result: 'SUCCESS' | 'FAILURE';
  details: Record<string, unknown>;
  timestamp: string;
}

export interface AuditListResponse {
  items: AuditEntryDTO[];
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
}

export interface ImportResultDTO {
  imported: number;
  failed: number;
  errors: { index: number; message: string }[];
}

/* ------------------------------------------------------------------ */
/* API Base URL                                                        */
/* ------------------------------------------------------------------ */

const BASE = '/api/v1';

/* ------------------------------------------------------------------ */
/* Generic helpers                                                     */
/* ------------------------------------------------------------------ */

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE}${path}`;
  try {
    const res = await fetch(url, init);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  } catch (err) {
    // If the backend is unavailable, return mock data
    console.warn(`API call failed for ${url}, using fallback:`, err);
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Certificate endpoints                                               */
/* ------------------------------------------------------------------ */

export interface CertListParams {
  q?: string;
  environment?: string;
  owner?: string;
  ca?: string;
  status?: string;
  tag?: string;
  expires_before?: number;
  page?: number;
  page_size?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export function listCertificates(params: CertListParams = {}): Promise<CertListResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '' && v !== null) qs.set(k, String(v));
  }
  const query = qs.toString();
  return request<CertListResponse>(`/certificates${query ? '?' + query : ''}`);
}

export function getCertificate(id: string): Promise<CertificateDTO> {
  return request<CertificateDTO>(`/certificates/${encodeURIComponent(id)}`);
}

export function updateCertificate(id: string, data: Partial<CertificateDTO>): Promise<CertificateDTO> {
  return request<CertificateDTO>(`/certificates/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function deleteCertificate(id: string): Promise<void> {
  return request<void>(`/certificates/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function downloadCertificate(id: string): void {
  window.open(`${BASE}/certificates/${encodeURIComponent(id)}/download`, '_blank');
}

export function exportCertificates(params: CertListParams, format: 'csv' | 'json'): void {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '' && v !== null) qs.set(k, String(v));
  }
  qs.set('format', format);
  window.open(`${BASE}/certificates/export?${qs.toString()}`, '_blank');
}

/* ------------------------------------------------------------------ */
/* Import endpoints                                                    */
/* ------------------------------------------------------------------ */

export function importPEM(file: File, metadata: Record<string, string>): Promise<CertificateDTO> {
  const fd = new FormData();
  fd.append('file', file);
  for (const [k, v] of Object.entries(metadata)) fd.append(k, v);
  return request<CertificateDTO>('/certificates/import/pem', { method: 'POST', body: fd });
}

export function importPKCS12(file: File, password: string, metadata: Record<string, string>): Promise<CertificateDTO> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('password', password);
  for (const [k, v] of Object.entries(metadata)) fd.append(k, v);
  return request<CertificateDTO>('/certificates/import/pkcs12', { method: 'POST', body: fd });
}

export function importCSV(file: File): Promise<ImportResultDTO> {
  const fd = new FormData();
  fd.append('file', file);
  return request<ImportResultDTO>('/certificates/import/csv', { method: 'POST', body: fd });
}

/* ------------------------------------------------------------------ */
/* Dashboard endpoints                                                 */
/* ------------------------------------------------------------------ */

export function getDashboardStats(): Promise<DashboardStats> {
  return request<DashboardStats>('/dashboard/stats');
}

export function getDashboardHeatmap(): Promise<HeatmapData> {
  return request<HeatmapData>('/dashboard/heatmap');
}

export function getDashboardAlerts(limit: number = 5): Promise<AlertDTO[]> {
  return request<AlertDTO[]>(`/dashboard/alerts?limit=${limit}`);
}

/* ------------------------------------------------------------------ */
/* Audit endpoints                                                     */
/* ------------------------------------------------------------------ */

export interface AuditListParams {
  cert_id?: string;
  action?: string;
  actor?: string;
  page?: number;
  page_size?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export function listAuditEntries(params: AuditListParams = {}): Promise<AuditListResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '' && v !== null) qs.set(k, String(v));
  }
  const query = qs.toString();
  return request<AuditListResponse>(`/audit${query ? '?' + query : ''}`);
}

export function getCertificateAudit(certId: string): Promise<AuditEntryDTO[]> {
  return request<AuditEntryDTO[]>(`/certificates/${encodeURIComponent(certId)}/audit`);
}
