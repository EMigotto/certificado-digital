/**
 * Certificate API client — inventory, detail, and import endpoints.
 *
 * All methods return typed responses matching the backend contract.
 */

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
  const { data: blobData, headers } = await api.get(`/certificates/${id}/export`, {
    params: { format },
    responseType: 'blob',
  });

  const disposition = headers['content-disposition'] as string | undefined;
  const fallbackExt = format === 'pem' ? '.pem' : '.json';
  const filename =
    disposition?.match(/filename="?(.+?)"?$/)?.[1] ?? `certificate-${id}${fallbackExt}`;

  return { blob: blobData as Blob, filename };
}

/** Soft-delete (revoke) a certificate */
export async function revokeCertificate(id: string): Promise<void> {
  await api.patch(`/certificates/${id}/revoke`);
}

/** Hard-delete a certificate */
export async function deleteCertificate(id: string): Promise<void> {
  await api.delete(`/certificates/${id}`);
}

// ─── Import types ───────────────────────────────────────────────────────────

/** Metadata sent alongside the certificate file */
export interface ImportMetadata {
  owner: string;
  environment: string;
  application: string;
  tags: string; // JSON string or key:value;key:value
}

/** Duplicate info returned on 409 */
export interface DuplicateInfo {
  existingId: string;
  commonName: string;
  issuer: string;
  fingerprintSha256: string;
  matchType: 'fingerprint' | 'cn_issuer';
}

/** Single import success response */
export interface ImportSuccessResponse {
  certificate: {
    id: string;
    commonName: string;
    sans: string[];
    serial: string;
    issuer: string;
    notBefore: string;
    notAfter: string;
    algorithm: string;
    fingerprintSha256: string;
    owner: string;
    environment: string;
    application: string;
  };
  auditId: string;
}

/** CSV preview row */
export interface CsvPreviewRow {
  row: number;
  data: {
    cn: string;
    issuer: string;
    owner: string;
    environment: string;
    sans: string[];
    serial: string;
    notBefore: string;
    notAfter: string;
    algorithm: string;
    fingerprintSha256: string;
    application: string;
    zone: string;
    caProvider: string;
    description: string;
    tags: Record<string, string>;
  };
  status: 'valid' | 'error' | 'duplicate';
  errors: string[];
}

/** CSV preview response */
export interface CsvPreviewResponse {
  rows: CsvPreviewRow[];
  validCount: number;
  errorCount: number;
  duplicateCount: number;
  headerErrors: string[];
}

/** CSV import summary */
export interface CsvImportSummary {
  imported: number;
  failed: number;
  batchId: string;
  failedRows: CsvPreviewRow[];
}

// ─── Import API methods ─────────────────────────────────────────────────────

/**
 * Upload a single certificate file with metadata.
 *
 * POST /api/certificates/import
 */
export async function importCertificate(
  file: File,
  metadata: ImportMetadata,
  password?: string,
): Promise<ImportSuccessResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('owner', metadata.owner);
  formData.append('environment', metadata.environment);
  formData.append('application', metadata.application);
  formData.append('tags', metadata.tags);

  if (password) {
    formData.append('password', password);
  }

  const response = await api.post<ImportSuccessResponse>('/certificates/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return response.data;
}

/**
 * Upload CSV for preview/validation (no import).
 *
 * POST /api/certificates/import/csv
 */
export async function previewCsvImport(file: File): Promise<CsvPreviewResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post<CsvPreviewResponse>('/certificates/import/csv', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return response.data;
}

/**
 * Execute CSV import (confirmed).
 *
 * POST /api/certificates/import/csv?confirm=true
 */
export async function executeCsvImport(file: File): Promise<CsvImportSummary> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('confirm', 'true');

  const response = await api.post<CsvImportSummary>(
    '/certificates/import/csv?confirm=true',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );

  return response.data;
}

/**
 * Download the CSV template.
 *
 * GET /api/certificates/import/csv/template
 */
export async function downloadCsvTemplate(): Promise<Blob> {
  const response = await api.get('/certificates/import/csv/template', {
    responseType: 'blob',
  });
  return response.data as Blob;
}
