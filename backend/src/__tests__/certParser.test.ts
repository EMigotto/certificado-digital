import { describe, it, expect } from 'vitest';
import forge from 'node-forge';
import {
  detectFormat,
  parsePEM,
  parseDER,
  parsePKCS12,
  parseCertificateFile,
} from '../utils/certParser.js';

// ─── Test certificate generator ─────────────────────────────────────────────

/**
 * Generate a self-signed test certificate with the given CN.
 * Returns both PEM and DER representations.
 */
function generateTestCert(cn: string = 'test.example.com', keyBits: number = 2048) {
  const keys = forge.pki.rsa.generateKeyPair({ bits: keyBits, e: 0x10001 });
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = 'AABBCCDD01';
  cert.validity.notBefore = new Date('2024-01-01');
  cert.validity.notAfter = new Date('2025-12-31');

  const attrs = [{ shortName: 'CN', value: cn }];
  cert.setSubject(attrs);
  cert.setIssuer([{ shortName: 'CN', value: 'Test CA' }]);

  // Add SAN extension
  cert.setExtensions([
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: cn },
        { type: 2, value: `www.${cn}` },
      ],
    },
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  const pem = forge.pki.certificateToPem(cert);
  const derAsn1 = forge.pki.certificateToAsn1(cert);
  const derBytes = forge.asn1.toDer(derAsn1).getBytes();
  const derBuffer = Buffer.from(derBytes, 'binary');

  return { pem, derBuffer, keys, cert };
}

/**
 * Generate a PKCS#12 container with a certificate and private key.
 */
function generateTestP12(cn: string = 'test.example.com', password: string = 'testpass') {
  const { keys, cert } = generateTestCert(cn);

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, {
    algorithm: '3des',
  });
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  const p12Buffer = Buffer.from(p12Der, 'binary');

  return { p12Buffer, password };
}

// ─── Tests: detectFormat ────────────────────────────────────────────────────

describe('detectFormat', () => {
  it('should detect PEM format from content', () => {
    const { pem } = generateTestCert();
    const buffer = Buffer.from(pem, 'utf-8');
    expect(detectFormat(buffer)).toBe('pem');
  });

  it('should detect PEM format regardless of extension', () => {
    const { pem } = generateTestCert();
    const buffer = Buffer.from(pem, 'utf-8');
    expect(detectFormat(buffer, 'cert.xyz')).toBe('pem');
  });

  it('should detect PKCS#12 by extension .p12', () => {
    const { p12Buffer } = generateTestP12();
    expect(detectFormat(p12Buffer, 'cert.p12')).toBe('pkcs12');
  });

  it('should detect PKCS#12 by extension .pfx', () => {
    const { p12Buffer } = generateTestP12();
    expect(detectFormat(p12Buffer, 'cert.pfx')).toBe('pkcs12');
  });

  it('should detect DER by extension .der', () => {
    const { derBuffer } = generateTestCert();
    expect(detectFormat(derBuffer, 'cert.der')).toBe('der');
  });

  it('should detect DER by extension .cer', () => {
    const { derBuffer } = generateTestCert();
    expect(detectFormat(derBuffer, 'cert.cer')).toBe('der');
  });

  it('should detect DER by ASN.1 SEQUENCE tag heuristic', () => {
    const { derBuffer } = generateTestCert();
    // No extension — relies on binary heuristic
    expect(detectFormat(derBuffer)).toBe('der');
  });

  it('should return null for unrecognizable content', () => {
    const buffer = Buffer.from('Hello world, not a cert', 'utf-8');
    expect(detectFormat(buffer, 'file.txt')).toBeNull();
  });
});

// ─── Tests: parsePEM ────────────────────────────────────────────────────────

describe('parsePEM', () => {
  it('should parse a valid PEM certificate', () => {
    const { pem } = generateTestCert('api.example.com');
    const result = parsePEM(pem);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.certificate.commonName).toBe('api.example.com');
      expect(result.certificate.sans).toContain('api.example.com');
      expect(result.certificate.sans).toContain('www.api.example.com');
      expect(result.certificate.serial.toLowerCase()).toBe('aabbccdd01');
      expect(result.certificate.issuer).toContain('CN=Test CA');
      expect(result.certificate.algorithm).toMatch(/^RSA-/);
      expect(result.certificate.fingerprintSha256).toMatch(/^[A-Fa-f0-9:]+$/i);
      expect(result.certificate.pemData).toContain('BEGIN CERTIFICATE');
      expect(result.certificate.notBefore).toBeInstanceOf(Date);
      expect(result.certificate.notAfter).toBeInstanceOf(Date);
    }
  });

  it('should reject invalid PEM content', () => {
    const result = parsePEM('-----BEGIN CERTIFICATE-----\nINVALID\n-----END CERTIFICATE-----');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVALID_CERT');
      expect(result.error).toContain('Failed to parse PEM');
    }
  });

  it('should reject a PEM cert with empty CN', () => {
    // Generate a cert with empty CN
    const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date('2024-01-01');
    cert.validity.notAfter = new Date('2025-12-31');
    cert.setSubject([{ shortName: 'CN', value: '' }]);
    cert.setIssuer([{ shortName: 'CN', value: 'Test CA' }]);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    const pem = forge.pki.certificateToPem(cert);
    const result = parsePEM(pem);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('empty Common Name');
    }
  });

  it('should reject non-PEM string', () => {
    const result = parsePEM('this is not a certificate');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVALID_CERT');
    }
  });
});

// ─── Tests: parseDER ────────────────────────────────────────────────────────

describe('parseDER', () => {
  it('should parse a valid DER certificate', () => {
    const { derBuffer } = generateTestCert('der.example.com');
    const result = parseDER(derBuffer);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.certificate.commonName).toBe('der.example.com');
      expect(result.certificate.serial.toLowerCase()).toBe('aabbccdd01');
      expect(result.certificate.algorithm).toMatch(/^RSA-/);
      expect(result.certificate.fingerprintSha256).toMatch(/^[A-Fa-f0-9:]+$/i);
    }
  });

  it('should reject invalid DER content', () => {
    const result = parseDER(Buffer.from([0x30, 0x82, 0x00, 0x01, 0xff]));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVALID_CERT');
      expect(result.error).toContain('Failed to parse DER');
    }
  });
});

// ─── Tests: parsePKCS12 ────────────────────────────────────────────────────

describe('parsePKCS12', () => {
  it('should parse a PKCS#12 container with correct password', () => {
    const { p12Buffer, password } = generateTestP12('p12.example.com', 'secret123');
    const result = parsePKCS12(p12Buffer, password);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.certificate.commonName).toBe('p12.example.com');
      expect(result.certificate.algorithm).toMatch(/^RSA-/);
      expect(result.certificate.pemData).toContain('BEGIN CERTIFICATE');
    }
  });

  it('should fail with incorrect password', () => {
    const { p12Buffer } = generateTestP12('p12.example.com', 'correct');
    const result = parsePKCS12(p12Buffer, 'wrong');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('DECRYPT_FAILED');
      expect(result.error).toContain('password');
    }
  });

  it('should fail with invalid PKCS#12 content', () => {
    const result = parsePKCS12(Buffer.from('not a pkcs12 file'), '');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVALID_CERT');
    }
  });
});

// ─── Tests: parseCertificateFile (auto-detection) ───────────────────────────

describe('parseCertificateFile', () => {
  it('should auto-detect and parse PEM file', () => {
    const { pem } = generateTestCert('auto.example.com');
    const buffer = Buffer.from(pem, 'utf-8');
    const result = parseCertificateFile(buffer, 'cert.pem');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.certificate.commonName).toBe('auto.example.com');
    }
  });

  it('should auto-detect and parse DER file', () => {
    const { derBuffer } = generateTestCert('auto-der.example.com');
    const result = parseCertificateFile(derBuffer, 'cert.der');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.certificate.commonName).toBe('auto-der.example.com');
    }
  });

  it('should auto-detect and parse PKCS#12 file', () => {
    const { p12Buffer } = generateTestP12('auto-p12.example.com', 'pass');
    const result = parseCertificateFile(p12Buffer, 'cert.p12', 'pass');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.certificate.commonName).toBe('auto-p12.example.com');
    }
  });

  it('should return UNSUPPORTED_FORMAT for unrecognized files', () => {
    const buffer = Buffer.from('Not a certificate at all', 'utf-8');
    const result = parseCertificateFile(buffer, 'readme.txt');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('UNSUPPORTED_FORMAT');
      expect(result.error).toContain('Unsupported certificate format');
    }
  });

  it('should compute consistent fingerprints for same certificate', () => {
    const { pem, derBuffer } = generateTestCert('fp.example.com');
    const pemResult = parsePEM(pem);
    const derResult = parseDER(derBuffer);

    expect(pemResult.ok).toBe(true);
    expect(derResult.ok).toBe(true);
    if (pemResult.ok && derResult.ok) {
      expect(pemResult.certificate.fingerprintSha256).toBe(derResult.certificate.fingerprintSha256);
    }
  });
});
