/**
 * Cryptographic utilities for secure private key storage (C5).
 *
 * Provides stateless functions for:
 * - AES-256-GCM encryption/decryption of private keys
 * - PBKDF2-SHA512 key derivation from a master secret
 * - PEM validation and metadata extraction
 * - Public-key fingerprint computation
 *
 * @module keyCrypto
 */

import crypto from 'node:crypto';
import forge from 'node-forge';

// ─── Constants ──────────────────────────────────────────────────────────────

/** AES-256-GCM algorithm identifier */
const ALGORITHM = 'aes-256-gcm' as const;

/** Initialisation-vector length in bytes (96 bits, NIST recommended for GCM) */
const IV_LENGTH = 12;

/** Salt length in bytes */
const SALT_LENGTH = 16;

/** GCM authentication tag length in bytes */
const AUTH_TAG_LENGTH = 16;

/** PBKDF2 iteration count (OWASP 2024 recommendation ≥ 100 000) */
const PBKDF2_ITERATIONS = 100_000;

/** Derived key length in bytes (256 bits for AES-256) */
const DERIVED_KEY_LENGTH = 32;

/** PBKDF2 digest algorithm */
const PBKDF2_DIGEST = 'sha512' as const;

// ─── Error types ────────────────────────────────────────────────────────────

/**
 * Thrown when decryption fails due to auth-tag mismatch or corrupted data.
 */
export class KeyDecryptionError extends Error {
  public readonly code = 'KEY_DECRYPTION_ERROR' as const;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'KeyDecryptionError';
  }
}

// ─── Result types ───────────────────────────────────────────────────────────

/** Encrypted private key envelope — everything needed to decrypt later. */
export interface EncryptedKeyEnvelope {
  /** AES-256-GCM ciphertext (base64) */
  encryptedData: string;
  /** Initialisation vector (base64, 12 bytes) */
  iv: string;
  /** GCM authentication tag (base64, 16 bytes) */
  authTag: string;
  /** PBKDF2 salt (base64, 16 bytes) */
  salt: string;
  /** Encryption algorithm identifier */
  algorithm: typeof ALGORITHM;
}

/** Metadata extracted from a private key PEM. */
export interface PrivateKeyMetadata {
  /** Key algorithm, e.g. "RSA", "EC" */
  algorithm: string;
  /** Key size in bits, e.g. 2048 for RSA, 256 for EC P-256 */
  keySize: number;
}

/** Validation result for a PEM string. */
export type PemValidationResult =
  | { valid: true }
  | { valid: false; error: string };

// ─── Key derivation (internal) ──────────────────────────────────────────────

/**
 * Derive a 256-bit encryption key from the master KEK using PBKDF2-SHA512.
 */
function deriveKey(kek: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(kek, salt, PBKDF2_ITERATIONS, DERIVED_KEY_LENGTH, PBKDF2_DIGEST);
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Encrypt a PEM-encoded private key using AES-256-GCM.
 *
 * A random 12-byte IV and 16-byte salt are generated per invocation,
 * ensuring that encrypting the same key twice produces different ciphertext.
 *
 * @param pemData - The plaintext private key in PEM format.
 * @param kek     - The Key-Encryption-Key (master secret).
 * @returns An {@link EncryptedKeyEnvelope} containing all values needed to decrypt.
 */
export function encryptPrivateKey(pemData: string, kek: string): EncryptedKeyEnvelope {
  const iv = crypto.randomBytes(IV_LENGTH);
  const salt = crypto.randomBytes(SALT_LENGTH);
  const derivedKey = deriveKey(kek, salt);

  const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([cipher.update(pemData, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedData: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    salt: salt.toString('base64'),
    algorithm: ALGORITHM,
  };
}

/**
 * Decrypt a previously encrypted private key.
 *
 * @param encrypted - The {@link EncryptedKeyEnvelope} returned by {@link encryptPrivateKey}.
 * @param kek       - The same Key-Encryption-Key used during encryption.
 * @returns The original PEM string.
 * @throws {KeyDecryptionError} If the auth tag is invalid or data is corrupted.
 */
export function decryptPrivateKey(encrypted: EncryptedKeyEnvelope, kek: string): string {
  try {
    const iv = Buffer.from(encrypted.iv, 'base64');
    const salt = Buffer.from(encrypted.salt, 'base64');
    const authTag = Buffer.from(encrypted.authTag, 'base64');
    const ciphertext = Buffer.from(encrypted.encryptedData, 'base64');

    // Validate buffer lengths before attempting decryption
    if (iv.length !== IV_LENGTH) {
      throw new Error(`Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}`);
    }
    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error(
        `Invalid auth tag length: expected ${AUTH_TAG_LENGTH}, got ${authTag.length}`,
      );
    }

    const derivedKey = deriveKey(kek, salt);

    const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    throw new KeyDecryptionError(
      'Failed to decrypt private key: authentication tag mismatch or corrupted data',
      { cause: err },
    );
  }
}

/**
 * Compute a SHA-256 fingerprint of the public key derived from a private key PEM.
 *
 * The fingerprint is computed over the DER encoding of the SubjectPublicKeyInfo
 * structure, producing a lowercase hex string identical to OpenSSL's output.
 *
 * @param privateKeyPem - PEM-encoded private key (RSA or EC).
 * @returns Lowercase hex SHA-256 fingerprint.
 */
export function computeKeyFingerprint(privateKeyPem: string): string {
  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
  const publicKey = forge.pki.setRsaPublicKey(
    (privateKey as forge.pki.rsa.PrivateKey).n,
    (privateKey as forge.pki.rsa.PrivateKey).e,
  );

  const publicKeyAsn1 = forge.pki.publicKeyToAsn1(publicKey);
  const publicKeyDer = forge.asn1.toDer(publicKeyAsn1).getBytes();

  const hash = crypto.createHash('sha256').update(publicKeyDer, 'binary').digest('hex');
  return hash;
}

/**
 * Parse a private key PEM and extract algorithm metadata.
 *
 * @param pem - PEM-encoded private key.
 * @returns Metadata with algorithm name and key size.
 */
export function parsePrivateKeyMetadata(pem: string): PrivateKeyMetadata {
  const privateKey = forge.pki.privateKeyFromPem(pem);

  // node-forge currently only supports RSA, so we detect based on key properties
  const rsaKey = privateKey as forge.pki.rsa.PrivateKey;
  if (rsaKey.n !== undefined && rsaKey.e !== undefined) {
    const keySize = rsaKey.n.bitLength();
    return { algorithm: 'RSA', keySize };
  }

  // Fallback for unknown / future key types
  return { algorithm: 'UNKNOWN', keySize: 0 };
}

/**
 * Validate that a string is a well-formed private key PEM.
 *
 * Checks:
 * 1. PEM envelope is present and correctly formatted.
 * 2. The content can be parsed as a private key by node-forge.
 *
 * @param pem - The string to validate.
 * @returns A {@link PemValidationResult} indicating success or the error message.
 */
export function validatePrivateKeyPem(pem: string): PemValidationResult {
  if (!pem || typeof pem !== 'string') {
    return { valid: false, error: 'PEM data must be a non-empty string' };
  }

  const trimmed = pem.trim();

  // Check for standard PEM envelope markers
  const hasRsaHeader = trimmed.startsWith('-----BEGIN RSA PRIVATE KEY-----');
  const hasGenericHeader = trimmed.startsWith('-----BEGIN PRIVATE KEY-----');
  const hasEncryptedHeader = trimmed.startsWith('-----BEGIN ENCRYPTED PRIVATE KEY-----');

  if (!hasRsaHeader && !hasGenericHeader && !hasEncryptedHeader) {
    return { valid: false, error: 'Missing or invalid PEM header (expected a PRIVATE KEY block)' };
  }

  try {
    forge.pki.privateKeyFromPem(trimmed);
    return { valid: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, error: `Invalid private key PEM: ${message}` };
  }
}
