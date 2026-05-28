/**
 * API response envelope types.
 *
 * Standardised wrappers used by every endpoint.
 */

/** Paginated list response */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Standard API error response */
export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
}

/** Single-item success response (for create / update) */
export interface ApiSuccess<T> {
  data: T;
}

/** Bulk operation result */
export interface BulkOperationResult {
  total: number;
  succeeded: number;
  failed: number;
  errors: Array<{ index: number; message: string }>;
}
