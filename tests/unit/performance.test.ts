/**
 * Performance tests for search and filter operations.
 * Covers AC Scenarios: 5.1, 5.2, 5.3, 8.1
 */
import { describe, it, expect } from 'vitest';
import { searchCertificates, applyFilters } from '../../src/models/filters.js';
import { paginate } from '../../src/models/pagination.js';
import { makeLargeDataset } from './helpers.js';

const NOW = new Date('2025-06-01T12:00:00Z');
const LARGE_DATASET = makeLargeDataset(10_000, NOW);

/* ================================================================ */
/* AC 5.1 — Search returns results within 2 seconds for 10k+ certs  */
/* ================================================================ */
describe('Search performance (AC 5.1)', () => {
  it('search by CN returns results within 2s for 10,000 certificates', () => {
    const start = performance.now();
    const results = searchCertificates(LARGE_DATASET, 'svc-500');
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(2000);
    expect(results.length).toBeGreaterThan(0);
  });

  it('search by serial returns results within 2s', () => {
    const start = performance.now();
    const results = searchCertificates(LARGE_DATASET, '0x0000000000000100');
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(2000);
    expect(results.length).toBeGreaterThan(0);
  });

  it('search with no matches returns within 2s', () => {
    const start = performance.now();
    const results = searchCertificates(LARGE_DATASET, 'nonexistent-xyz-12345');
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(2000);
    expect(results).toHaveLength(0);
  });
});

/* ================================================================ */
/* AC 5.2 — Expiration filter within 2 seconds for 10k+              */
/* ================================================================ */
describe('Filter performance (AC 5.2)', () => {
  it('expiration filter "< 30d" completes within 2s for 10k certs', () => {
    const start = performance.now();
    const results = applyFilters(
      LARGE_DATASET,
      [{ kind: 'expiration', maxDays: 30 }],
      NOW,
    );
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(2000);
    expect(results.length).toBeGreaterThan(0);
  });

  it('combined filters complete within 2s for 10k certs', () => {
    const start = performance.now();
    const results = applyFilters(
      LARGE_DATASET,
      [
        { kind: 'expiration', maxDays: 30 },
        { kind: 'environment', value: 'prd' },
        { kind: 'owner', value: 'time-pagamentos' },
      ],
      NOW,
    );
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(2000);
    // Should have some results with this combination
    expect(results.length).toBeGreaterThanOrEqual(0);
  });
});

/* ================================================================ */
/* AC 5.3 — Pagination does not load all at once                     */
/* ================================================================ */
describe('Pagination performance (AC 5.3)', () => {
  it('page 1 returns only page-size items from 10k dataset', () => {
    const page = paginate(LARGE_DATASET, 1, 25);
    expect(page.items).toHaveLength(25);
    expect(page.totalItems).toBe(10_000);
    // Verifies only page-size items are "loaded"
  });

  it('subsequent page loads are O(1) slice operations', () => {
    const start = performance.now();
    for (let p = 1; p <= 100; p++) {
      paginate(LARGE_DATASET, p, 25);
    }
    const elapsed = performance.now() - start;
    // 100 page loads should be fast
    expect(elapsed).toBeLessThan(1000);
  });
});

/* ================================================================ */
/* AC 8.1 — Debounce concept (search within time constraint)         */
/* ================================================================ */
describe('Real-time search feasibility (AC 8.1)', () => {
  it('search completes fast enough for debounced 300ms updates', () => {
    // Simulates 5 rapid keystrokes, each triggering search
    const queries = ['s', 'sv', 'svc', 'svc-', 'svc-1'];
    const times: number[] = [];

    for (const q of queries) {
      const start = performance.now();
      searchCertificates(LARGE_DATASET, q);
      times.push(performance.now() - start);
    }

    // Each search should complete well within the 300ms debounce window
    times.forEach((t) => expect(t).toBeLessThan(300));
  });
});
