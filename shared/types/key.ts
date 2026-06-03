/**
 * Private key storage domain types (C5).
 *
 * These types support the secure storage and lifecycle management
 * of encrypted private keys associated with certificates.
 */

// ─── Enums / Unions ─────────────────────────────────────────────────────────

/** Lifecycle status of a stored private key */
export type KeyStatus = 'ACTIVE' | 'ROTATED' | 'DELETED';

/** Audit actions specific to private key operations */
export type KeyAuditAction = 'KEY_STORE' | 'KEY_RETRIEVE' | 'KEY_ROTATE' | 'KEY_DELETE';

// ─── Metadata ───────────────────────────────────────────────────────────────

/**
 * Public metadata for a stored private key.
 *
 * Returned by listing / detail endpoints. Never contains the actual
 * encrypted key material — only identification and status information.
 */
export interface PrivateKeyMetadata {
  id: string;

  /** The certificate this key belongs to */
  certificateId: string;

  /** Key algorithm (e.g. "RSA-2048", "ECDSA-P256") */
  algorithm: string;

  /** SHA-256 fingerprint of the public key */
  fingerprint: string;

  /** Current lifecycle status */
  status: KeyStatus;

  /** Encryption algorithm used for at-rest protection (e.g. "aes-256-gcm") */
  encAlgorithm: string;

  /** ID of the previous key in the rotation chain (null if first key) */
  previousKeyId: string | null;

  /** When the key was stored (ISO-8601) */
  createdAt: string;

  /** When the key metadata was last updated (ISO-8601) */
  updatedAt: string;
}
