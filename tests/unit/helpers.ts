/**
 * Shared test helpers and fixture factories.
 */
import type { Certificate } from '../../src/models/certificate.js';

let idCounter = 0;

/**
 * Factory for building Certificate test fixtures.
 * Overridable defaults to keep tests concise.
 */
export function makeCert(overrides: Partial<Certificate> = {}): Certificate {
  idCounter += 1;
  return {
    id: `cert-${idCounter}`,
    commonName: 'test.example.com',
    sans: [],
    serial: '0x0001',
    issuer: 'Test CA',
    notBefore: new Date('2024-01-01T00:00:00Z'),
    notAfter: new Date('2025-12-31T23:59:59Z'),
    algorithm: 'RSA 2048',
    fingerprintSHA256: 'aabbccdd',
    owner: 'team-test',
    application: 'Test App',
    environment: 'prd',
    zone: 'test-zone',
    tags: {},
    customFields: {},
    revoked: false,
    ...overrides,
  };
}

/**
 * Build a large dataset for performance tests (AC 5.x).
 */
export function makeLargeDataset(count: number, now: Date = new Date()): Certificate[] {
  const certs: Certificate[] = [];
  const envs: ('dev' | 'hml' | 'prd')[] = ['dev', 'hml', 'prd'];
  const owners = ['time-pagamentos', 'time-data', 'time-plataforma', 'time-iam', 'time-comms'];
  const cas = ['Vault PKI', 'ACM PCA', 'DigiCert'];

  for (let i = 0; i < count; i++) {
    const daysOffset = (i % 400) - 10; // range from -10 to +389
    const expiry = new Date(now.getTime() + daysOffset * 86_400_000);
    certs.push(
      makeCert({
        id: `cert-bulk-${i}`,
        commonName: `svc-${i}.bank.internal`,
        sans: i % 3 === 0 ? [`svc-${i}-alt.bank.internal`] : [],
        serial: `0x${i.toString(16).padStart(16, '0')}`,
        issuer: cas[i % cas.length],
        notAfter: expiry,
        owner: owners[i % owners.length],
        environment: envs[i % envs.length],
        zone: `zone-${i % 5}`,
      }),
    );
  }
  return certs;
}
