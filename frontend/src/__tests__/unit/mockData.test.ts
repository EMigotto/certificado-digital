import { describe, it, expect, beforeEach } from 'vitest';
import {
  createCertificate,
  createExpiringCertificate,
  createExpiredCertificate,
  createRevokedCertificate,
  createLongCnCertificate,
  createManySansCertificate,
  createCertificateList,
  createPaginatedResponse,
  createAuditEntry,
  resetCounters,
} from '../mocks/data';

describe('Mock data factories', () => {
  beforeEach(() => {
    resetCounters();
  });

  describe('createCertificate', () => {
    it('creates a certificate with all required fields', () => {
      const cert = createCertificate();
      expect(cert.id).toBeDefined();
      expect(cert.commonName).toBeDefined();
      expect(cert.sans).toBeInstanceOf(Array);
      expect(cert.serial).toBeDefined();
      expect(cert.issuer).toBeDefined();
      expect(cert.notBefore).toBeDefined();
      expect(cert.notAfter).toBeDefined();
      expect(cert.algorithm).toBeDefined();
      expect(cert.environment).toBeDefined();
      expect(cert.zone).toBeDefined();
      expect(cert.caProvider).toBeDefined();
      expect(cert.revoked).toBe(false);
    });

    it('allows overriding fields', () => {
      const cert = createCertificate({ commonName: 'custom.bank.internal' });
      expect(cert.commonName).toBe('custom.bank.internal');
    });
  });

  describe('createExpiringCertificate', () => {
    it('creates a cert expiring in specified days', () => {
      const cert = createExpiringCertificate(5);
      const notAfter = new Date(cert.notAfter);
      const now = new Date();
      const diffDays = Math.ceil((notAfter.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBeGreaterThanOrEqual(4);
      expect(diffDays).toBeLessThanOrEqual(6);
    });
  });

  describe('createExpiredCertificate', () => {
    it('creates a cert that expired N days ago', () => {
      const cert = createExpiredCertificate(15);
      const notAfter = new Date(cert.notAfter);
      expect(notAfter.getTime()).toBeLessThan(Date.now());
    });
  });

  describe('createRevokedCertificate', () => {
    it('creates a cert with revoked=true', () => {
      const cert = createRevokedCertificate();
      expect(cert.revoked).toBe(true);
    });
  });

  describe('createLongCnCertificate (FR10.3 edge case)', () => {
    it('creates a cert with CN longer than 255 chars', () => {
      const cert = createLongCnCertificate();
      expect(cert.commonName.length).toBeGreaterThan(255);
    });
  });

  describe('createManySansCertificate (FR10.4 edge case)', () => {
    it('creates a cert with 120 SANs', () => {
      const cert = createManySansCertificate();
      expect(cert.sans).toHaveLength(120);
    });
  });

  describe('createCertificateList', () => {
    it('creates a list of N certificates', () => {
      const list = createCertificateList(10);
      expect(list).toHaveLength(10);
      expect(list[0].id).toBe('cert-list-1');
      expect(list[9].id).toBe('cert-list-10');
    });
  });

  describe('createPaginatedResponse', () => {
    it('wraps data in pagination envelope', () => {
      const data = createCertificateList(5);
      const response = createPaginatedResponse(data, 1, 25, 100);
      expect(response.data).toHaveLength(5);
      expect(response.total).toBe(100);
      expect(response.page).toBe(1);
      expect(response.pageSize).toBe(25);
      expect(response.totalPages).toBe(4);
    });

    it('auto-calculates total from data length', () => {
      const data = createCertificateList(3);
      const response = createPaginatedResponse(data);
      expect(response.total).toBe(3);
      expect(response.totalPages).toBe(1);
    });
  });

  describe('createAuditEntry', () => {
    it('creates an audit entry with all fields', () => {
      const entry = createAuditEntry();
      expect(entry.id).toBeDefined();
      expect(entry.action).toBe('CREATE');
      expect(entry.result).toBe('SUCCESS');
      expect(entry.actor).toBeDefined();
    });

    it('allows overriding fields', () => {
      const entry = createAuditEntry({ action: 'DELETE', result: 'FAILURE' });
      expect(entry.action).toBe('DELETE');
      expect(entry.result).toBe('FAILURE');
    });
  });
});
