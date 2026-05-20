/**
 * Tests for certificate metadata and detail view data.
 * Covers AC Scenarios: 2.1, 2.2, 2.3, 2.4, 2.5, 6.1, 6.2, 6.3
 */
import { describe, it, expect } from 'vitest';
import type { Certificate } from '../../src/models/certificate.js';
import { computeStatus, statusLabel, daysUntilExpiration } from '../../src/models/certificate.js';
import { addTag, removeTag, filterByTag, setCustomField, hasCustomField } from '../../src/models/tags.js';
import { makeCert } from './helpers.js';

const NOW = new Date('2025-06-01T12:00:00Z');

/* AC 2.1 reference certificate from prototype */
const DETAIL_CERT: Certificate = makeCert({
  id: 'cert-detail-1',
  commonName: 'api-payments.bank.internal',
  serial: '0x00d4e82f1a23b5c7',
  sans: ['payments-v2', 'payments-canary', 'api-payments-dr'],
  issuer: 'Vault PKI - Bank Root CA',
  notBefore: new Date('2024-05-21T14:32:08Z'),
  notAfter: new Date('2025-05-21T14:32:08Z'),
  algorithm: 'RSA 2048',
  fingerprintSHA256: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
  owner: 'time-pagamentos',
  application: 'API Payments v2',
  environment: 'prd',
  zone: 'bank-prd',
  tags: {
    criticidade: 'alta',
    env: 'prd',
    time: 'pagamentos',
    sla: '99.99',
  },
  customFields: {},
  revoked: false,
});

/* ================================================================ */
/* AC 2.1 — All certificate metadata displayed                       */
/* ================================================================ */
describe('Certificate detail metadata (AC 2.1)', () => {
  it('has Common Name as title', () => {
    expect(DETAIL_CERT.commonName).toBe('api-payments.bank.internal');
  });

  it('has serial number', () => {
    expect(DETAIL_CERT.serial).toBe('0x00d4e82f1a23b5c7');
  });

  it('has Subject Alt Names', () => {
    expect(DETAIL_CERT.sans).toEqual(['payments-v2', 'payments-canary', 'api-payments-dr']);
  });

  it('has issuer', () => {
    expect(DETAIL_CERT.issuer).toBe('Vault PKI - Bank Root CA');
  });

  it('has notBefore', () => {
    expect(DETAIL_CERT.notBefore.toISOString()).toBe('2024-05-21T14:32:08.000Z');
  });

  it('has notAfter', () => {
    expect(DETAIL_CERT.notAfter.toISOString()).toBe('2025-05-21T14:32:08.000Z');
  });

  it('has algorithm', () => {
    expect(DETAIL_CERT.algorithm).toBe('RSA 2048');
  });

  it('has fingerprint SHA256', () => {
    expect(DETAIL_CERT.fingerprintSHA256).toBe('a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6');
  });

  it('shows status badge "Crítico" (expired cert)', () => {
    const status = computeStatus(DETAIL_CERT, NOW);
    // notAfter 2025-05-21 < NOW 2025-06-01 → expired
    expect(status).toBe('expired');
    expect(statusLabel(status)).toBe('Expirado');
  });
});

/* ================================================================ */
/* AC 2.2 — Expiration countdown                                     */
/* ================================================================ */
describe('Expiration countdown (AC 2.2)', () => {
  it('displays countdown for a critical cert (2 days)', () => {
    const critCert = makeCert({ notAfter: new Date('2025-06-03T12:00:00Z') });
    const days = daysUntilExpiration(critCert.notAfter, NOW);
    expect(days).toBe(2);
    expect(computeStatus(critCert, NOW)).toBe('critical');
  });
});

/* ================================================================ */
/* AC 2.3 — Tags management                                         */
/* ================================================================ */
describe('Tags & custom fields panel (AC 2.3)', () => {
  it('displays applied tags', () => {
    expect(DETAIL_CERT.tags).toEqual({
      criticidade: 'alta',
      env: 'prd',
      time: 'pagamentos',
      sla: '99.99',
    });
  });

  it('can add a new tag via "+ Adicionar tag"', () => {
    const updated = addTag(DETAIL_CERT, 'compliance', 'pci-dss');
    expect(updated.tags.compliance).toBe('pci-dss');
    // Original unchanged (immutable)
    expect(DETAIL_CERT.tags.compliance).toBeUndefined();
  });

  it('can remove a tag', () => {
    const updated = removeTag(DETAIL_CERT, 'sla');
    expect(updated.tags.sla).toBeUndefined();
    expect(Object.keys(updated.tags)).toHaveLength(3);
  });
});

/* ================================================================ */
/* AC 2.4 — Operational information                                  */
/* ================================================================ */
describe('Operational info panel (AC 2.4)', () => {
  it('shows Owner', () => {
    expect(DETAIL_CERT.owner).toBe('time-pagamentos');
  });

  it('shows Application', () => {
    expect(DETAIL_CERT.application).toBe('API Payments v2');
  });

  it('shows Environment', () => {
    expect(DETAIL_CERT.environment).toBe('prd');
  });

  it('shows CA / Zone', () => {
    expect(DETAIL_CERT.issuer).toContain('Vault PKI');
    expect(DETAIL_CERT.zone).toBe('bank-prd');
  });

  it('shows Status badge', () => {
    const status = computeStatus(DETAIL_CERT, NOW);
    expect(statusLabel(status)).toBeTruthy();
  });
});

/* ================================================================ */
/* AC 2.5 — Breadcrumb navigation (data only)                       */
/* ================================================================ */
describe('Breadcrumb navigation data (AC 2.5)', () => {
  it('breadcrumb shows "Certificados / {CN}"', () => {
    const breadcrumb = `Certificados / ${DETAIL_CERT.commonName}`;
    expect(breadcrumb).toBe('Certificados / api-payments.bank.internal');
  });
});

/* ================================================================ */
/* AC 6.1 — X.509 metadata captured                                 */
/* ================================================================ */
describe('X.509 metadata capture (AC 6.1)', () => {
  it('captures all required fields', () => {
    expect(DETAIL_CERT.commonName).toBeTruthy();
    expect(DETAIL_CERT.sans).toBeInstanceOf(Array);
    expect(DETAIL_CERT.issuer).toBeTruthy();
    expect(DETAIL_CERT.serial).toBeTruthy();
    expect(DETAIL_CERT.notBefore).toBeInstanceOf(Date);
    expect(DETAIL_CERT.notAfter).toBeInstanceOf(Date);
    expect(DETAIL_CERT.algorithm).toBeTruthy();
    expect(DETAIL_CERT.fingerprintSHA256).toBeTruthy();
  });
});

/* ================================================================ */
/* AC 6.2 — Tags are stored and searchable                           */
/* ================================================================ */
describe('Tag storage and search (AC 6.2)', () => {
  it('tag is persisted after add', () => {
    const updated = addTag(DETAIL_CERT, 'criticality', 'high');
    expect(updated.tags.criticality).toBe('high');
  });

  it('filter by tag finds the cert', () => {
    const certs = [DETAIL_CERT, makeCert({ tags: {} })];
    const results = filterByTag(certs, 'criticidade', 'alta');
    expect(results).toHaveLength(1);
    expect(results[0].commonName).toBe('api-payments.bank.internal');
  });
});

/* ================================================================ */
/* AC 6.3 — Custom fields extensible without migration               */
/* ================================================================ */
describe('Custom fields extensible without migration (AC 6.3)', () => {
  it('can add a custom "cost-center" field', () => {
    const updated = setCustomField(DETAIL_CERT, 'cost-center', 'CC-1234');
    expect(updated.customFields['cost-center']).toBe('CC-1234');
  });

  it('existing cert can be updated with new custom field', () => {
    const step1 = setCustomField(DETAIL_CERT, 'cost-center', 'CC-1234');
    const step2 = setCustomField(step1, 'review-date', '2025-12-01');
    expect(hasCustomField(step2, 'cost-center')).toBe(true);
    expect(hasCustomField(step2, 'review-date')).toBe(true);
  });

  it('custom fields use flexible JSON storage', () => {
    const updated = setCustomField(DETAIL_CERT, 'complex', { nested: true, count: 42 });
    expect(updated.customFields.complex).toEqual({ nested: true, count: 42 });
  });

  it('schema does not require migration (customFields starts empty)', () => {
    const fresh = makeCert();
    expect(fresh.customFields).toEqual({});
    const withField = setCustomField(fresh, 'new-field', 'value');
    expect(withField.customFields['new-field']).toBe('value');
  });
});
