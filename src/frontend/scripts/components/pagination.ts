/**
 * Pagination component (AC 16-18, 50).
 * Renders "Mostrando X-Y de Z" + page buttons + Previous/Next.
 */

export interface PaginationState {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export type PageChangeCallback = (page: number) => void;

let onPageChange: PageChangeCallback | null = null;

export function setPageChangeCallback(cb: PageChangeCallback): void {
  onPageChange = cb;
}

export function renderPagination(state: PaginationState): string {
  const start = (state.page - 1) * state.pageSize + 1;
  const end = Math.min(state.page * state.pageSize, state.totalItems);

  // Build page buttons (show max 7 pages)
  const pages: (number | string)[] = [];
  const maxVisible = 7;
  if (state.totalPages <= maxVisible) {
    for (let i = 1; i <= state.totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (state.page > 3) pages.push('…');
    const rangeStart = Math.max(2, state.page - 1);
    const rangeEnd = Math.min(state.totalPages - 1, state.page + 1);
    for (let i = rangeStart; i <= rangeEnd; i++) pages.push(i);
    if (state.page < state.totalPages - 2) pages.push('…');
    pages.push(state.totalPages);
  }

  const pageButtons = pages.map((p) => {
    if (p === '…') {
      return `<span class="page-btn" style="border:none;cursor:default;">…</span>`;
    }
    const isActive = p === state.page ? 'active' : '';
    return `<button class="page-btn ${isActive}" data-page="${p}">${p}</button>`;
  }).join('');

  return `
    <div class="pagination" id="pagination">
      <div class="pagination-info">
        Mostrando ${state.totalItems > 0 ? start : 0}–${end} de ${state.totalItems}
      </div>
      <div class="pagination-controls">
        <button class="page-btn" data-page="prev" ${!state.hasPreviousPage ? 'disabled' : ''}>← Anterior</button>
        ${pageButtons}
        <button class="page-btn" data-page="next" ${!state.hasNextPage ? 'disabled' : ''}>Próximo →</button>
      </div>
    </div>`;
}

export function attachPaginationEvents(currentPage: number): void {
  const pagination = document.getElementById('pagination');
  if (!pagination) return;

  pagination.querySelectorAll('.page-btn[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = (btn as HTMLElement).dataset.page;
      if (!val || (btn as HTMLButtonElement).disabled) return;

      let newPage = currentPage;
      if (val === 'prev') newPage = currentPage - 1;
      else if (val === 'next') newPage = currentPage + 1;
      else newPage = parseInt(val, 10);

      if (newPage > 0 && onPageChange) onPageChange(newPage);
    });
  });
}
