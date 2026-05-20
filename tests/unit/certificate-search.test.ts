/**
 * Tests for certificate search functionality.
 * Covers AC Scenarios: 1.2, 1.3, 1.4, 1.14
 */
import { describe, it, expect } from 'vitest';
import { searchCertificates } from '../../src/models/filters.js';
import { makeCert } from './helpers.js';

const FIXTURES = [
  makeCert({
    commonName: 'api-payments.bank.internal',
    sans: ['payments-v2', 'payments-canary'],
    serial: '0x00d4e82f1a23b5c7',
    owner: 'time-pagamentos',
  }),
  makeCert({
    commonName: 'mtls-broker-kafka.bank.internal',
    sans: [],
    serial: '0x00aabb1122334455',
    owner: 'time-data',
  }),
  makeCert({
    commonName: 'gateway-edge.bank.internal',
    sans: ['gw-alt-1', 'gw-alt-2', 'gw-alt-3', 'gw-alt-4'],
    serial: '0x00ff0011ff001100',
    owner: 'time-plataforma',
  }),
  makeCert({
    commonName: 'auth-svc.bank.internal',
    sans: ['auth-alt'],
    serial: '0x0099887766554433',
    owner: 'time-iam',
  }),
  makeCert({
    commonName: 'notification-worker.bank.internal',
    sans: ['notif-v2', 'notif-canary', 'notif-dr'],
    serial: '0x0011223344556677',
    owner: 'time-comms',
  }),
];

/* ----- AC 1.2: Search by Common Name ----- */
describe('Search by Common Name (AC 1.2)', () => {
  it('finds certificate by partial CN "api-payments"', () => {
    const results = searchCertificates(FIXTURES, 'api-payments');
    expect(results).toHaveLength(1);
    expect(results[0].commonName).toBe('api-payments.bank.internal');
  });

  it('search is case-insensitive', () => {
    const results = searchCertificates(FIXTURES, 'API-PAYMENTS');
    expect(results).toHaveLength(1);
    expect(results[0].commonName).toBe('api-payments.bank.internal');
  });

  it('finds multiple results for broad query "bank.internal"', () => {
    const results = searchCertificates(FIXTURES, 'bank.internal');
    expect(results).toHaveLength(5);
  });
});

/* ----- AC 1.3: Search by SAN ----- */
describe('Search by SAN (AC 1.3)', () => {
  it('finds certificate by SAN "payments-canary"', () => {
    const results = searchCertificates(FIXTURES, 'payments-canary');
    expect(results).toHaveLength(1);
    expect(results[0].commonName).toBe('api-payments.bank.internal');
  });

  it('finds certificate by partial SAN "notif-v2"', () => {
    const results = searchCertificates(FIXTURES, 'notif-v2');
    expect(results).toHaveLength(1);
    expect(results[0].commonName).toBe('notification-worker.bank.internal');
  });

  it('does not match certificates without the SAN', () => {
    const results = searchCertificates(FIXTURES, 'gw-alt-1');
    expect(results).toHaveLength(1);
    expect(results[0].commonName).toBe('gateway-edge.bank.internal');
  });
});

/* ----- AC 1.4: Search by Serial Number ----- */
describe('Search by Serial Number (AC 1.4)', () => {
  it('finds certificate by exact serial "0x00d4e82f1a23b5c7"', () => {
    const results = searchCertificates(FIXTURES, '0x00d4e82f1a23b5c7');
    expect(results).toHaveLength(1);
    expect(results[0].commonName).toBe('api-payments.bank.internal');
  });

  it('finds certificate by partial serial prefix', () => {
    const results = searchCertificates(FIXTURES, '0x00aabb');
    expect(results).toHaveLength(1);
    expect(results[0].commonName).toBe('mtls-broker-kafka.bank.internal');
  });
});

/* ----- AC 1.14: Empty/no results ----- */
describe('Negative: Empty search returns no results (AC 1.14)', () => {
  it('returns no results for non-existent CN', () => {
    const results = searchCertificates(FIXTURES, 'nonexistentcertificate-xyz');
    expect(results).toHaveLength(0);
  });

  it('returns all certificates for empty query', () => {
    const results = searchCertificates(FIXTURES, '');
    expect(results).toHaveLength(FIXTURES.length);
  });

  it('returns all certificates for whitespace-only query', () => {
    const results = searchCertificates(FIXTURES, '   ');
    expect(results).toHaveLength(FIXTURES.length);
  });
});

/* ----- Search by Owner ----- */
describe('Search by Owner', () => {
  it('finds certificates by owner "time-pagamentos"', () => {
    const results = searchCertificates(FIXTURES, 'time-pagamentos');
    expect(results).toHaveLength(1);
    expect(results[0].owner).toBe('time-pagamentos');
  });
});
