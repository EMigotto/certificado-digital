import type { PaginatedResponse } from '@certificado-digital/shared';

/** Pagination defaults */
export const PAGINATION_DEFAULTS = {
  page: 1,
  pageSize: 25,
  maxPageSize: 100,
} as const;

/** Parsed pagination parameters */
export interface PaginationParams {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

/**
 * Parse and clamp pagination query parameters.
 * - page: 1-based, defaults to 1
 * - pageSize: clamped to [1, 100], defaults to 25
 */
export function parsePaginationParams(query: {
  page?: string | number;
  pageSize?: string | number;
}): PaginationParams {
  const rawPage = Number(query.page);
  const rawPageSize = Number(query.pageSize);
  let page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : PAGINATION_DEFAULTS.page;
  let pageSize =
    Number.isFinite(rawPageSize) && rawPageSize > 0 ? rawPageSize : PAGINATION_DEFAULTS.pageSize;

  // Clamp values
  page = Math.max(1, Math.floor(page));
  pageSize = Math.max(1, Math.min(PAGINATION_DEFAULTS.maxPageSize, Math.floor(pageSize)));

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

/**
 * Build a paginated response wrapper.
 */
export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedResponse<T> {
  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
