/**
 * Pagination logic for certificate inventory.
 * Maps to AC 1.1, 5.3.
 */

export interface Page<T> {
  /** Items for current page only (AC 5.3 — don't load all) */
  items: T[];
  /** Current page number (1-based) */
  page: number;
  /** Items per page */
  pageSize: number;
  /** Total item count */
  totalItems: number;
  /** Total number of pages */
  totalPages: number;
  /** Whether there is a next page */
  hasNextPage: boolean;
  /** Whether there is a previous page */
  hasPreviousPage: boolean;
}

/**
 * Paginate an array of items (AC 1.1).
 * @param items Full list
 * @param page Requested page (1-based)
 * @param pageSize Items per page (default 25)
 */
export function paginate<T>(items: T[], page: number, pageSize: number = 25): Page<T> {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * pageSize;
  const end = Math.min(start + pageSize, totalItems);

  return {
    items: items.slice(start, end),
    page: safePage,
    pageSize,
    totalItems,
    totalPages,
    hasNextPage: safePage < totalPages,
    hasPreviousPage: safePage > 1,
  };
}

/**
 * Format the pagination footer label (AC 1.1).
 * E.g. "Mostrando 25 de 2847"
 */
export function paginationLabel(page: Page<unknown>): string {
  return `Mostrando ${page.items.length} de ${page.totalItems}`;
}
