/**
 * Tests for certificate filtering.
 * Covers AC Scenarios: 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.15
 */
import { describe, it, expect } from 'vitest';
import {
  applyFilters,
  filterBadge,
  parseFilter,
  type InventoryFilter,
} from '../../src/models/filters.js';
import { makeCert } from './helpers.js';

const NOW = new Date('2025-06-01T12:00:00Z');

const FIXTURES = [
  makeCert({
    commonName: 'api-payments.bank.internal',
    notAfter: new Date('2025-06-13T00:00:00Z'), // 12 days
    environment: 'prd',
    owner: 'time-pagamentos',
    issuer: 'Vault PKI',
  }),
  makeCert({
    commonName: 'mtls-broker.bank.internal',
    notAfter: new Date('2025-06-06T00:00:00Z'), // 5 days
    environment: 'prd',
    owner: 'time-data',
    issuer: 'ACM PCA',
  }),
  makeCert({
    commonName: 'gateway-edge.bank.internal',
    notAfter: new Date('2025-06-19T00:00:00Z'), // 18 days
    environment: 'prd',
    owner: 'time-plataforma',
    issuer: 'Vault PKI',
  }),
  makeCert({
    commonName: 'auth-svc.bank.internal',
    notAfter: new Date('2025-06-27T00:00:00Z'), // 26 days
    environment: 'hml',
    owner: 'time-iam',
    issuer: 'Vault PKI',
  }),
  makeCert({
    commonName: 'dev-service.bank.internal',
    notAfter: new Date('2025-12-01T00:00:00Z'), // 183 days
    environment: 'dev',
    owner: 'time-pagamentos',
    issuer: 'Vault PKI',
  }),
];

/* ----- AC 1.5: Filter by expiration window (< 30d) ----- */
describe('Filter by expiration window (AC 1.5)', () => {
  it('filters certs expiring in < 30 days', () => {
    const filters: InventoryFilter[] = [{ kind: 'expiration', maxDays: 30 }];
    const results = applyFilters(FIXTURES, filters, NOW);
    // 12d, 5d, 18d, 26d match; 183d does not
    expect(results).toHaveLength(4);
  });

  it('filters certs expiring in < 7 days', () => {
    const filters: InventoryFilter[] = [{ kind: 'expiration', maxDays: 7 }];
    const results = applyFilters(FIXTURES, filters, NOW);
    // Only 5d matches
    expect(results).toHaveLength(1);
    expect(results[0].commonName).toBe('mtls-broker.bank.internal');
  });

  it('excludes already expired certs from expiration filter', () => {
    const withExpired = [
      ...FIXTURES,
      makeCert({
        commonName: 'expired.bank.internal',
        notAfter: new Date('2025-05-20T00:00:00Z'), // expired
      }),
    ];
    const filters: InventoryFilter[] = [{ kind: 'expiration', maxDays: 30 }];
    const results = applyFilters(withExpired, filters, NOW);
    expect(results.every((c) => c.commonName !== 'expired.bank.internal')).toBe(true);
  });

  it('shows badge "expira: < 30d" for filter', () => {
    const badge = filterBadge({ kind: 'expiration', maxDays: 30 });
    expect(badge).toBe('expira: < 30d');
  });
});

/* ----- AC 1.6: Filter by environment ----- */
describe('Filter by environment (AC 1.6)', () => {
  it('filters by env: prd', () => {
    const filters: InventoryFilter[] = [{ kind: 'environment', value: 'prd' }];
    const results = applyFilters(FIXTURES, filters, NOW);
    expect(results).toHaveLength(3);
    expect(results.every((c) => c.environment === 'prd')).toBe(true);
  });

  it('filters by env: hml', () => {
    const filters: InventoryFilter[] = [{ kind: 'environment', value: 'hml' }];
    const results = applyFilters(FIXTURES, filters, NOW);
    expect(results).toHaveLength(1);
    expect(results[0].commonName).toBe('auth-svc.bank.internal');
  });

  it('filters by env: dev', () => {
    const filters: InventoryFilter[] = [{ kind: 'environment', value: 'dev' }];
    const results = applyFilters(FIXTURES, filters, NOW);
    expect(results).toHaveLength(1);
    expect(results[0].commonName).toBe('dev-service.bank.internal');
  });

  it('shows badge "env: prd"', () => {
    expect(filterBadge({ kind: 'environment', value: 'prd' })).toBe('env: prd');
  });
});

/* ----- AC 1.7: Filter by owner ----- */
describe('Filter by owner (AC 1.7)', () => {
  it('filters by owner: time-pagamentos', () => {
    const filters: InventoryFilter[] = [{ kind: 'owner', value: 'time-pagamentos' }];
    const results = applyFilters(FIXTURES, filters, NOW);
    expect(results).toHaveLength(2);
    expect(results.every((c) => c.owner === 'time-pagamentos')).toBe(true);
  });

  it('shows badge "owner: time-pagamentos"', () => {
    expect(filterBadge({ kind: 'owner', value: 'time-pagamentos' })).toBe(
      'owner: time-pagamentos',
    );
  });
});

/* ----- AC 1.8: Filter by CA ----- */
describe('Filter by CA (AC 1.8)', () => {
  it('filters by ca: Vault PKI', () => {
    const filters: InventoryFilter[] = [{ kind: 'ca', value: 'Vault PKI' }];
    const results = applyFilters(FIXTURES, filters, NOW);
    expect(results).toHaveLength(4);
    expect(results.every((c) => c.issuer.includes('Vault PKI'))).toBe(true);
  });

  it('filters by ca: ACM PCA', () => {
    const filters: InventoryFilter[] = [{ kind: 'ca', value: 'ACM PCA' }];
    const results = applyFilters(FIXTURES, filters, NOW);
    expect(results).toHaveLength(1);
    expect(results[0].commonName).toBe('mtls-broker.bank.internal');
  });

  it('shows badge "ca: Vault PKI"', () => {
    expect(filterBadge({ kind: 'ca', value: 'Vault PKI' })).toBe('ca: Vault PKI');
  });
});

/* ----- AC 1.9: Combine multiple filters (AND logic) ----- */
describe('Combine multiple filters — AND logic (AC 1.9)', () => {
  it('combines env:prd AND owner:time-pagamentos AND expira:<30d', () => {
    const filters: InventoryFilter[] = [
      { kind: 'environment', value: 'prd' },
      { kind: 'owner', value: 'time-pagamentos' },
      { kind: 'expiration', maxDays: 30 },
    ];
    const results = applyFilters(FIXTURES, filters, NOW);
    // api-payments: prd, time-pagamentos, 12d ✓
    // dev-service: dev → excluded
    expect(results).toHaveLength(1);
    expect(results[0].commonName).toBe('api-payments.bank.internal');
  });

  it('empty filters returns all', () => {
    const results = applyFilters(FIXTURES, [], NOW);
    expect(results).toHaveLength(FIXTURES.length);
  });
});

/* ----- AC 1.10: Clear single filter ----- */
describe('Clear single filter (AC 1.10)', () => {
  it('removing a filter from the list broadens results', () => {
    // Use owner + expiration so removing one clearly widens results
    const allFilters: InventoryFilter[] = [
      { kind: 'owner', value: 'time-pagamentos' },
      { kind: 'expiration', maxDays: 7 },
    ];
    const resultsBoth = applyFilters(FIXTURES, allFilters, NOW);
    // time-pagamentos (12d, 183d) → expiration < 7d → 0 matches

    // Remove expiration filter (simulate ×-click)
    const afterClear = allFilters.filter((f) => f.kind !== 'expiration');
    const resultsAfterClear = applyFilters(FIXTURES, afterClear, NOW);
    // Just owner filter → 2 matches

    expect(resultsAfterClear.length).toBeGreaterThan(resultsBoth.length);
  });
});

/* ----- AC 1.15: Invalid filter ----- */
describe('Invalid filter value (AC 1.15)', () => {
  it('parseFilter returns null for "expira: invalid"', () => {
    expect(parseFilter('expira: invalid')).toBeNull();
  });

  it('parseFilter returns null for completely invalid input', () => {
    expect(parseFilter('foobar')).toBeNull();
  });

  it('parseFilter returns null for unknown filter key', () => {
    expect(parseFilter('unknown: value')).toBeNull();
  });

  it('parseFilter returns null for empty string', () => {
    expect(parseFilter('')).toBeNull();
  });

  it('parseFilter returns null for negative day value', () => {
    expect(parseFilter('expira: < -5d')).toBeNull();
  });

  it('parseFilter returns null for invalid env', () => {
    expect(parseFilter('env: staging')).toBeNull();
  });

  it('parseFilter correctly parses "expira: < 30d"', () => {
    const f = parseFilter('expira: < 30d');
    expect(f).toEqual({ kind: 'expiration', maxDays: 30 });
  });

  it('parseFilter correctly parses "env: prd"', () => {
    const f = parseFilter('env: prd');
    expect(f).toEqual({ kind: 'environment', value: 'prd' });
  });

  it('parseFilter correctly parses "owner: time-pagamentos"', () => {
    const f = parseFilter('owner: time-pagamentos');
    expect(f).toEqual({ kind: 'owner', value: 'time-pagamentos' });
  });

  it('parseFilter correctly parses "ca: Vault PKI"', () => {
    const f = parseFilter('ca: Vault PKI');
    expect(f).toEqual({ kind: 'ca', value: 'Vault PKI' });
  });
});
