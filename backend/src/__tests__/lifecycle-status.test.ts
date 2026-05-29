/**
 * QA Tests — C2 Lifecycle: Status Computation & Transitions
 *
 * Maps to Acceptance Criteria:
 * - FR5 Scenario 5.1: Status transitions during issue (PENDING → ISSUED)
 * - FR5 Scenario 5.2: Status transitions during renewal
 * - FR5 Scenario 5.3: Expired certificate detection
 * - FR5 Scenario 5.4: Expiring soon warning (<30 days)
 */
import { describe, it, expect } from 'vitest';
import {
  computeStatus,
  computeDaysUntilExpiry,
  mapToApiCertificate,
} from '../services/certificateService.js';

// ─── Helper: create a minimal cert-like object ─────────────────────────────

function makeCert(overrides: Partial<{ revoked: boolean; notAfter: Date }> = {}) {
  return {
    revoked: false,
    notAfter: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
    ...overrides,
  };
}

function makePrismaCert(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: 'cert-test-1',
    commonName: 'api-payments.bank.internal',
    subjectDn: 'CN=api-payments.bank.internal',
    issuerDn: 'CN=Vault PKI',
    sans: ['payments-v2.bank.internal'],
    serialNumber: 'AA:BB:CC:DD',
    notBefore: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
    notAfter: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000),
    status: 'VALID',
    signatureAlgorithm: 'RSA 2048',
    keySize: 2048,
    fingerprintSha256: 'SHA256:AABBCC',
    fingerprintSha1: 'SHA1:AABBCC',
    owner: 'time-pagamentos',
    team: 'pagamentos',
    application: 'api-payments',
    environment: 'PRD',
    zone: 'bank-prd',
    caName: 'Vault PKI',
    caProvider: 'HashiCorp',
    importSource: 'MANUAL',
    sourceFile: null,
    revoked: false,
    revokedAt: null,
    revocationReason: null,
    tags: {},
    customFields: {},
    description: null,
    pemData: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FR5 Scenario 5.3: Expired certificate detection
// ═══════════════════════════════════════════════════════════════════════════

describe('FR5 — Lifecycle Status & Transitions', () => {
  describe('Scenario 5.3: Expired certificate detection', () => {
    it('returns EXPIRED when notAfter is in the past', () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // yesterday
      const status = computeStatus({ revoked: false, notAfter: pastDate });
      expect(status).toBe('EXPIRED');
    });

    it('returns EXPIRED when notAfter is exactly now (edge case)', () => {
      const exactNow = new Date(Date.now() - 1); // 1ms ago
      const status = computeStatus({ revoked: false, notAfter: exactNow });
      expect(status).toBe('EXPIRED');
    });

    it('computeDaysUntilExpiry returns negative for expired certs', () => {
      const pastDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
      const days = computeDaysUntilExpiry(pastDate);
      expect(days).toBeLessThanOrEqual(-4); // At least 4 days ago (ceil rounding)
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // FR5 Scenario 5.4: Expiring soon warning
  // ═════════════════════════════════════════════════════════════════════════

  describe('Scenario 5.4: Expiring soon warning (<30 days)', () => {
    it('returns EXPIRING_SOON when notAfter is within 30 days', () => {
      const in12Days = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000);
      const status = computeStatus({ revoked: false, notAfter: in12Days });
      expect(status).toBe('EXPIRING_SOON');
    });

    it('returns EXPIRING_SOON at exactly 29 days', () => {
      const in29Days = new Date(Date.now() + 29 * 24 * 60 * 60 * 1000);
      const status = computeStatus({ revoked: false, notAfter: in29Days });
      expect(status).toBe('EXPIRING_SOON');
    });

    it('returns VALID at exactly 31 days', () => {
      const in31Days = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
      const status = computeStatus({ revoked: false, notAfter: in31Days });
      expect(status).toBe('VALID');
    });

    it('computes correct daysUntilExpiry for 12-day cert', () => {
      const in12Days = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000);
      const days = computeDaysUntilExpiry(in12Days);
      expect(days).toBeGreaterThanOrEqual(11);
      expect(days).toBeLessThanOrEqual(13);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // FR5 Scenario 5.1 & 5.2: Status transitions
  // ═════════════════════════════════════════════════════════════════════════

  describe('Scenario 5.1–5.2: Status transitions', () => {
    it('VALID → EXPIRING_SOON when approaching 30-day threshold', () => {
      // 60 days out = VALID
      const cert60 = makeCert({ notAfter: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) });
      expect(computeStatus(cert60)).toBe('VALID');

      // 15 days out = EXPIRING_SOON
      const cert15 = makeCert({ notAfter: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000) });
      expect(computeStatus(cert15)).toBe('EXPIRING_SOON');
    });

    it('EXPIRING_SOON → EXPIRED when notAfter passes', () => {
      const certExpiring = makeCert({
        notAfter: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      });
      expect(computeStatus(certExpiring)).toBe('EXPIRING_SOON');

      const certExpired = makeCert({
        notAfter: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      });
      expect(computeStatus(certExpired)).toBe('EXPIRED');
    });

    it('Any status → REVOKED when revoked=true', () => {
      // VALID cert that's revoked
      const revokedValid = makeCert({
        revoked: true,
        notAfter: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      });
      expect(computeStatus(revokedValid)).toBe('REVOKED');

      // Expiring cert that's revoked
      const revokedExpiring = makeCert({
        revoked: true,
        notAfter: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
      });
      expect(computeStatus(revokedExpiring)).toBe('REVOKED');

      // Expired cert that's revoked (revoke takes precedence)
      const revokedExpired = makeCert({
        revoked: true,
        notAfter: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      });
      expect(computeStatus(revokedExpired)).toBe('REVOKED');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // mapToApiCertificate: ensures computed fields are included
  // ═════════════════════════════════════════════════════════════════════════

  describe('mapToApiCertificate — computed fields', () => {
    it('includes computed status and daysUntilExpiry in API response', () => {
      const prismaCert = makePrismaCert();
      const apiCert = mapToApiCertificate(prismaCert as never);

      expect(apiCert.status).toBe('VALID');
      expect(apiCert.daysUntilExpiry).toBeGreaterThan(50);
      expect(apiCert.id).toBe('cert-test-1');
      expect(apiCert.commonName).toBe('api-payments.bank.internal');
    });

    it('maps revoked cert correctly', () => {
      const prismaCert = makePrismaCert({
        revoked: true,
        revokedAt: new Date(),
        revocationReason: 'keyCompromise',
      });
      const apiCert = mapToApiCertificate(prismaCert as never);

      expect(apiCert.status).toBe('REVOKED');
      expect(apiCert.revoked).toBe(true);
      expect(apiCert.revocationReason).toBe('keyCompromise');
    });

    it('maps expired cert correctly', () => {
      const prismaCert = makePrismaCert({
        notAfter: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      });
      const apiCert = mapToApiCertificate(prismaCert as never);

      expect(apiCert.status).toBe('EXPIRED');
      expect(apiCert.daysUntilExpiry).toBeLessThan(0);
    });

    it('serializes dates as ISO-8601 strings', () => {
      const prismaCert = makePrismaCert();
      const apiCert = mapToApiCertificate(prismaCert as never);

      expect(apiCert.notBefore).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(apiCert.notAfter).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(apiCert.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
