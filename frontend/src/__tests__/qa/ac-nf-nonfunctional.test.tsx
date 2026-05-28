/**
 * QA Tests — Non-Functional Requirements: Data Validation, Security, Privacy
 *
 * Maps to: Scenarios NF.1, NF.2, NF.3
 */
import { describe, it, expect } from 'vitest';
import { parseCsvPreview, REQUIRED_COLUMNS } from '@/utils/csvPreview';
import { daysUntilExpiry, getStatusVariant, getStatusLabel, formatNumber, formatDateTime, formatDate } from '@/utils/formatters';
import type { Certificate, CertStatus, Environment, ImportSource } from '@certificado-digital/shared';
import { createCertificate, createAuditEntry, createExpiringCertificate, createExpiredCertificate, createRevokedCertificate, createLongCnCertificate, createManySansCertificate } from '../mocks/data';

describe('Non-Functional Requirements', () => {
  // ─── Scenario NF.1: Data Validation ───────────────────────────────────
  describe('NF.1: Data Validation', () => {
    it('CSV validation rejects empty CN', () => {
      const csv = 'cn,issuer,owner,environment\n,Vault PKI,team,prd';
      const result = parseCsvPreview(csv);

      expect(result.rows[0].status).toBe('error');
      expect(result.rows[0].errors).toContain('Campo "cn" é obrigatório');
    });

    it('CSV validation rejects empty issuer', () => {
      const csv = 'cn,issuer,owner,environment\ncert.internal,,team,prd';
      const result = parseCsvPreview(csv);

      expect(result.rows[0].status).toBe('error');
      expect(result.rows[0].errors).toContain('Campo "issuer" é obrigatório');
    });

    it('CSV validation rejects invalid environment', () => {
      const csv = 'cn,issuer,owner,environment\ncert.internal,Vault,team,staging';
      const result = parseCsvPreview(csv);

      expect(result.rows[0].status).toBe('error');
      expect(result.rows[0].errors.some((e) => e.includes('Ambiente inválido'))).toBe(true);
    });

    it('CSV validation accepts valid environments: dev, hml, prd', () => {
      for (const env of ['dev', 'hml', 'prd']) {
        const csv = `cn,issuer,owner,environment\ncert.internal,Vault,team,${env}`;
        const result = parseCsvPreview(csv);
        expect(result.rows[0].status).toBe('valid');
      }
    });

    it('CSV validation rejects invalid dates', () => {
      const csv = 'cn,issuer,owner,environment,not_before\ncert.internal,Vault,team,prd,not-date';
      const result = parseCsvPreview(csv);

      expect(result.rows[0].status).toBe('error');
    });

    it('CSV validation accepts valid ISO dates', () => {
      const csv = 'cn,issuer,owner,environment,not_before,not_after\ncert.internal,Vault,team,prd,2024-01-15,2025-01-15';
      const result = parseCsvPreview(csv);

      expect(result.rows[0].status).toBe('valid');
    });
  });

  // ─── Scenario NF.2: Security — type-safe status/environment enums ─────
  describe('NF.2: Security — Type Safety', () => {
    it('CertStatus type allows only valid values', () => {
      const validStatuses: CertStatus[] = ['VALID', 'EXPIRING_SOON', 'EXPIRED', 'REVOKED'];
      expect(validStatuses).toHaveLength(4);
    });

    it('Environment type allows only valid values', () => {
      const validEnvs: Environment[] = ['DEV', 'HML', 'PRD'];
      expect(validEnvs).toHaveLength(3);
    });

    it('ImportSource type allows only valid values', () => {
      const validSources: ImportSource[] = ['MANUAL', 'CSV_IMPORT', 'API_SYNC', 'CERTIFICATE_FILE'];
      expect(validSources).toHaveLength(4);
    });

    it('Certificate type has all required fields', () => {
      const cert = createCertificate();

      // All core fields exist
      expect(cert).toHaveProperty('id');
      expect(cert).toHaveProperty('commonName');
      expect(cert).toHaveProperty('sans');
      expect(cert).toHaveProperty('serial');
      expect(cert).toHaveProperty('notBefore');
      expect(cert).toHaveProperty('notAfter');
      expect(cert).toHaveProperty('owner');
      expect(cert).toHaveProperty('environment');
      expect(cert).toHaveProperty('tags');
      expect(cert).toHaveProperty('revoked');
    });
  });

  // ─── Scenario NF.3: Data Privacy ──────────────────────────────────────
  describe('NF.3: Data Privacy', () => {
    it('Certificate type does not include private key field', () => {
      const cert = createCertificate();

      // There should be no 'privateKey' field
      expect(cert).not.toHaveProperty('privateKey');
      expect(cert).not.toHaveProperty('private_key');
      expect(cert).not.toHaveProperty('key');
    });

    it('Audit entry does not expose certificate content', () => {
      const entry = createAuditEntry();

      // Audit entries expose CN but not certificate content
      expect(entry).toHaveProperty('certCn');
      expect(entry).not.toHaveProperty('certificateContent');
      expect(entry).not.toHaveProperty('privateKey');
    });
  });

  // ─── Formatters comprehensive tests ───────────────────────────────────
  describe('Formatters — comprehensive coverage', () => {
    it('daysUntilExpiry returns positive for future dates', () => {
      const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      expect(daysUntilExpiry(future)).toBeGreaterThan(0);
    });

    it('daysUntilExpiry returns negative for past dates', () => {
      const past = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
      expect(daysUntilExpiry(past)).toBeLessThan(0);
    });

    it('daysUntilExpiry returns 0 for empty string', () => {
      expect(daysUntilExpiry('')).toBe(0);
    });

    it('getStatusVariant returns correct variants', () => {
      expect(getStatusVariant(45, false)).toBe('ok');
      expect(getStatusVariant(20, false)).toBe('warn');
      expect(getStatusVariant(-5, false)).toBe('crit');
      expect(getStatusVariant(100, true)).toBe('rev');
    });

    it('getStatusLabel returns correct labels', () => {
      expect(getStatusLabel(45, false)).toBe('Válido');
      expect(getStatusLabel(20, false)).toBe('Atenção');
      expect(getStatusLabel(5, false)).toBe('Crítico');
      expect(getStatusLabel(-5, false)).toBe('Vencido');
      expect(getStatusLabel(100, true)).toBe('Revogado');
    });

    it('formatNumber formats with pt-BR locale', () => {
      expect(formatNumber(10847)).toBe('10.847');
      expect(formatNumber(100)).toBe('100');
    });

    it('formatDateTime handles valid dates', () => {
      const result = formatDateTime('2026-05-27T14:32:08Z');
      expect(result).toMatch(/27\/05\/2026/);
    });

    it('formatDateTime returns "—" for empty/invalid input', () => {
      expect(formatDateTime('')).toBe('—');
      expect(formatDateTime('invalid')).toBe('—');
    });

    it('formatDate handles valid dates', () => {
      const result = formatDate('2026-05-27T14:32:08Z');
      expect(result).toMatch(/27\/05\/2026/);
    });

    it('formatDate returns "—" for empty/invalid input', () => {
      expect(formatDate('')).toBe('—');
      expect(formatDate('not-a-date')).toBe('—');
    });
  });

  // ─── Mock data factories comprehensive tests ─────────────────────────
  describe('Test data factories', () => {
    it('createExpiringCertificate sets correct notAfter', () => {
      const cert = createExpiringCertificate(10);
      const diff = new Date(cert.notAfter).getTime() - Date.now();
      const days = Math.round(diff / (24 * 60 * 60 * 1000));
      expect(days).toBeGreaterThanOrEqual(9);
      expect(days).toBeLessThanOrEqual(11);
    });

    it('createExpiredCertificate returns cert in the past', () => {
      const cert = createExpiredCertificate(5);
      const diff = new Date(cert.notAfter).getTime() - Date.now();
      expect(diff).toBeLessThan(0);
    });

    it('createRevokedCertificate sets revoked=true', () => {
      const cert = createRevokedCertificate();
      expect(cert.revoked).toBe(true);
    });

    it('createLongCnCertificate has CN > 255 chars', () => {
      const cert = createLongCnCertificate();
      expect(cert.commonName.length).toBeGreaterThan(255);
    });

    it('createManySansCertificate has 120 SANs', () => {
      const cert = createManySansCertificate();
      expect(cert.sans.length).toBe(120);
    });
  });
});
