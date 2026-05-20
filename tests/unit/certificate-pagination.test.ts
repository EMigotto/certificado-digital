/**
 * Tests for pagination logic.
 * Covers AC Scenarios: 1.1, 5.3
 */
import { describe, it, expect } from 'vitest';
import { paginate, paginationLabel } from '../../src/models/pagination.js';

const items = Array.from({ length: 2847 }, (_, i) => `cert-${i}`);

/* ----- AC 1.1: Paginated list ----- */
describe('Paginated list (AC 1.1)', () => {
  it('returns first page of certificates', () => {
    const page = paginate(items, 1, 25);
    expect(page.items).toHaveLength(25);
    expect(page.page).toBe(1);
    expect(page.totalItems).toBe(2847);
    expect(page.hasNextPage).toBe(true);
    expect(page.hasPreviousPage).toBe(false);
  });

  it('shows footer label "Mostrando 25 de 2847" (AC 1.1)', () => {
    const page = paginate(items, 1, 25);
    expect(paginationLabel(page)).toBe('Mostrando 25 de 2847');
  });

  it('has "Próxima página" link (hasNextPage = true)', () => {
    const page = paginate(items, 1, 25);
    expect(page.hasNextPage).toBe(true);
  });

  it('last page has no next page', () => {
    const page = paginate(items, 114, 25);
    expect(page.hasNextPage).toBe(false);
  });

  it('last page shows remaining items', () => {
    const page = paginate(items, 114, 25);
    // 2847 % 25 = 22
    expect(page.items).toHaveLength(22);
    expect(paginationLabel(page)).toBe('Mostrando 22 de 2847');
  });

  it('calculates total pages correctly', () => {
    const page = paginate(items, 1, 25);
    expect(page.totalPages).toBe(Math.ceil(2847 / 25));
  });
});

/* ----- AC 5.3: Only current page items loaded ----- */
describe('Only current page loaded (AC 5.3)', () => {
  it('page 1 only contains first 25 items, not all 2847', () => {
    const page = paginate(items, 1, 25);
    expect(page.items).toHaveLength(25);
    expect(page.items[0]).toBe('cert-0');
    expect(page.items[24]).toBe('cert-24');
  });

  it('page 2 fetches next set of items', () => {
    const page = paginate(items, 2, 25);
    expect(page.items[0]).toBe('cert-25');
    expect(page.hasPreviousPage).toBe(true);
  });

  it('each page returns at most pageSize items', () => {
    for (let p = 1; p <= 5; p++) {
      const page = paginate(items, p, 25);
      expect(page.items.length).toBeLessThanOrEqual(25);
    }
  });
});

/* ----- Edge cases ----- */
describe('Pagination edge cases', () => {
  it('page 0 is clamped to page 1', () => {
    const page = paginate(items, 0, 25);
    expect(page.page).toBe(1);
  });

  it('page beyond total is clamped to last page', () => {
    const page = paginate(items, 9999, 25);
    expect(page.page).toBe(114);
  });

  it('empty dataset returns single empty page', () => {
    const page = paginate([], 1, 25);
    expect(page.items).toHaveLength(0);
    expect(page.totalPages).toBe(1);
    expect(page.hasNextPage).toBe(false);
    expect(page.hasPreviousPage).toBe(false);
    expect(paginationLabel(page)).toBe('Mostrando 0 de 0');
  });
});
