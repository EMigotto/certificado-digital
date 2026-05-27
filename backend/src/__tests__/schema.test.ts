import { describe, it, expect } from 'vitest';
import {
  Prisma,
  CertStatus,
  Environment,
  AuditAction,
  ImportSource,
} from '@prisma/client';

/**
 * Tests that the Prisma schema compiles and produces the expected model metadata.
 * These tests validate the schema without requiring a running database.
 */
describe('Prisma schema', () => {
  it('should define Certificate model fields', () => {
    const fields = Object.keys(Prisma.CertificateScalarFieldEnum);
    // Identity fields
    expect(fields).toContain('commonName');
    expect(fields).toContain('subjectDn');
    expect(fields).toContain('issuerDn');
    expect(fields).toContain('sans');
    expect(fields).toContain('serialNumber');
    // Validity fields
    expect(fields).toContain('notBefore');
    expect(fields).toContain('notAfter');
    expect(fields).toContain('status');
    // Crypto fields
    expect(fields).toContain('signatureAlgorithm');
    expect(fields).toContain('keySize');
    expect(fields).toContain('fingerprintSha256');
    expect(fields).toContain('fingerprintSha1');
    // Org context
    expect(fields).toContain('owner');
    expect(fields).toContain('team');
    expect(fields).toContain('application');
    expect(fields).toContain('environment');
    expect(fields).toContain('zone');
    // CA
    expect(fields).toContain('caName');
    expect(fields).toContain('caProvider');
    // Import
    expect(fields).toContain('importSource');
    expect(fields).toContain('sourceFile');
    // Revocation
    expect(fields).toContain('revoked');
    expect(fields).toContain('revokedAt');
    expect(fields).toContain('revocationReason');
    // Flexible
    expect(fields).toContain('tags');
    expect(fields).toContain('customFields');
    expect(fields).toContain('description');
    // System
    expect(fields).toContain('id');
    expect(fields).toContain('createdAt');
    expect(fields).toContain('updatedAt');
  });

  it('should have at least 25 scalar fields on Certificate', () => {
    const fields = Object.keys(Prisma.CertificateScalarFieldEnum);
    expect(fields.length).toBeGreaterThanOrEqual(25);
  });

  it('should define AuditEntry model fields', () => {
    const fields = Object.keys(Prisma.AuditEntryScalarFieldEnum);
    expect(fields).toContain('id');
    expect(fields).toContain('certificateId');
    expect(fields).toContain('certCn');
    expect(fields).toContain('action');
    expect(fields).toContain('actor');
    expect(fields).toContain('result');
    expect(fields).toContain('detail');
    expect(fields).toContain('changes');
    expect(fields).toContain('timestamp');
  });

  it('should expose CertStatus enum values', () => {
    expect(CertStatus.VALID).toBe('VALID');
    expect(CertStatus.EXPIRING_SOON).toBe('EXPIRING_SOON');
    expect(CertStatus.EXPIRED).toBe('EXPIRED');
    expect(CertStatus.REVOKED).toBe('REVOKED');
  });

  it('should expose Environment enum values', () => {
    expect(Environment.DEV).toBe('DEV');
    expect(Environment.HML).toBe('HML');
    expect(Environment.PRD).toBe('PRD');
  });

  it('should expose AuditAction enum values', () => {
    expect(AuditAction.CREATE).toBe('CREATE');
    expect(AuditAction.UPDATE).toBe('UPDATE');
    expect(AuditAction.DELETE).toBe('DELETE');
    expect(AuditAction.REVOKE).toBe('REVOKE');
    expect(AuditAction.IMPORT).toBe('IMPORT');
    expect(AuditAction.EXPORT).toBe('EXPORT');
  });

  it('should expose ImportSource enum values', () => {
    expect(ImportSource.MANUAL).toBe('MANUAL');
    expect(ImportSource.CSV_IMPORT).toBe('CSV_IMPORT');
    expect(ImportSource.API_SYNC).toBe('API_SYNC');
    expect(ImportSource.CERTIFICATE_FILE).toBe('CERTIFICATE_FILE');
  });
});
