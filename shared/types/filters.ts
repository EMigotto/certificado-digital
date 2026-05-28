/**
 * Filter, sort and pagination parameter types.
 *
 * Used by both the frontend (query building) and backend (query parsing).
 */

import type { CertStatus, Environment } from './certificate.js';

/** Available columns for sorting certificates */
export type CertSortField =
  | 'commonName'
  | 'notAfter'
  | 'notBefore'
  | 'status'
  | 'environment'
  | 'owner'
  | 'caName'
  | 'createdAt'
  | 'updatedAt';

/** Sort direction */
export type SortDirection = 'asc' | 'desc';

/** Sort parameters */
export interface SortParams {
  field: CertSortField;
  direction: SortDirection;
}

/** Filter parameters for certificate listing */
export interface FilterParams {
  /** Full-text search across CN, subject, owner, application, description */
  search?: string;

  /** Filter by certificate status(es) */
  status?: CertStatus[];

  /** Filter by environment(s) */
  environment?: Environment[];

  /** Filter by CA name(s) */
  caName?: string[];

  /** Filter by owner(s) */
  owner?: string[];

  /** Filter certificates expiring before this date (ISO-8601) */
  expiringBefore?: string;

  /** Filter certificates expiring after this date (ISO-8601) */
  expiringAfter?: string;

  /** Show only revoked certificates */
  revoked?: boolean;

  /** Filter by tag key-value pair (e.g. "team:platform") */
  tag?: string;
}

/** Pagination parameters */
export interface PaginationParams {
  /** 1-based page number */
  page: number;
  /** Items per page (max 100) */
  pageSize: number;
}

/** Combined query parameters for listing certificates */
export interface CertificateQueryParams {
  filters?: FilterParams;
  sort?: SortParams;
  pagination: PaginationParams;
}
