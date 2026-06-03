/**
 * Unit tests for the keyCrypto module (C5 Chunk 2).
 *
 * Covers:
 * - Encrypt → decrypt round-trip preserves PEM exactly
 * - Different keys produce different ciphertext
 * - Same key + different salt → different ciphertext
 * - Tampered ciphertext → decryption failure (GCM auth tag)
 * - Invalid PEM detection
 * - Fingerprint computation
 * - Private key metadata parsing
 */

import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import forge from 'node-forge';
import {
  encryptPrivateKey,
  decryptPrivateKey,
  computeKeyFingerprint,
  parsePrivateKeyMetadata,
  validatePrivateKeyPem,
  KeyDecryptionError,
  type EncryptedKeyEnvelope,
} from '../utils/keyCrypto.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Master KEK used in most tests. */
const TEST_KEK = 'test-master-secret-that-is-at-least-32-characters-long';
const ANOTHER_KEK = 'another-completely-different-secret-32chars-plus';

/**
 * Generate a fresh RSA private key PEM (PKCS#1 via node-forge) for testing.
 * Uses a small key size (2048) for acceptable test speed.
 */
function generateTestKeyPem(bits = 2048): string {
  const keypair = forge.pki.rsa.generateKeyPair({ bits, e: 0x10001 });
  return forge.pki.privateKeyToPem(keypair.privateKey);
}

/** Generate a PKCS#8 RSA PEM via Node.js crypto. */
function generatePkcs8RsaPem(modulusLength = 2048): string {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return privateKey;
}

/** Generate an ECDSA P-256 PKCS#8 PEM. */
function generateEcP256Pem(): string {
  const { privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return privateKey;
}

/** Generate an ECDSA P-384 PKCS#8 PEM. */
function generateEcP384Pem(): string {
  const { privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'P-384',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return privateKey;
}

// Pre-generate a key pair for tests that don't need uniqueness.
// 2048 bits is the minimum acceptable in production; fine for tests.
let cachedPem: string | null = null;
function getTestPem(): string {
  if (!cachedPem) {
    cachedPem = generateTestKeyPem(2048);
  }
  return cachedPem;
}

// ─── Encrypt / Decrypt ─────────────────────────────────────────────────────

describe('encryptPrivateKey / decryptPrivateKey', () => {
  it('round-trip preserves PEM exactly', () => {
    const pem = getTestPem();
    const envelope = encryptPrivateKey(pem, TEST_KEK);
    const decrypted = decryptPrivateKey(envelope, TEST_KEK);

    expect(decrypted).toBe(pem);
  });

  it('envelope contains expected fields', () => {
    const pem = getTestPem();
    const envelope = encryptPrivateKey(pem, TEST_KEK);

    expect(envelope).toHaveProperty('encryptedData');
    expect(envelope).toHaveProperty('iv');
    expect(envelope).toHaveProperty('authTag');
    expect(envelope).toHaveProperty('salt');
    expect(envelope.algorithm).toBe('aes-256-gcm');

    // iv = 12 bytes → 16 base64 chars, salt = 16 bytes → 24 base64 chars
    expect(Buffer.from(envelope.iv, 'base64')).toHaveLength(12);
    expect(Buffer.from(envelope.salt, 'base64')).toHaveLength(16);
    expect(Buffer.from(envelope.authTag, 'base64')).toHaveLength(16);
  });

  it('different keys produce different ciphertext', () => {
    const pem = getTestPem();
    const envelope1 = encryptPrivateKey(pem, TEST_KEK);
    const envelope2 = encryptPrivateKey(pem, ANOTHER_KEK);

    expect(envelope1.encryptedData).not.toBe(envelope2.encryptedData);
  });

  it('same key + different salt → different ciphertext (randomness)', () => {
    const pem = getTestPem();
    const envelope1 = encryptPrivateKey(pem, TEST_KEK);
    const envelope2 = encryptPrivateKey(pem, TEST_KEK);

    // Each call generates random IV and salt, so ciphertext must differ
    expect(envelope1.encryptedData).not.toBe(envelope2.encryptedData);
    expect(envelope1.iv).not.toBe(envelope2.iv);
    expect(envelope1.salt).not.toBe(envelope2.salt);
  });

  it('tampered ciphertext → KeyDecryptionError', () => {
    const pem = getTestPem();
    const envelope = encryptPrivateKey(pem, TEST_KEK);

    // Tamper with the ciphertext
    const tampered: EncryptedKeyEnvelope = {
      ...envelope,
      encryptedData: Buffer.from('corrupted-data-here').toString('base64'),
    };

    expect(() => decryptPrivateKey(tampered, TEST_KEK)).toThrow(KeyDecryptionError);
  });

  it('tampered auth tag → KeyDecryptionError', () => {
    const pem = getTestPem();
    const envelope = encryptPrivateKey(pem, TEST_KEK);

    // Flip a bit in the auth tag
    const tagBuf = Buffer.from(envelope.authTag, 'base64');
    tagBuf[0] ^= 0xff;
    const tampered: EncryptedKeyEnvelope = {
      ...envelope,
      authTag: tagBuf.toString('base64'),
    };

    expect(() => decryptPrivateKey(tampered, TEST_KEK)).toThrow(KeyDecryptionError);
  });

  it('tampered IV → KeyDecryptionError', () => {
    const pem = getTestPem();
    const envelope = encryptPrivateKey(pem, TEST_KEK);

    const ivBuf = Buffer.from(envelope.iv, 'base64');
    ivBuf[0] ^= 0xff;
    const tampered: EncryptedKeyEnvelope = {
      ...envelope,
      iv: ivBuf.toString('base64'),
    };

    expect(() => decryptPrivateKey(tampered, TEST_KEK)).toThrow(KeyDecryptionError);
  });

  it('tampered salt → KeyDecryptionError (derives different key)', () => {
    const pem = getTestPem();
    const envelope = encryptPrivateKey(pem, TEST_KEK);

    const saltBuf = Buffer.from(envelope.salt, 'base64');
    saltBuf[0] ^= 0xff;
    const tampered: EncryptedKeyEnvelope = {
      ...envelope,
      salt: saltBuf.toString('base64'),
    };

    expect(() => decryptPrivateKey(tampered, TEST_KEK)).toThrow(KeyDecryptionError);
  });

  it('wrong KEK → KeyDecryptionError', () => {
    const pem = getTestPem();
    const envelope = encryptPrivateKey(pem, TEST_KEK);

    expect(() => decryptPrivateKey(envelope, ANOTHER_KEK)).toThrow(KeyDecryptionError);
  });

  it('round-trip preserves PKCS#8 RSA PEM exactly', () => {
    const pem = generatePkcs8RsaPem();
    const envelope = encryptPrivateKey(pem, TEST_KEK);
    const decrypted = decryptPrivateKey(envelope, TEST_KEK);

    expect(decrypted).toBe(pem);
  });

  it('round-trip preserves EC P-256 PEM exactly', () => {
    const pem = generateEcP256Pem();
    const envelope = encryptPrivateKey(pem, TEST_KEK);
    const decrypted = decryptPrivateKey(envelope, TEST_KEK);

    expect(decrypted).toBe(pem);
  });

  it('KeyDecryptionError has expected code property', () => {
    const pem = getTestPem();
    const envelope = encryptPrivateKey(pem, TEST_KEK);

    try {
      decryptPrivateKey(envelope, ANOTHER_KEK);
      // Should not reach here
      expect.unreachable('Expected KeyDecryptionError');
    } catch (err) {
      expect(err).toBeInstanceOf(KeyDecryptionError);
      expect((err as KeyDecryptionError).code).toBe('KEY_DECRYPTION_ERROR');
      expect((err as KeyDecryptionError).name).toBe('KeyDecryptionError');
    }
  });

  it('tampered IV → KeyDecryptionError', () => {
    const pem = getTestPem();
    const envelope = encryptPrivateKey(pem, TEST_KEK);

    // Flip a byte in the IV
    const ivBuf = Buffer.from(envelope.iv, 'base64');
    ivBuf[0] ^= 0xff;
    const tampered: EncryptedKeyEnvelope = {
      ...envelope,
      iv: ivBuf.toString('base64'),
    };

    expect(() => decryptPrivateKey(tampered, TEST_KEK)).toThrow(KeyDecryptionError);
  });

  it('invalid IV length → KeyDecryptionError', () => {
    const pem = getTestPem();
    const envelope = encryptPrivateKey(pem, TEST_KEK);

    const tampered: EncryptedKeyEnvelope = {
      ...envelope,
      iv: Buffer.from('short').toString('base64'),
    };

    expect(() => decryptPrivateKey(tampered, TEST_KEK)).toThrow(KeyDecryptionError);
  });

  it('invalid auth tag length → KeyDecryptionError', () => {
    const pem = getTestPem();
    const envelope = encryptPrivateKey(pem, TEST_KEK);

    const tampered: EncryptedKeyEnvelope = {
      ...envelope,
      authTag: Buffer.from('short').toString('base64'),
    };

    expect(() => decryptPrivateKey(tampered, TEST_KEK)).toThrow(KeyDecryptionError);
  });

  it('each encryption generates a unique IV and salt (10 runs)', () => {
    const pem = getTestPem();
    const ivs = new Set<string>();
    const salts = new Set<string>();

    for (let i = 0; i < 10; i++) {
      const enc = encryptPrivateKey(pem, TEST_KEK);
      ivs.add(enc.iv);
      salts.add(enc.salt);
    }

    expect(ivs.size).toBe(10);
    expect(salts.size).toBe(10);
  });
});

// ─── Fingerprint ────────────────────────────────────────────────────────────

describe('computeKeyFingerprint', () => {
  it('returns a 64-character lowercase hex string (SHA-256)', () => {
    const pem = getTestPem();
    const fingerprint = computeKeyFingerprint(pem);

    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('same key produces the same fingerprint', () => {
    const pem = getTestPem();
    const fp1 = computeKeyFingerprint(pem);
    const fp2 = computeKeyFingerprint(pem);

    expect(fp1).toBe(fp2);
  });

  it('different keys produce different fingerprints', () => {
    const pem1 = getTestPem();
    const pem2 = generateTestKeyPem(2048);

    const fp1 = computeKeyFingerprint(pem1);
    const fp2 = computeKeyFingerprint(pem2);

    expect(fp1).not.toBe(fp2);
  });

  it('works for PKCS#8 RSA PEM', () => {
    const pem = generatePkcs8RsaPem();
    const fp = computeKeyFingerprint(pem);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('works for EC P-256 PEM', () => {
    const pem = generateEcP256Pem();
    const fp = computeKeyFingerprint(pem);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ─── Metadata ───────────────────────────────────────────────────────────────

describe('parsePrivateKeyMetadata', () => {
  it('extracts RSA-2048 metadata', () => {
    const pem = getTestPem(); // 2048-bit
    const meta = parsePrivateKeyMetadata(pem);

    expect(meta.algorithm).toBe('RSA');
    expect(meta.keySize).toBe(2048);
  });

  it('extracts RSA-4096 metadata', () => {
    // Generate a 4096-bit key (this is slower but tests size detection)
    const pem4096 = generateTestKeyPem(4096);
    const meta = parsePrivateKeyMetadata(pem4096);

    expect(meta.algorithm).toBe('RSA');
    expect(meta.keySize).toBe(4096);
  });

  it('extracts PKCS#8 RSA-2048 metadata', () => {
    const pem = generatePkcs8RsaPem(2048);
    const meta = parsePrivateKeyMetadata(pem);

    expect(meta.algorithm).toBe('RSA');
    expect(meta.keySize).toBe(2048);
  });

  it('extracts EC P-256 metadata', () => {
    const pem = generateEcP256Pem();
    const meta = parsePrivateKeyMetadata(pem);

    expect(meta.algorithm).toBe('EC');
    expect(meta.keySize).toBe(256);
  });

  it('extracts EC P-384 metadata', () => {
    const pem = generateEcP384Pem();
    const meta = parsePrivateKeyMetadata(pem);

    expect(meta.algorithm).toBe('EC');
    expect(meta.keySize).toBe(384);
  });
});

// ─── PEM Validation ─────────────────────────────────────────────────────────

describe('validatePrivateKeyPem', () => {
  it('accepts a valid RSA private key PEM', () => {
    const pem = getTestPem();
    const result = validatePrivateKeyPem(pem);

    expect(result.valid).toBe(true);
  });

  it('rejects empty string', () => {
    const result = validatePrivateKeyPem('');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('non-empty');
    }
  });

  it('rejects non-PEM content', () => {
    const result = validatePrivateKeyPem('not a PEM');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('PEM header');
    }
  });

  it('rejects certificate PEM (not a private key)', () => {
    // Generate a self-signed certificate PEM
    const keypair = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
    const cert = forge.pki.createCertificate();
    cert.publicKey = keypair.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1);
    cert.setSubject([{ shortName: 'CN', value: 'test' }]);
    cert.setIssuer([{ shortName: 'CN', value: 'test' }]);
    cert.sign(keypair.privateKey);
    const certPem = forge.pki.certificateToPem(cert);

    const result = validatePrivateKeyPem(certPem);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('PEM header');
    }
  });

  it('rejects truncated PEM (valid header but corrupt body)', () => {
    const result = validatePrivateKeyPem(
      '-----BEGIN RSA PRIVATE KEY-----\nTHISISNOTVALIDCONTENT\n-----END RSA PRIVATE KEY-----',
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('Invalid private key PEM');
    }
  });

  it('accepts PEM with surrounding whitespace', () => {
    const pem = getTestPem();
    const paddedPem = `\n  ${pem}  \n`;
    const result = validatePrivateKeyPem(paddedPem);
    expect(result.valid).toBe(true);
  });

  it('accepts a valid PKCS#8 RSA PEM', () => {
    const pem = generatePkcs8RsaPem();
    const result = validatePrivateKeyPem(pem);
    expect(result.valid).toBe(true);
  });

  it('accepts a valid EC P-256 PEM', () => {
    const pem = generateEcP256Pem();
    const result = validatePrivateKeyPem(pem);
    expect(result.valid).toBe(true);
  });
});
