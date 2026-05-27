import { describe, it, expect } from 'vitest';
import { createCertificateList, createPaginatedResponse } from '../mocks/data';
import {
  truncateCn,
  daysUntilExpiry,
  getStatusVariant,
  formatSansSummary,
  formatNumber,
} from '@/utils/formatters';

/**
 * Performance benchmarks for processing 10k+ certificates.
 * These tests verify that data processing operations complete within
 * acceptable time bounds for the FR8 requirements.
 */

describe('Performance: Large Dataset (10k certs)', () => {
  it('FR8.1: creates 10k certificates in <1s', () => {
    const start = performance.now();
    const certs = createCertificateList(10_000);
    const elapsed = performance.now() - start;

    expect(certs).toHaveLength(10_000);
    expect(elapsed).toBeLessThan(1000);
  });

  it('FR8.2: filters 10k certs by CN in <2s', () => {
    const certs = createCertificateList(10_000);

    const start = performance.now();
    const filtered = certs.filter((c) =>
      c.commonName.toLowerCase().includes('service-5000'),
    );
    const elapsed = performance.now() - start;

    expect(filtered.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(2000);
  });

  it('FR8.3: search with CN truncation on 10k certs in <2s', () => {
    const certs = createCertificateList(10_000);

    const start = performance.now();
    const results = certs.map((c) => ({
      cn: truncateCn(c.commonName),
      days: daysUntilExpiry(c.notAfter),
      variant: getStatusVariant(daysUntilExpiry(c.notAfter), c.revoked),
      sans: formatSansSummary(c.sans),
    }));
    const elapsed = performance.now() - start;

    expect(results).toHaveLength(10_000);
    expect(elapsed).toBeLessThan(2000);
  });

  it('FR8.4: sorts 10k certs by commonName in <100ms', () => {
    const certs = createCertificateList(10_000);

    const start = performance.now();
    const sorted = [...certs].sort((a, b) => a.commonName.localeCompare(b.commonName));
    const elapsed = performance.now() - start;

    expect(sorted).toHaveLength(10_000);
    expect(elapsed).toBeLessThan(100);
  });

  it('FR8.4: sorts 10k certs by expiry date in <100ms', () => {
    const certs = createCertificateList(10_000);

    const start = performance.now();
    const sorted = [...certs].sort(
      (a, b) => new Date(a.notAfter).getTime() - new Date(b.notAfter).getTime(),
    );
    const elapsed = performance.now() - start;

    expect(sorted).toHaveLength(10_000);
    expect(elapsed).toBeLessThan(100);
  });

  it('paginates 10k certs correctly', () => {
    const certs = createCertificateList(10_000);
    const response = createPaginatedResponse(certs.slice(0, 25), 1, 25, 10_000);

    expect(response.data).toHaveLength(25);
    expect(response.total).toBe(10_000);
    expect(response.totalPages).toBe(400);
    expect(response.page).toBe(1);
  });

  it('formatNumber handles large totals', () => {
    expect(formatNumber(10000)).toBe('10.000');
    expect(formatNumber(100000)).toBe('100.000');
    expect(formatNumber(1000000)).toBe('1.000.000');
  });

  it('processes mixed status certs (expired, active, revoked)', () => {
    const certs = createCertificateList(1000);
    // Mutate some certs to be expired/revoked for realistic data
    certs.slice(0, 100).forEach((c) => {
      c.notAfter = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    });
    certs.slice(100, 200).forEach((c) => {
      c.revoked = true;
    });
    certs.slice(200, 300).forEach((c) => {
      c.notAfter = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    });

    const start = performance.now();
    const processed = certs.map((c) => {
      const days = daysUntilExpiry(c.notAfter);
      return {
        cn: truncateCn(c.commonName),
        variant: getStatusVariant(days, c.revoked),
        days,
      };
    });
    const elapsed = performance.now() - start;

    const expired = processed.filter((p) => p.variant === 'crit');
    const revoked = processed.filter((p) => p.variant === 'rev');
    const warning = processed.filter((p) => p.variant === 'warn');

    expect(expired.length).toBeGreaterThanOrEqual(100);
    expect(revoked.length).toBe(100);
    expect(warning.length).toBeGreaterThanOrEqual(100);
    expect(elapsed).toBeLessThan(500);
  });
});
