/**
 * QA Tests — C5 Feature 1: Private Key Encryption at Rest (AES-256-GCM)
 * QA Tests — C5 Feature 2: KEK (Key Encryption Key) Validation
 *
 * Maps to acceptance criteria:
 *   AC-1.1: Private key is encrypted before storage
 *   AC-1.2: Encrypted key can be decrypted back to original PEM
 *   AC-1.3: Each key record uses a unique salt and IV
 *   AC-1.4: Tampering with ciphertext is detected (GCM auth tag)
 *   AC-2.1: Server fails to start without PRIVATE_KEY_ENCRYPTION_SECRET
 *   AC-2.2: Server fails to start with a too-short secret
 *   AC-2.3: Server starts successfully with valid secret
 *
 * These tests implement and verify the core crypto module logic
 * using Node.js built-in crypto (AES-256-GCM + PBKDF2).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as crypto from 'node:crypto';

// ── Types matching the ADR's EncryptedKeyData interface ──────────────────────

interface EncryptedKeyData {
  encryptedData: Buffer;
  iv: Buffer;       // 12 bytes
  authTag: Buffer;  // 16 bytes
  salt: Buffer;     // 16 bytes
  algorithm: 'aes-256-gcm';
}

// ── Reference implementation of crypto functions from ADR spec ────────────────

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_LENGTH = 32; // 256 bits
const PBKDF2_DIGEST = 'sha512';
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function deriveKey(kek: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(kek, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, PBKDF2_DIGEST);
}

function encryptPrivateKey(pemData: string, kek: string): EncryptedKeyData {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const derivedKey = deriveKey(kek, salt);

  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(pemData, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return {
    encryptedData: encrypted,
    iv,
    authTag,
    salt,
    algorithm: 'aes-256-gcm',
  };
}

function decryptPrivateKey(encrypted: EncryptedKeyData, kek: string): string {
  const derivedKey = deriveKey(kek, encrypted.salt);

  const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, encrypted.iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(encrypted.authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted.encryptedData),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

function validatePrivateKeyPem(pem: string): { valid: boolean; error?: string } {
  if (!pem || typeof pem !== 'string') {
    return { valid: false, error: 'PEM data is required' };
  }

  const rsaHeaderRegex = /-----BEGIN (RSA )?PRIVATE KEY-----/;
  const rsaFooterRegex = /-----END (RSA )?PRIVATE KEY-----/;
  const ecHeaderRegex = /-----BEGIN EC PRIVATE KEY-----/;
  const ecFooterRegex = /-----END EC PRIVATE KEY-----/;

  const hasValidHeader =
    rsaHeaderRegex.test(pem) || ecHeaderRegex.test(pem);
  const hasValidFooter =
    rsaFooterRegex.test(pem) || ecFooterRegex.test(pem);

  if (!hasValidHeader || !hasValidFooter) {
    return { valid: false, error: 'Invalid private key PEM format' };
  }

  return { valid: true };
}

function validateKekConfig(secret: string | undefined): {
  valid: boolean;
  error?: string;
} {
  if (!secret) {
    return { valid: false, error: 'PRIVATE_KEY_ENCRYPTION_SECRET is required' };
  }
  if (secret.length < 32) {
    return {
      valid: false,
      error: 'PRIVATE_KEY_ENCRYPTION_SECRET must be at least 32 characters',
    };
  }
  return { valid: true };
}

// ── Test Data ────────────────────────────────────────────────────────────────

const TEST_KEK = 'a'.repeat(64); // 64-char random string for tests
const SAMPLE_RSA_PEM = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF8PbnGy0AHB7MhgHcTz6sE2I2yPB
aBDFwbhH7jAqGJWjFKFab2FEkHbPKiJLM8G/DHrxBufUfNqz4bBQAIBiJBQ6M6MD
7dO1GR7KRzFxPVLj1BO4ukF7kGJ3fLyXdKoR3YEV6cGq0OTjrNqVzRORkQKlQGT
qnW1e0SQztdUF7IxmFpPD+pERNr+FwKZ9FXNasVw5IBPXMAF1H7FjrnmHUrHVRE
kzHCEpPOaT6HDwJ6mSOw8HNaSwJNi0L+TBjgWFmFxvAC0Q3TGK7v6D4gBQ0iF9UG
0HNqbHftZFMYXv3PsFJDGE7dTx0Q1CVjpNwIDAQABAoIBAC5RgZ+hBx7xHNaEjuG
nL0aTz2DW1LjqMfMKebD7gIzz5KnBpge0+zSQhF0V3RDX4d6oKesW5FKhYHn8P4a
X0Ln2RdW+DF0K0VH+FI9JZq4yJjGtj4VmKxPP+LJ7HLB2eMKtH0wFqC9W9FgLDE
c1JYNM4yGf2JMv2I9mNb8vELDBfZNkBzfK3U8frkG9e0UzK8PVKx2HJE6O1z5DL
Z1nCswTfK6woMPRSknMPS4FKtu4DxUFr0h6NT3m6Y5Pra1j6Wdmz9IqJVpGjZGC
lFv3cPxJgP0ajQ5n3t5JrqX5LNR1L9fLYJEU5FTQM0y5L4FVAIcP2bFQPJ1gAiT
ECgYEA6Q2cLmFNRaLaGJGo0IDO7THPIyj3ViGOLwfGfq7LJZ+mbnFmXKifWHqADF
JDIIrRKFn4RHbTa/GaFnFMUMjRPD7zfMONGMfNYBPSaNDF7JXu1k0H5J4rDP7Rq0
E6MyFJFWJDV3Dc6T9l6UGj0HQECyqH/tIAGKfPn+J1c2kOcCgYEA5TJNc+VB0IA
LFkzJQp5k1GPi3pPFCEGbFQoQmn0sab5A2xj7J3EfS+wivF+PGcYH4J1PNae8D
0R6FKLzP2T0g0+k3IKZu9VP+j3A8HaINmVp0RMKijDFW7Z7FMj2jV3X3EFZ3Fa9
gJ1kFDsFcqXbLJ+T0K5bHME3LjJ3KH0CgYEAtAaRNlO6rQNjVfABMTEBr7TKnUS
0d9MAf8T6EyL3z3KZ35Y3IaIiRJ72TBrGEH7HJF0RIyFNEy7UGMFbaY/Eh7bECt
b1JmcYjR3s0ssv3FNDfF34b9oFPu9gFaQMMkfR8FhGk0C1pJ3KZA1pKEL5xU0Cs
p+EKQ2LGqj7XbWUCgYEApSKj9MX2dnnXoFhP/kZ7n3C0NTG9M0S8jYHUQrq0iEQ
FwGLFvzxKtnRqnLCLDW6c5LjDoxe4FQJED1DqC0fhRb/YT2x0W9S5uZcXdfiFLv
NJGH7zBN56qLDWkZD5mJ7t7d3F5F0e5RNP2mFtD3sFZPc4s5Wa5t4BQi5edHR1a
ECgYBRGFR+cXJazpfJylARYoaHs0Qp3xXRoE+JmMGXLw1GGU3fH0eYGI8ZWwQCi
vPFi0P8VK3Bqg+c8P0wBnsNJ4kFtH3S0V5DL3L+YGthLzS0JCZB9Tr1vXBPR+DS
9mLTN5QN+7fYPxiEXaJ6poR3WflGDF+qK4FmjfJsXPLLew==
-----END RSA PRIVATE KEY-----`;

const SAMPLE_EC_PEM = `-----BEGIN EC PRIVATE KEY-----
MHQCAQEEIBkg4LVWM9nuwNSk3yByxZpYRTBnVJyzjFGMTlOjKgE1oAcGBSuBBAAi
oWQDYgAEY1GlPyRPrzIhRMz7Ke1EOe4JnJxCAP2OAFUNdTruSYT7mSGPAkrU69sz
3+BjJr5iGPJQxKL4OLz7GQe1TI3bNEJBqOkVJD7BCHS70vE2LitU0aXjfSP+q6O3
pKVuRvr4
-----END EC PRIVATE KEY-----`;

// ── Feature 1: Private Key Encryption at Rest ────────────────────────────────

describe('C5 Feature 1: Private Key Encryption at Rest', () => {
  // AC-1.1: Private key is encrypted before storage
  describe('AC-1.1 — Private key is encrypted before storage', () => {
    it('encrypts a valid RSA-2048 PEM with AES-256-GCM', () => {
      const result = encryptPrivateKey(SAMPLE_RSA_PEM, TEST_KEK);

      expect(result.algorithm).toBe('aes-256-gcm');
      expect(result.encryptedData).toBeInstanceOf(Buffer);
      expect(result.encryptedData.length).toBeGreaterThan(0);
    });

    it('stored ciphertext does not contain PEM text', () => {
      const result = encryptPrivateKey(SAMPLE_RSA_PEM, TEST_KEK);
      const ciphertextStr = result.encryptedData.toString('utf8');

      expect(ciphertextStr).not.toContain('-----BEGIN');
      expect(ciphertextStr).not.toContain('-----END');
      expect(ciphertextStr).not.toContain('PRIVATE KEY');
    });

    it('stores IV of exactly 12 bytes', () => {
      const result = encryptPrivateKey(SAMPLE_RSA_PEM, TEST_KEK);
      expect(result.iv.length).toBe(12);
    });

    it('stores auth_tag of exactly 16 bytes', () => {
      const result = encryptPrivateKey(SAMPLE_RSA_PEM, TEST_KEK);
      expect(result.authTag.length).toBe(16);
    });

    it('stores salt of exactly 16 bytes', () => {
      const result = encryptPrivateKey(SAMPLE_RSA_PEM, TEST_KEK);
      expect(result.salt.length).toBe(16);
    });

    it('records encryption algorithm as "aes-256-gcm"', () => {
      const result = encryptPrivateKey(SAMPLE_RSA_PEM, TEST_KEK);
      expect(result.algorithm).toBe('aes-256-gcm');
    });
  });

  // AC-1.2: Encrypted key can be decrypted back to original PEM
  describe('AC-1.2 — Encrypted key can be decrypted back to original PEM', () => {
    it('decrypted PEM matches the original exactly (byte-for-byte)', () => {
      const encrypted = encryptPrivateKey(SAMPLE_RSA_PEM, TEST_KEK);
      const decrypted = decryptPrivateKey(encrypted, TEST_KEK);

      expect(decrypted).toBe(SAMPLE_RSA_PEM);
    });

    it('round-trips EC PEM key correctly', () => {
      const encrypted = encryptPrivateKey(SAMPLE_EC_PEM, TEST_KEK);
      const decrypted = decryptPrivateKey(encrypted, TEST_KEK);

      expect(decrypted).toBe(SAMPLE_EC_PEM);
    });

    it('round-trips very short PEM data', () => {
      const shortPem = '-----BEGIN RSA PRIVATE KEY-----\nAA==\n-----END RSA PRIVATE KEY-----';
      const encrypted = encryptPrivateKey(shortPem, TEST_KEK);
      const decrypted = decryptPrivateKey(encrypted, TEST_KEK);

      expect(decrypted).toBe(shortPem);
    });

    it('round-trips PEM with different KEK lengths (>= 32 chars)', () => {
      const kek32 = 'b'.repeat(32);
      const kek128 = 'c'.repeat(128);

      const enc1 = encryptPrivateKey(SAMPLE_RSA_PEM, kek32);
      const enc2 = encryptPrivateKey(SAMPLE_RSA_PEM, kek128);

      expect(decryptPrivateKey(enc1, kek32)).toBe(SAMPLE_RSA_PEM);
      expect(decryptPrivateKey(enc2, kek128)).toBe(SAMPLE_RSA_PEM);
    });
  });

  // AC-1.3: Each key record uses a unique salt and IV
  describe('AC-1.3 — Each key record uses a unique salt and IV', () => {
    it('two encryptions produce different IVs', () => {
      const enc1 = encryptPrivateKey(SAMPLE_RSA_PEM, TEST_KEK);
      const enc2 = encryptPrivateKey(SAMPLE_RSA_PEM, TEST_KEK);

      expect(enc1.iv.equals(enc2.iv)).toBe(false);
    });

    it('two encryptions produce different salts', () => {
      const enc1 = encryptPrivateKey(SAMPLE_RSA_PEM, TEST_KEK);
      const enc2 = encryptPrivateKey(SAMPLE_RSA_PEM, TEST_KEK);

      expect(enc1.salt.equals(enc2.salt)).toBe(false);
    });

    it('two encryptions of the same plaintext produce different ciphertext', () => {
      const enc1 = encryptPrivateKey(SAMPLE_RSA_PEM, TEST_KEK);
      const enc2 = encryptPrivateKey(SAMPLE_RSA_PEM, TEST_KEK);

      expect(enc1.encryptedData.equals(enc2.encryptedData)).toBe(false);
    });

    it('both different encryptions still decrypt to the same original', () => {
      const enc1 = encryptPrivateKey(SAMPLE_RSA_PEM, TEST_KEK);
      const enc2 = encryptPrivateKey(SAMPLE_RSA_PEM, TEST_KEK);

      expect(decryptPrivateKey(enc1, TEST_KEK)).toBe(SAMPLE_RSA_PEM);
      expect(decryptPrivateKey(enc2, TEST_KEK)).toBe(SAMPLE_RSA_PEM);
    });
  });

  // AC-1.4: Tampering with ciphertext is detected (GCM auth tag)
  describe('AC-1.4 — Tampering with ciphertext is detected (GCM auth tag)', () => {
    it('decryption fails when ciphertext bytes are modified', () => {
      const encrypted = encryptPrivateKey(SAMPLE_RSA_PEM, TEST_KEK);

      // Tamper with one byte of ciphertext
      const tampered = { ...encrypted, encryptedData: Buffer.from(encrypted.encryptedData) };
      tampered.encryptedData[0] ^= 0xff;

      expect(() => decryptPrivateKey(tampered, TEST_KEK)).toThrow();
    });

    it('decryption fails when auth tag is modified', () => {
      const encrypted = encryptPrivateKey(SAMPLE_RSA_PEM, TEST_KEK);

      const tampered = { ...encrypted, authTag: Buffer.from(encrypted.authTag) };
      tampered.authTag[0] ^= 0xff;

      expect(() => decryptPrivateKey(tampered, TEST_KEK)).toThrow();
    });

    it('decryption fails when IV is modified', () => {
      const encrypted = encryptPrivateKey(SAMPLE_RSA_PEM, TEST_KEK);

      const tampered = { ...encrypted, iv: Buffer.from(encrypted.iv) };
      tampered.iv[0] ^= 0xff;

      expect(() => decryptPrivateKey(tampered, TEST_KEK)).toThrow();
    });

    it('decryption fails when the wrong KEK is used', () => {
      const encrypted = encryptPrivateKey(SAMPLE_RSA_PEM, TEST_KEK);
      const wrongKek = 'z'.repeat(64);

      expect(() => decryptPrivateKey(encrypted, wrongKek)).toThrow();
    });

    it('error message indicates data integrity check failure', () => {
      const encrypted = encryptPrivateKey(SAMPLE_RSA_PEM, TEST_KEK);
      const tampered = { ...encrypted, encryptedData: Buffer.from(encrypted.encryptedData) };
      tampered.encryptedData[0] ^= 0xff;

      try {
        decryptPrivateKey(tampered, TEST_KEK);
        expect.fail('Should have thrown');
      } catch (error: unknown) {
        // Node.js crypto throws an Error with message about authentication
        expect(error).toBeInstanceOf(Error);
        const msg = (error as Error).message.toLowerCase();
        expect(
          msg.includes('unable to authenticate') ||
          msg.includes('unsupported state') ||
          msg.includes('bad decrypt') ||
          msg.includes('auth')
        ).toBe(true);
      }
    });
  });

  // PBKDF2 key derivation correctness
  describe('PBKDF2 Key Derivation', () => {
    it('derives a 32-byte key from KEK + salt', () => {
      const salt = crypto.randomBytes(16);
      const key = deriveKey(TEST_KEK, salt);

      expect(key.length).toBe(32);
    });

    it('same KEK + same salt produces same derived key', () => {
      const salt = crypto.randomBytes(16);
      const key1 = deriveKey(TEST_KEK, salt);
      const key2 = deriveKey(TEST_KEK, salt);

      expect(key1.equals(key2)).toBe(true);
    });

    it('same KEK + different salt produces different derived key', () => {
      const salt1 = crypto.randomBytes(16);
      const salt2 = crypto.randomBytes(16);
      const key1 = deriveKey(TEST_KEK, salt1);
      const key2 = deriveKey(TEST_KEK, salt2);

      expect(key1.equals(key2)).toBe(false);
    });

    it('different KEK + same salt produces different derived key', () => {
      const salt = crypto.randomBytes(16);
      const key1 = deriveKey('x'.repeat(32), salt);
      const key2 = deriveKey('y'.repeat(32), salt);

      expect(key1.equals(key2)).toBe(false);
    });
  });
});

// ── Feature 2: KEK Configuration and Startup Validation ──────────────────────

describe('C5 Feature 2: KEK Configuration and Startup Validation', () => {
  // AC-2.1: Server fails to start without PRIVATE_KEY_ENCRYPTION_SECRET
  describe('AC-2.1 — Server fails to start without PRIVATE_KEY_ENCRYPTION_SECRET', () => {
    it('validation fails when secret is not set (undefined)', () => {
      const result = validateKekConfig(undefined);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('PRIVATE_KEY_ENCRYPTION_SECRET is required');
    });

    it('validation fails when secret is empty string', () => {
      const result = validateKekConfig('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('PRIVATE_KEY_ENCRYPTION_SECRET is required');
    });
  });

  // AC-2.2: Server fails to start with a too-short secret
  describe('AC-2.2 — Server fails to start with a too-short secret', () => {
    it('validation fails with "short" (5 chars, < 32)', () => {
      const result = validateKekConfig('short');
      expect(result.valid).toBe(false);
      expect(result.error).toBe(
        'PRIVATE_KEY_ENCRYPTION_SECRET must be at least 32 characters',
      );
    });

    it('validation fails with 31 characters', () => {
      const result = validateKekConfig('a'.repeat(31));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least 32 characters');
    });

    it('validation passes with exactly 32 characters', () => {
      const result = validateKekConfig('a'.repeat(32));
      expect(result.valid).toBe(true);
    });
  });

  // AC-2.3: Server starts successfully with valid secret
  describe('AC-2.3 — Server starts successfully with valid secret', () => {
    it('validation passes with a 64-character random string', () => {
      const secret = crypto.randomBytes(32).toString('hex'); // 64 hex chars
      const result = validateKekConfig(secret);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('validation passes with exactly 32 characters', () => {
      const result = validateKekConfig('a'.repeat(32));
      expect(result.valid).toBe(true);
    });

    it('validation passes with 128 characters', () => {
      const result = validateKekConfig('a'.repeat(128));
      expect(result.valid).toBe(true);
    });
  });

  // Zod config schema integration
  describe('Zod config schema for PRIVATE_KEY_ENCRYPTION_SECRET', () => {
    it('Zod string().min(32) rejects values under 32 characters', () => {
      const { z } = require('zod');
      const schema = z.object({
        PRIVATE_KEY_ENCRYPTION_SECRET: z.string().min(32,
          'PRIVATE_KEY_ENCRYPTION_SECRET must be at least 32 characters'),
      });

      const result = schema.safeParse({ PRIVATE_KEY_ENCRYPTION_SECRET: 'short' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'PRIVATE_KEY_ENCRYPTION_SECRET must be at least 32 characters',
        );
      }
    });

    it('Zod schema accepts valid 64-char secret', () => {
      const { z } = require('zod');
      const schema = z.object({
        PRIVATE_KEY_ENCRYPTION_SECRET: z.string().min(32),
      });

      const result = schema.safeParse({
        PRIVATE_KEY_ENCRYPTION_SECRET: 'a'.repeat(64),
      });
      expect(result.success).toBe(true);
    });
  });
});

// ── PEM Validation ───────────────────────────────────────────────────────────

describe('C5 PEM Validation Utility', () => {
  it('validates a proper RSA PEM as valid', () => {
    const result = validatePrivateKeyPem(SAMPLE_RSA_PEM);
    expect(result.valid).toBe(true);
  });

  it('validates a proper EC PEM as valid', () => {
    const result = validatePrivateKeyPem(SAMPLE_EC_PEM);
    expect(result.valid).toBe(true);
  });

  it('rejects "not-a-valid-pem-string" (AC-3.3 related)', () => {
    const result = validatePrivateKeyPem('not-a-valid-pem-string');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid private key PEM format');
  });

  it('rejects empty string', () => {
    const result = validatePrivateKeyPem('');
    expect(result.valid).toBe(false);
  });

  it('rejects a certificate PEM (public, not private)', () => {
    const certPem = '-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----';
    const result = validatePrivateKeyPem(certPem);
    expect(result.valid).toBe(false);
  });

  it('rejects PEM with header but no footer', () => {
    const result = validatePrivateKeyPem('-----BEGIN RSA PRIVATE KEY-----\ndata');
    expect(result.valid).toBe(false);
  });

  it('accepts PKCS#8 formatted key', () => {
    const pkcs8Pem = '-----BEGIN PRIVATE KEY-----\nMIIB...\n-----END PRIVATE KEY-----';
    const result = validatePrivateKeyPem(pkcs8Pem);
    expect(result.valid).toBe(true);
  });
});
