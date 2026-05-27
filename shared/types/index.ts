/**
 * Shared types for certificado-digital monorepo.
 *
 * Re-exports all domain types consumed by both frontend and backend.
 */

/** Certificate environment enum */
export type Environment = 'dev' | 'hml' | 'prd';

/** Certificate status derived from dates / revocation */
export type CertificateStatus = 'active' | 'expiring' | 'expired' | 'revoked';

/** Core certificate metadata */
export interface Certificate {
  id: string;
  commonName: string;
  sans: string[];
  serial: string;
  issuer: string;
  notBefore: string; // ISO-8601
  notAfter: string; // ISO-8601
  algorithm: string;
  fingerprintSha256: string;
  owner: string;
  application: string;
  environment: Environment;
  zone: string;
  caProvider: string;
  revoked: boolean;
  tags: Record<string, string>;
  customFields: Record<string, string>;
  description: string;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

/** Audit log action types */
export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'REVOKE';

/** Audit log result */
export type AuditResult = 'SUCCESS' | 'FAILURE';

/** Audit log entry */
export interface AuditLogEntry {
  id: string;
  certId: string | null;
  certCn: string;
  action: AuditAction;
  actor: string;
  result: AuditResult;
  detail: string;
  batchId: string | null;
  timestamp: string; // ISO-8601
}

/** Audit log filter parameters (query string) */
export interface AuditFilterParams {
  page?: string;
  pageSize?: string;
  action?: string;
  actor?: string;
  certificateId?: string;
  batchId?: string;
  dateFrom?: string;
  dateTo?: string;
  result?: string;
}

/** Paginated response wrapper */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** API error response */
export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
}
