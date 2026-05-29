import { describe, it, expect, beforeEach } from 'vitest';
import forge from 'node-forge';
import {
  generateCsr,
  parseCsrPem,
  encryptPrivateKey,
  decryptPrivateKey,
  type CsrGenerationResult,
} from '../services/csrService.js';

// ─── CSR Generation ─────────────────────────────────────────────────────────

describe('generateCsr', () => {
  describe('RSA 2048', () => {
    let result: CsrGenerationResult;

    beforeEach(() => {
      result = generateCsr('test.example.com', ['www.example.com'], 'RSA2048');
    });

    it('should return a valid PEM-encoded CSR', () => {
      expect(result.csrPem).toContain('-----BEGIN CERTIFICATE REQUEST-----');
      expect(result.csrPem).toContain('-----END CERTIFICATE REQUEST-----');
    });

    it('should include the correct algorithm', () => {
      expect(result.algorithm).toBe('RSA2048');
    });

    it('should return a non-empty encrypted private key reference', () => {
      expect(result.privateKeyRef).toBeTruthy();
      expect(result.privateKeyRef.length).toBeGreaterThan(100);
    });

    it('should return a colon-delimited SHA-256 fingerprint', () => {
      expect(result.fingerprint).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    });

    it('should produce a CSR with correct CN', () => {
      const csr = forge.pki.certificationRequestFromPem(result.csrPem);
      const cn = csr.subject.getField('CN');
      expect(cn?.value).toBe('test.example.com');
    });

    it('should produce a CSR with SANs including CN', () => {
      const csr = forge.pki.certificationRequestFromPem(result.csrPem);
      const attrs = csr.attributes ?? [];
      let sans: string[] = [];
      for (const attr of attrs) {
        if (attr.name === 'extensionRequest') {
          const exts = (attr as forge.pki.CertificateField).extensions ?? [];
          for (const ext of exts) {
            if (ext.name === 'subjectAltName' && ext.altNames) {
              sans = ext.altNames.map((an: { value: string }) => an.value);
            }
          }
        }
      }
      expect(sans).toContain('test.example.com');
      expect(sans).toContain('www.example.com');
    });

    it('should produce a CSR that verifies', () => {
      const csr = forge.pki.certificationRequestFromPem(result.csrPem);
      expect(csr.verify()).toBe(true);
    });
  });

  describe('RSA 4096', () => {
    it('should generate with RSA 4096 bits', () => {
      const result = generateCsr('large-key.example.com', [], 'RSA4096');
      expect(result.csrPem).toContain('-----BEGIN CERTIFICATE REQUEST-----');
      expect(result.algorithm).toBe('RSA4096');

      const csr = forge.pki.certificationRequestFromPem(result.csrPem);
      const pubKey = csr.publicKey as forge.pki.rsa.PublicKey;
      expect(pubKey.n.bitLength()).toBe(4096);
    });
  });

  describe('ECDSA P-256', () => {
    let result: CsrGenerationResult;

    beforeEach(() => {
      result = generateCsr('ec.example.com', ['api.example.com'], 'ECDSA_P256');
    });

    it('should return a valid PEM-encoded CSR', () => {
      expect(result.csrPem).toContain('-----BEGIN CERTIFICATE REQUEST-----');
      expect(result.csrPem).toContain('-----END CERTIFICATE REQUEST-----');
    });

    it('should include the correct algorithm', () => {
      expect(result.algorithm).toBe('ECDSA_P256');
    });

    it('should return a non-empty encrypted private key reference', () => {
      expect(result.privateKeyRef).toBeTruthy();
      expect(result.privateKeyRef.length).toBeGreaterThan(50);
    });

    it('should return a colon-delimited SHA-256 fingerprint', () => {
      expect(result.fingerprint).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    });

    it('should produce a DER-decodable CSR', () => {
      // Verify the PEM can be decoded to valid ASN.1
      const pem = result.csrPem;
      const b64 = pem
        .replace(/-----BEGIN CERTIFICATE REQUEST-----/, '')
        .replace(/-----END CERTIFICATE REQUEST-----/, '')
        .replace(/\s/g, '');
      const der = forge.util.decode64(b64);
      const asn1 = forge.asn1.fromDer(der);
      // PKCS#10 is a SEQUENCE with 3 elements
      expect(asn1.value).toHaveLength(3);
    });
  });

  describe('ECDSA P-384', () => {
    it('should generate with ECDSA P-384 curve', () => {
      const result = generateCsr('p384.example.com', [], 'ECDSA_P384');
      expect(result.csrPem).toContain('-----BEGIN CERTIFICATE REQUEST-----');
      expect(result.algorithm).toBe('ECDSA_P384');
    });
  });

  describe('edge cases', () => {
    it('should handle empty SANs', () => {
      const result = generateCsr('solo.example.com', [], 'RSA2048');
      expect(result.csrPem).toContain('-----BEGIN CERTIFICATE REQUEST-----');
    });

    it('should deduplicate CN in SANs', () => {
      const result = generateCsr(
        'dup.example.com',
        ['dup.example.com', 'other.example.com'],
        'RSA2048',
      );
      const csr = forge.pki.certificationRequestFromPem(result.csrPem);
      const attrs = csr.attributes ?? [];
      let sans: string[] = [];
      for (const attr of attrs) {
        if (attr.name === 'extensionRequest') {
          const exts = (attr as forge.pki.CertificateField).extensions ?? [];
          for (const ext of exts) {
            if (ext.name === 'subjectAltName' && ext.altNames) {
              sans = ext.altNames.map((an: { value: string }) => an.value);
            }
          }
        }
      }
      // CN should appear only once, not duplicated
      const dupCount = sans.filter((s) => s === 'dup.example.com').length;
      expect(dupCount).toBe(1);
    });

    it('should generate unique fingerprints for different keys', () => {
      const r1 = generateCsr('a.example.com', [], 'RSA2048');
      const r2 = generateCsr('b.example.com', [], 'RSA2048');
      expect(r1.fingerprint).not.toBe(r2.fingerprint);
    });
  });
});

// ─── CSR Parsing ────────────────────────────────────────────────────────────

describe('parseCsrPem', () => {
  it('should parse CN from an RSA CSR', () => {
    const { csrPem } = generateCsr('parse-test.example.com', [], 'RSA2048');
    const parsed = parseCsrPem(csrPem);
    expect(parsed.commonName).toBe('parse-test.example.com');
  });

  it('should parse SANs from an RSA CSR', () => {
    const { csrPem } = generateCsr(
      'san-test.example.com',
      ['api.example.com', 'web.example.com'],
      'RSA2048',
    );
    const parsed = parseCsrPem(csrPem);
    expect(parsed.sans).toContain('san-test.example.com');
    expect(parsed.sans).toContain('api.example.com');
    expect(parsed.sans).toContain('web.example.com');
  });

  it('should detect RSA algorithm and key size', () => {
    const { csrPem } = generateCsr('algo.example.com', [], 'RSA2048');
    const parsed = parseCsrPem(csrPem);
    expect(parsed.algorithm).toContain('RSA');
    expect(parsed.keyInfo).toContain('2048');
  });

  it('should include subject DN', () => {
    const { csrPem } = generateCsr('dn-test.example.com', [], 'RSA2048');
    const parsed = parseCsrPem(csrPem);
    expect(parsed.subjectDn).toContain('dn-test.example.com');
  });

  it('should throw on invalid PEM', () => {
    expect(() => parseCsrPem('not a valid PEM')).toThrow();
  });

  it('should handle CSR with no SANs', () => {
    // Create a minimal CSR without SAN extension
    const keyPair = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
    const csr = forge.pki.createCertificationRequest();
    csr.publicKey = keyPair.publicKey;
    csr.setSubject([{ name: 'commonName', value: 'no-san.example.com' }]);
    csr.sign(keyPair.privateKey, forge.md.sha256.create());
    const pem = forge.pki.certificationRequestToPem(csr);

    const parsed = parseCsrPem(pem);
    expect(parsed.commonName).toBe('no-san.example.com');
    expect(parsed.sans).toEqual([]);
  });
});

// ─── Private Key Encryption / Decryption ────────────────────────────────────

describe('encryptPrivateKey / decryptPrivateKey', () => {
  it('should round-trip encrypt and decrypt a private key', () => {
    const originalPem = forge.pki.privateKeyToPem(
      forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 }).privateKey,
    );

    const encrypted = encryptPrivateKey(originalPem);
    expect(encrypted).toBeTruthy();
    expect(encrypted).not.toContain('PRIVATE KEY');

    const decrypted = decryptPrivateKey(encrypted);
    expect(decrypted).toBe(originalPem);
  });

  it('should produce different ciphertext for the same key (random IV)', () => {
    const pem = forge.pki.privateKeyToPem(
      forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 }).privateKey,
    );

    const enc1 = encryptPrivateKey(pem);
    const enc2 = encryptPrivateKey(pem);
    expect(enc1).not.toBe(enc2); // Different IVs → different ciphertext
  });

  it('should produce base64-encoded output', () => {
    const pem = forge.pki.privateKeyToPem(
      forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 }).privateKey,
    );
    const encrypted = encryptPrivateKey(pem);
    // Verify it's valid base64
    expect(() => Buffer.from(encrypted, 'base64')).not.toThrow();
    const buf = Buffer.from(encrypted, 'base64');
    // Minimum: 12 (IV) + 16 (tag) + some ciphertext
    expect(buf.length).toBeGreaterThan(28);
  });
});
