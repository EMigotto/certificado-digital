/**
 * Unit tests for the certificate import service.
 *
 * Covers:
 *  - AC 1:  PEM import → parsed fields correct
 *  - AC 2:  Invalid format → error
 *  - AC 38: Missing owner → error "Owner is required"
 *  - AC 39: Invalid environment → rejected
 *  - AC 46: Wrong file type checks (tested at middleware level, but also parsing)
 *  - AC 48: Parsed CN, SANs, serial, fingerprint match source cert exactly
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import forge from 'node-forge';
import Database from 'better-sqlite3';
import { initDatabase, closeDatabase } from '../../src/server/db.js';
import {
  parsePemCertificate,
  parsePkcs12Certificate,
  validateImportMetadata,
  persistCertificate,
  type ImportMetadata,
  type ParsedCertificate,
} from '../../src/server/services/import-service.js';

/* ------------------------------------------------------------------ */
/* Test certificate generation helper                                  */
/* ------------------------------------------------------------------ */

interface TestCertOptions {
  cn?: string;
  sans?: string[];
  serialHex?: string;
  notBefore?: Date;
  notAfter?: Date;
  keyBits?: number;
}

function generateTestCert(options: TestCertOptions = {}): {
  pem: string;
  cert: forge.pki.Certificate;
  keys: forge.pki.rsa.KeyPair;
} {
  const {
    cn = 'api-payments.bank.internal',
    sans = ['api-payments.bank.internal', 'payments-canary.bank.internal'],
    serialHex = '01ABCDEF',
    notBefore = new Date('2024-01-01T00:00:00Z'),
    notAfter = new Date('2025-12-31T23:59:59Z'),
    keyBits = 2048,
  } = options;

  const keys = forge.pki.rsa.generateKeyPair(keyBits);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = serialHex;
  cert.validity.notBefore = notBefore;
  cert.validity.notAfter = notAfter;

  cert.setSubject([{ name: 'commonName', value: cn }]);
  cert.setIssuer([
    { name: 'commonName', value: 'Internal CA' },
    { name: 'organizationName', value: 'Bank Corp' },
  ]);

  // Add SAN extension
  if (sans.length > 0) {
    cert.setExtensions([
      {
        name: 'subjectAltName',
        altNames: sans.map((s) => ({ type: 2, value: s })), // type 2 = DNS
      },
    ]);
  }

  // Self-sign
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const pem = forge.pki.certificateToPem(cert);
  return { pem, cert, keys };
}

function generateTestPkcs12(options: TestCertOptions = {}, passphrase = 'test123'): {
  buffer: Buffer;
  pem: string;
  cert: forge.pki.Certificate;
} {
  const { pem, cert, keys } = generateTestCert(options);

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], passphrase, {
    algorithm: '3des',
  });
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  const buffer = Buffer.from(p12Der, 'binary');

  return { buffer, pem, cert };
}

/* ------------------------------------------------------------------ */
/* PEM parsing tests (AC 1, 48)                                        */
/* ------------------------------------------------------------------ */

describe('parsePemCertificate', () => {
  it('extracts CN correctly (AC 48)', () => {
    const { pem } = generateTestCert({ cn: 'api-payments.bank.internal' });
    const parsed = parsePemCertificate(pem);
    expect(parsed.commonName).toBe('api-payments.bank.internal');
  });

  it('extracts all SANs correctly (AC 48)', () => {
    const sans = ['api-payments.bank.internal', 'payments-canary.bank.internal'];
    const { pem } = generateTestCert({ sans });
    const parsed = parsePemCertificate(pem);
    expect(parsed.sans).toEqual(sans);
  });

  it('extracts serial number in hexadecimal format (AC 48)', () => {
    const { pem } = generateTestCert({ serialHex: '01ABCDEF' });
    const parsed = parsePemCertificate(pem);
    expect(parsed.serial).toBe('01ABCDEF');
  });

  it('extracts issuer string', () => {
    const { pem } = generateTestCert();
    const parsed = parsePemCertificate(pem);
    expect(parsed.issuer).toContain('Internal CA');
    expect(parsed.issuer).toContain('Bank Corp');
  });

  it('extracts validity dates in ISO-8601 format', () => {
    const notBefore = new Date('2024-01-01T00:00:00Z');
    const notAfter = new Date('2025-12-31T23:59:59Z');
    const { pem } = generateTestCert({ notBefore, notAfter });
    const parsed = parsePemCertificate(pem);

    expect(parsed.notBefore).toBe(notBefore.toISOString());
    expect(parsed.notAfter).toBe(notAfter.toISOString());
  });

  it('extracts algorithm and key size (RSA 2048)', () => {
    const { pem } = generateTestCert({ keyBits: 2048 });
    const parsed = parsePemCertificate(pem);
    expect(parsed.algorithm).toBe('RSA 2048');
    expect(parsed.keySize).toBe(2048);
  });

  it('extracts SHA-256 fingerprint in uppercase colon-separated hex (AC 48)', () => {
    const { pem } = generateTestCert();
    const parsed = parsePemCertificate(pem);
    // Must be XX:XX:XX:... format, 64 hex chars + 31 colons = 95 chars
    expect(parsed.fingerprintSHA256).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  });

  it('fingerprint matches independent verification (AC 48)', () => {
    const { pem, cert } = generateTestCert();
    const parsed = parsePemCertificate(pem);

    // Independently compute SHA-256 fingerprint
    const derBytes = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const md = forge.md.sha256.create();
    md.update(derBytes);
    const expected = md.digest().toHex().toUpperCase().match(/.{2}/g)!.join(':');

    expect(parsed.fingerprintSHA256).toBe(expected);
  });

  it('preserves PEM content in output', () => {
    const { pem } = generateTestCert();
    const parsed = parsePemCertificate(pem);
    expect(parsed.pemContent).toContain('-----BEGIN CERTIFICATE-----');
    expect(parsed.pemContent).toContain('-----END CERTIFICATE-----');
  });

  it('handles certificate without SANs', () => {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '0001';
    cert.validity.notBefore = new Date('2024-01-01T00:00:00Z');
    cert.validity.notAfter = new Date('2025-01-01T00:00:00Z');
    cert.setSubject([{ name: 'commonName', value: 'no-sans.example.com' }]);
    cert.setIssuer([{ name: 'commonName', value: 'CA' }]);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    const pem = forge.pki.certificateToPem(cert);
    const parsed = parsePemCertificate(pem);
    expect(parsed.commonName).toBe('no-sans.example.com');
    expect(parsed.sans).toEqual([]);
  });

  it('throws on invalid PEM content (AC 2)', () => {
    expect(() => parsePemCertificate('not a certificate')).toThrow(
      /Invalid PEM certificate/,
    );
  });

  it('throws on private key PEM (AC 2)', () => {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const keyPem = forge.pki.privateKeyToPem(keys.privateKey);
    expect(() => parsePemCertificate(keyPem)).toThrow();
  });

  it('throws on empty string (AC 2)', () => {
    expect(() => parsePemCertificate('')).toThrow();
  });
});

/* ------------------------------------------------------------------ */
/* PKCS#12 parsing tests (AC 1, 2)                                     */
/* ------------------------------------------------------------------ */

describe('parsePkcs12Certificate', () => {
  it('extracts certificate from PKCS#12 container', () => {
    const { buffer } = generateTestPkcs12(
      { cn: 'pkcs12-test.bank.internal' },
      'mypassword',
    );
    const parsed = parsePkcs12Certificate(buffer, 'mypassword');
    expect(parsed.commonName).toBe('pkcs12-test.bank.internal');
  });

  it('extracts SANs from PKCS#12 certificate', () => {
    const sans = ['san1.example.com', 'san2.example.com'];
    const { buffer } = generateTestPkcs12({ sans }, 'pass');
    const parsed = parsePkcs12Certificate(buffer, 'pass');
    expect(parsed.sans).toEqual(sans);
  });

  it('extracts fingerprint from PKCS#12 certificate', () => {
    const { buffer } = generateTestPkcs12({}, 'pass');
    const parsed = parsePkcs12Certificate(buffer, 'pass');
    expect(parsed.fingerprintSHA256).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  });

  it('includes PEM representation in output', () => {
    const { buffer } = generateTestPkcs12({}, 'pass');
    const parsed = parsePkcs12Certificate(buffer, 'pass');
    expect(parsed.pemContent).toContain('-----BEGIN CERTIFICATE-----');
  });

  it('throws on wrong passphrase (AC 2)', () => {
    const { buffer } = generateTestPkcs12({}, 'correct-password');
    expect(() => parsePkcs12Certificate(buffer, 'wrong-password')).toThrow(
      /Invalid PKCS#12/,
    );
  });

  it('throws on invalid binary data (AC 2)', () => {
    const garbage = Buffer.from('this is not pkcs12 data');
    expect(() => parsePkcs12Certificate(garbage, '')).toThrow();
  });
});

/* ------------------------------------------------------------------ */
/* Metadata validation (AC 38, 39)                                     */
/* ------------------------------------------------------------------ */

describe('validateImportMetadata', () => {
  it('passes with valid metadata', () => {
    const errors = validateImportMetadata({
      owner: 'time-pagamentos',
      environment: 'prd',
    });
    expect(errors).toHaveLength(0);
  });

  it('returns error when owner is missing (AC 38)', () => {
    const errors = validateImportMetadata({ environment: 'prd' });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('owner');
    expect(errors[0].message).toBe('Owner is required');
  });

  it('returns error when owner is empty string (AC 38)', () => {
    const errors = validateImportMetadata({ owner: '', environment: 'prd' });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('owner');
    expect(errors[0].message).toBe('Owner is required');
  });

  it('returns error when owner is whitespace only (AC 38)', () => {
    const errors = validateImportMetadata({ owner: '   ', environment: 'prd' });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('owner');
  });

  it('returns error when environment is missing', () => {
    const errors = validateImportMetadata({ owner: 'team-x' });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('environment');
    expect(errors[0].message).toBe('Environment is required');
  });

  it('rejects invalid environment value (AC 39)', () => {
    const errors = validateImportMetadata({
      owner: 'team-x',
      environment: 'staging' as 'dev',
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('environment');
    expect(errors[0].message).toBe('Environment must be dev, hml, or prd');
  });

  it('rejects invalid environment "production" (AC 39)', () => {
    const errors = validateImportMetadata({
      owner: 'team-x',
      environment: 'production' as 'dev',
    });
    expect(errors.some((e) => e.field === 'environment')).toBe(true);
  });

  it('accepts all valid environments (AC 39)', () => {
    for (const env of ['dev', 'hml', 'prd'] as const) {
      const errors = validateImportMetadata({ owner: 'team-x', environment: env });
      expect(errors).toHaveLength(0);
    }
  });

  it('reports multiple errors at once', () => {
    const errors = validateImportMetadata({});
    expect(errors.length).toBeGreaterThanOrEqual(2);
    const fields = errors.map((e) => e.field);
    expect(fields).toContain('owner');
    expect(fields).toContain('environment');
  });
});

/* ------------------------------------------------------------------ */
/* Persistence (integration with in-memory SQLite)                     */
/* ------------------------------------------------------------------ */

describe('persistCertificate', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = initDatabase(':memory:');
  });

  afterEach(() => {
    closeDatabase(db);
  });

  function makeTestParsed(): ParsedCertificate {
    const { pem } = generateTestCert({ cn: 'persist-test.example.com' });
    return parsePemCertificate(pem);
  }

  const validMeta: ImportMetadata = {
    owner: 'time-pagamentos',
    application: 'API Payments',
    environment: 'prd',
    zone: 'bank-prd',
    caProvider: 'Vault PKI',
    description: 'Test cert',
    tags: { criticality: 'high' },
  };

  it('inserts certificate into database', () => {
    const parsed = makeTestParsed();
    const result = persistCertificate(db, parsed, validMeta);

    expect(result.id).toBeTruthy();
    expect(result.commonName).toBe('persist-test.example.com');

    // Verify in DB
    const row = db
      .prepare('SELECT * FROM certificates WHERE id = ?')
      .get(result.id) as Record<string, unknown>;
    expect(row).toBeTruthy();
    expect(row.common_name).toBe('persist-test.example.com');
    expect(row.owner).toBe('time-pagamentos');
    expect(row.environment).toBe('prd');
  });

  it('stores SANs as JSON array', () => {
    const parsed = makeTestParsed();
    const result = persistCertificate(db, parsed, validMeta);

    const row = db
      .prepare('SELECT sans FROM certificates WHERE id = ?')
      .get(result.id) as { sans: string };
    const sansParsed = JSON.parse(row.sans);
    expect(Array.isArray(sansParsed)).toBe(true);
  });

  it('stores PEM content', () => {
    const parsed = makeTestParsed();
    const result = persistCertificate(db, parsed, validMeta);

    const row = db
      .prepare('SELECT pem_content FROM certificates WHERE id = ?')
      .get(result.id) as { pem_content: string };
    expect(row.pem_content).toContain('-----BEGIN CERTIFICATE-----');
  });

  it('stores tags as JSON object', () => {
    const parsed = makeTestParsed();
    const result = persistCertificate(db, parsed, validMeta);

    const row = db
      .prepare('SELECT tags FROM certificates WHERE id = ?')
      .get(result.id) as { tags: string };
    const tags = JSON.parse(row.tags);
    expect(tags.criticality).toBe('high');
  });

  it('creates audit log entry on import', () => {
    const parsed = makeTestParsed();
    const result = persistCertificate(db, parsed, validMeta);

    const audit = db
      .prepare('SELECT * FROM audit_log WHERE cert_id = ?')
      .get(result.id) as Record<string, unknown>;
    expect(audit).toBeTruthy();
    expect(audit.action).toBe('CREATE');
    expect(audit.result).toBe('SUCCESS');
    expect(audit.cert_cn).toBe('persist-test.example.com');
  });

  it('trims whitespace from metadata fields', () => {
    const parsed = makeTestParsed();
    const metaWithSpaces: ImportMetadata = {
      ...validMeta,
      owner: '  time-pagamentos  ',
      application: '  API Payments  ',
    };
    const result = persistCertificate(db, parsed, metaWithSpaces);
    expect(result.owner).toBe('time-pagamentos');
    expect(result.application).toBe('API Payments');
  });

  it('handles empty optional fields gracefully', () => {
    const parsed = makeTestParsed();
    const minimalMeta: ImportMetadata = {
      owner: 'team-x',
      environment: 'dev',
    };
    const result = persistCertificate(db, parsed, minimalMeta);
    expect(result.application).toBe('');
    expect(result.zone).toBe('');
    expect(result.caProvider).toBe('');
    expect(result.description).toBe('');
    expect(result.tags).toEqual({});
  });

  it('generates unique IDs for each import', () => {
    const parsed1 = makeTestParsed();
    const parsed2 = makeTestParsed();
    const result1 = persistCertificate(db, parsed1, validMeta);
    const result2 = persistCertificate(db, parsed2, validMeta);
    expect(result1.id).not.toBe(result2.id);
  });
});
