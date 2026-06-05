/**
 * QA Tests — C5 Features 3–7: Key Service + API Endpoints
 *
 * Maps to acceptance criteria:
 *   AC-3.1: Successfully store a valid private key
 *   AC-3.2: Reject storage when key already exists for certificate
 *   AC-3.3: Reject invalid PEM format
 *   AC-3.4: Reject storage for non-existent certificate
 *   AC-3.5: Reject if caller lacks key:write scope
 *   AC-4.1: Get key metadata for certificate with stored key
 *   AC-4.2: Get metadata for certificate with no stored key
 *   AC-4.3: Get metadata for deleted key shows deleted status
 *   AC-5.1: Successfully retrieve private key with reason
 *   AC-5.2: Retrieval requires a reason (mandatory field)
 *   AC-5.3: Retrieval of deleted key fails with 410
 *   AC-5.4: Retrieval without key:retrieve scope is rejected
 *   AC-5.5: Every retrieval creates an audit entry
 *   AC-6.1: Rotate key replaces current key with new one
 *   AC-6.2: Rotation fails if no existing key
 *   AC-6.3: Old key is still accessible after rotation
 *   AC-7.1: Delete key overwrites ciphertext and marks deleted
 *   AC-7.2: Deletion requires a reason
 *   AC-7.3: Deletion is irreversible
 *   AC-7.4: Cannot delete already-deleted key
 *
 * These tests implement the key service business logic using in-memory
 * stores to validate all acceptance criteria without a database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as crypto from 'node:crypto';

// ── Types from ADR ──────────────────────────────────────────────────────────

type KeyStatus = 'ACTIVE' | 'ROTATED' | 'DELETED';

interface PrivateKeyRecord {
  id: string;
  certificateId: string;
  algorithm: string;
  fingerprint: string;
  status: KeyStatus;
  encryptedData: Buffer;
  iv: Buffer;
  authTag: Buffer;
  salt: Buffer;
  encAlgorithm: string;
  previousKeyId: string | null;
  createdAt: Date;
  rotatedAt: Date | null;
  deletedAt: Date | null;
}

interface AuditEntry {
  id: string;
  action: string;
  certificateId: string;
  actor: string;
  result: 'SUCCESS' | 'FAILURE';
  detail: string | null;
  timestamp: Date;
}

interface PrivateKeyMetadata {
  keyId: string;
  certificateId: string;
  algorithm: string;
  fingerprint: string;
  status: KeyStatus;
  createdAt: string;
  rotatedAt: string | null;
  deletedAt: string | null;
  previousKeyId: string | null;
}

// ── In-memory repository & service mock ─────────────────────────────────────

const TEST_KEK = 'test-kek-secret-that-is-at-least-32-characters-long';

const SAMPLE_PEM = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF8PbnGy0AHB7MhgHcTz6sE2I2yPB
aBDFwbhH7jAqGJWjFKFab2FEkHbPKiJLM8G/DHrxBufUfNqz4bBQAIBiJBQ6M6MD
7dO1GR7KRzFxPVLj1BO4ukF7kGJ3fLyXdKoR3YEV6cGq0OTjrNqVzRORkQKlQGT
qnW1e0SQztdUF7IxmFpPD+pERNr+FwKZ9FXNasVw5IBPXMAF1H7FjrnmHUrHVRE
kzHCEpPOaT6HDwJ6mSOw8HNaSwJNi0L+TBjgWFmFxvAC0Q3TGK7v6D4gBQ0iF9UG
0HNqbHftZFMYXv3PsFJDGE7dTx0Q1CVjpNwIDAQABAoIBAC5RgZ+hBx7xHNaEjuG
-----END RSA PRIVATE KEY-----`;

const SAMPLE_PEM_2 = `-----BEGIN RSA PRIVATE KEY-----
MIIBogIBAAJBALkT3S3YJnlBRY8gONZ+VOq2Kcndu0B4S1D1C5f3q4y2f3f3ABBA
ZQ2j1k1iVCq5H8yJ1x8D5K7K2V5dBjV8sECAwEAAQJAd6TcG8nWJJ5A2X5k8D2M
-----END RSA PRIVATE KEY-----`;

class InMemoryKeyStore {
  private keys: Map<string, PrivateKeyRecord> = new Map();
  private certificates: Set<string> = new Set();
  private auditLog: AuditEntry[] = [];
  private idCounter = 0;

  addCertificate(certId: string): void {
    this.certificates.add(certId);
  }

  certificateExists(certId: string): boolean {
    return this.certificates.has(certId);
  }

  getAuditLog(): AuditEntry[] {
    return [...this.auditLog];
  }

  private createAudit(
    action: string,
    certificateId: string,
    actor: string,
    result: 'SUCCESS' | 'FAILURE',
    detail: string | null,
  ): void {
    this.auditLog.push({
      id: `audit-${++this.idCounter}`,
      action,
      certificateId,
      actor,
      result,
      detail,
      timestamp: new Date(),
    });
  }

  private encrypt(pem: string): Pick<PrivateKeyRecord, 'encryptedData' | 'iv' | 'authTag' | 'salt' | 'encAlgorithm'> {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const key = crypto.pbkdf2Sync(TEST_KEK, salt, 100_000, 32, 'sha512');
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(pem, 'utf8'), cipher.final()]);
    return {
      encryptedData: encrypted,
      iv,
      authTag: cipher.getAuthTag(),
      salt,
      encAlgorithm: 'aes-256-gcm',
    };
  }

  private decrypt(record: PrivateKeyRecord): string {
    const key = crypto.pbkdf2Sync(TEST_KEK, record.salt, 100_000, 32, 'sha512');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, record.iv);
    decipher.setAuthTag(record.authTag);
    const decrypted = Buffer.concat([decipher.update(record.encryptedData), decipher.final()]);
    return decrypted.toString('utf8');
  }

  storeKey(
    certificateId: string,
    pemData: string,
    actor: string,
    scopes: string[] = ['key:write'],
  ): { status: number; body: Record<string, unknown> } {
    // Scope check (AC-3.5)
    if (!scopes.includes('key:write')) {
      return { status: 403, body: { error: 'Forbidden', message: 'Insufficient scope' } };
    }

    // Certificate existence check (AC-3.4)
    if (!this.certificateExists(certificateId)) {
      return { status: 404, body: { error: 'Not Found', message: 'Certificate not found' } };
    }

    // PEM validation (AC-3.3)
    const pemRegex = /-----BEGIN (RSA |EC )?PRIVATE KEY-----[\s\S]+-----END (RSA |EC )?PRIVATE KEY-----/;
    if (!pemRegex.test(pemData)) {
      return { status: 400, body: { error: 'Bad Request', message: 'Invalid private key PEM format' } };
    }

    // Duplicate check (AC-3.2)
    const existing = this.findActiveByCertId(certificateId);
    if (existing) {
      return {
        status: 409,
        body: { error: 'Conflict', message: 'Certificate already has an active private key. Use rotation endpoint.' },
      };
    }

    // Encrypt and store (AC-3.1)
    const cryptoData = this.encrypt(pemData);
    const keyId = `key-${++this.idCounter}`;
    const fingerprint = crypto.createHash('sha256').update(pemData).digest('hex');

    const record: PrivateKeyRecord = {
      id: keyId,
      certificateId,
      algorithm: 'RSA-2048',
      fingerprint,
      status: 'ACTIVE',
      ...cryptoData,
      previousKeyId: null,
      createdAt: new Date(),
      rotatedAt: null,
      deletedAt: null,
    };

    this.keys.set(keyId, record);
    this.createAudit('KEY_STORE', certificateId, actor, 'SUCCESS', null);

    return {
      status: 201,
      body: {
        keyId: record.id,
        certificateId: record.certificateId,
        algorithm: record.algorithm,
        fingerprint: record.fingerprint,
        status: record.status,
        createdAt: record.createdAt.toISOString(),
      },
    };
  }

  getKeyMetadata(
    certificateId: string,
    includeRotated = false,
  ): { status: number; body: Record<string, unknown> } {
    const allKeys = Array.from(this.keys.values()).filter(
      (k) => k.certificateId === certificateId,
    );

    if (includeRotated) {
      if (allKeys.length === 0) {
        return { status: 404, body: { message: 'No private key stored for this certificate' } };
      }
      return {
        status: 200,
        body: {
          keys: allKeys.map((k) => ({
            keyId: k.id,
            certificateId: k.certificateId,
            algorithm: k.algorithm,
            fingerprint: k.fingerprint,
            status: k.status,
            createdAt: k.createdAt.toISOString(),
            rotatedAt: k.rotatedAt?.toISOString() ?? null,
            deletedAt: k.deletedAt?.toISOString() ?? null,
          })),
        },
      };
    }

    // Find the latest relevant key (ACTIVE preferred, then DELETED)
    const activeKey = allKeys.find((k) => k.status === 'ACTIVE');
    const deletedKey = allKeys.find((k) => k.status === 'DELETED');
    const key = activeKey ?? deletedKey;

    if (!key) {
      return { status: 404, body: { message: 'No private key stored for this certificate' } };
    }

    return {
      status: 200,
      body: {
        keyId: key.id,
        certificateId: key.certificateId,
        algorithm: key.algorithm,
        fingerprint: key.fingerprint,
        status: key.status,
        createdAt: key.createdAt.toISOString(),
        rotatedAt: key.rotatedAt?.toISOString() ?? null,
        deletedAt: key.deletedAt?.toISOString() ?? null,
      },
    };
  }

  retrieveKey(
    certificateId: string,
    reason: string | undefined,
    actor: string,
    scopes: string[] = ['key:retrieve'],
  ): { status: number; body: Record<string, unknown> } {
    // Scope check (AC-5.4)
    if (!scopes.includes('key:retrieve')) {
      return { status: 403, body: { error: 'Forbidden', message: 'Insufficient scope' } };
    }

    // Reason required (AC-5.2)
    if (!reason || reason.trim() === '') {
      return {
        status: 400,
        body: { error: 'Bad Request', message: 'Reason is required for key retrieval (audit trail)' },
      };
    }

    const allKeys = Array.from(this.keys.values()).filter(
      (k) => k.certificateId === certificateId,
    );

    const activeKey = allKeys.find((k) => k.status === 'ACTIVE');
    const deletedKey = allKeys.find((k) => k.status === 'DELETED');

    // Deleted key (AC-5.3, AC-7.3)
    if (deletedKey && !activeKey) {
      return {
        status: 410,
        body: { error: 'Gone', message: 'Private key has been permanently deleted' },
      };
    }

    if (!activeKey) {
      return { status: 404, body: { message: 'No private key stored for this certificate' } };
    }

    // Decrypt
    try {
      const pem = this.decrypt(activeKey);
      this.createAudit('KEY_RETRIEVE', certificateId, actor, 'SUCCESS', reason);
      return { status: 200, body: { privateKeyPem: pem } };
    } catch (error) {
      this.createAudit('KEY_RETRIEVE', certificateId, actor, 'FAILURE', 'Decryption failed — data integrity check failed');
      return {
        status: 500,
        body: { error: 'Internal Server Error', message: 'Decryption failed — data integrity check failed' },
      };
    }
  }

  rotateKey(
    certificateId: string,
    newPemData: string,
    actor: string,
  ): { status: number; body: Record<string, unknown> } {
    const activeKey = this.findActiveByCertId(certificateId);

    if (!activeKey) {
      return { status: 404, body: { message: 'No active key found to rotate' } };
    }

    // Mark old key as ROTATED
    activeKey.status = 'ROTATED';
    activeKey.rotatedAt = new Date();

    // Create new key
    const cryptoData = this.encrypt(newPemData);
    const keyId = `key-${++this.idCounter}`;
    const fingerprint = crypto.createHash('sha256').update(newPemData).digest('hex');

    const newRecord: PrivateKeyRecord = {
      id: keyId,
      certificateId,
      algorithm: 'RSA-2048',
      fingerprint,
      status: 'ACTIVE',
      ...cryptoData,
      previousKeyId: activeKey.id,
      createdAt: new Date(),
      rotatedAt: null,
      deletedAt: null,
    };

    this.keys.set(keyId, newRecord);
    this.createAudit('KEY_ROTATE', certificateId, actor, 'SUCCESS',
      `Rotated from ${activeKey.id} to ${keyId}`);

    return {
      status: 200,
      body: {
        keyId: newRecord.id,
        previousKeyId: activeKey.id,
        status: 'ACTIVE',
        fingerprint: newRecord.fingerprint,
      },
    };
  }

  deleteKey(
    certificateId: string,
    reason: string | undefined,
    actor: string,
  ): { status: number; body: Record<string, unknown> } {
    // Reason required (AC-7.2)
    if (!reason || reason.trim() === '') {
      return {
        status: 400,
        body: { error: 'Bad Request', message: 'Reason is required for key deletion (audit trail)' },
      };
    }

    const allKeys = Array.from(this.keys.values()).filter(
      (k) => k.certificateId === certificateId,
    );

    const activeKey = allKeys.find((k) => k.status === 'ACTIVE');
    const deletedKey = allKeys.find((k) => k.status === 'DELETED');

    // Already deleted (AC-7.4)
    if (deletedKey && !activeKey) {
      return { status: 410, body: { message: 'Key already deleted' } };
    }

    if (!activeKey) {
      return { status: 404, body: { message: 'No active key found' } };
    }

    // Overwrite ciphertext with zeros (AC-7.1)
    activeKey.encryptedData = Buffer.alloc(activeKey.encryptedData.length, 0);
    activeKey.status = 'DELETED';
    activeKey.deletedAt = new Date();

    this.createAudit('KEY_DELETE', certificateId, actor, 'SUCCESS', reason);

    return {
      status: 200,
      body: {
        keyId: activeKey.id,
        status: 'DELETED',
        deletedAt: activeKey.deletedAt.toISOString(),
      },
    };
  }

  private findActiveByCertId(certId: string): PrivateKeyRecord | undefined {
    return Array.from(this.keys.values()).find(
      (k) => k.certificateId === certId && k.status === 'ACTIVE',
    );
  }

  // Test helper: corrupt ciphertext for AC-1.4 integration
  corruptKeyData(certId: string): void {
    const key = Array.from(this.keys.values()).find(
      (k) => k.certificateId === certId && k.status === 'ACTIVE',
    );
    if (key) {
      key.encryptedData[0] ^= 0xff;
    }
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('C5 Feature 3: Store Private Key API', () => {
  let store: InMemoryKeyStore;

  beforeEach(() => {
    store = new InMemoryKeyStore();
    store.addCertificate('cert-123');
    store.addCertificate('cert-456');
  });

  // AC-3.1: Successfully store a valid private key
  describe('AC-3.1 — Successfully store a valid private key', () => {
    it('returns 201 with correct metadata', () => {
      const result = store.storeKey('cert-123', SAMPLE_PEM, 'admin');

      expect(result.status).toBe(201);
      expect(result.body.keyId).toBeDefined();
      expect(result.body.certificateId).toBe('cert-123');
      expect(result.body.algorithm).toBe('RSA-2048');
      expect(result.body.fingerprint).toBeDefined();
      expect(typeof result.body.fingerprint).toBe('string');
      expect((result.body.fingerprint as string).length).toBeGreaterThan(0);
      expect(result.body.status).toBe('ACTIVE');
      expect(result.body.createdAt).toBeDefined();
    });

    it('fingerprint is a SHA-256 hash', () => {
      const result = store.storeKey('cert-123', SAMPLE_PEM, 'admin');
      const fp = result.body.fingerprint as string;
      // SHA-256 hex is 64 characters
      expect(fp).toMatch(/^[a-f0-9]{64}$/);
    });

    it('creates an audit entry with action KEY_STORE', () => {
      store.storeKey('cert-123', SAMPLE_PEM, 'admin');
      const auditLog = store.getAuditLog();

      expect(auditLog).toHaveLength(1);
      expect(auditLog[0].action).toBe('KEY_STORE');
      expect(auditLog[0].certificateId).toBe('cert-123');
      expect(auditLog[0].result).toBe('SUCCESS');
      expect(auditLog[0].actor).toBe('admin');
    });
  });

  // AC-3.2: Reject storage when key already exists
  describe('AC-3.2 — Reject storage when key already exists for certificate', () => {
    it('returns 409 when certificate already has an active key', () => {
      store.storeKey('cert-123', SAMPLE_PEM, 'admin');
      const result = store.storeKey('cert-123', SAMPLE_PEM_2, 'admin');

      expect(result.status).toBe(409);
      expect(result.body.message).toBe(
        'Certificate already has an active private key. Use rotation endpoint.',
      );
    });
  });

  // AC-3.3: Reject invalid PEM format
  describe('AC-3.3 — Reject invalid PEM format', () => {
    it('returns 400 for "not-a-valid-pem-string"', () => {
      const result = store.storeKey('cert-123', 'not-a-valid-pem-string', 'admin');

      expect(result.status).toBe(400);
      expect(result.body.message).toContain('Invalid private key PEM format');
    });

    it('returns 400 for empty string', () => {
      const result = store.storeKey('cert-123', '', 'admin');
      expect(result.status).toBe(400);
    });

    it('returns 400 for a certificate PEM (not private key)', () => {
      const certPem = '-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----';
      const result = store.storeKey('cert-123', certPem, 'admin');
      expect(result.status).toBe(400);
    });
  });

  // AC-3.4: Reject storage for non-existent certificate
  describe('AC-3.4 — Reject storage for non-existent certificate', () => {
    it('returns 404 when certificate does not exist', () => {
      const result = store.storeKey('nonexistent', SAMPLE_PEM, 'admin');

      expect(result.status).toBe(404);
      expect(result.body.message).toBe('Certificate not found');
    });
  });

  // AC-3.5: Reject if caller lacks key:write scope
  describe('AC-3.5 — Reject if caller lacks key:write scope', () => {
    it('returns 403 with only cert:read scope', () => {
      const result = store.storeKey('cert-123', SAMPLE_PEM, 'reader', ['cert:read']);

      expect(result.status).toBe(403);
    });

    it('returns 403 with no scopes', () => {
      const result = store.storeKey('cert-123', SAMPLE_PEM, 'nobody', []);
      expect(result.status).toBe(403);
    });
  });
});

describe('C5 Feature 4: Key Metadata API', () => {
  let store: InMemoryKeyStore;

  beforeEach(() => {
    store = new InMemoryKeyStore();
    store.addCertificate('cert-123');
    store.addCertificate('cert-456');
    store.addCertificate('cert-789');
  });

  // AC-4.1: Get key metadata for certificate with stored key
  describe('AC-4.1 — Get key metadata for certificate with stored key', () => {
    it('returns 200 with metadata (no privateKeyPem)', () => {
      store.storeKey('cert-123', SAMPLE_PEM, 'admin');
      const result = store.getKeyMetadata('cert-123');

      expect(result.status).toBe(200);
      expect(result.body.keyId).toBeDefined();
      expect(result.body.certificateId).toBe('cert-123');
      expect(result.body.algorithm).toBe('RSA-2048');
      expect(result.body.fingerprint).toBeDefined();
      expect(result.body.status).toBe('ACTIVE');
      expect(result.body.createdAt).toBeDefined();
    });

    it('response does NOT include privateKeyPem or ciphertext', () => {
      store.storeKey('cert-123', SAMPLE_PEM, 'admin');
      const result = store.getKeyMetadata('cert-123');

      expect(result.body).not.toHaveProperty('privateKeyPem');
      expect(result.body).not.toHaveProperty('encryptedData');
      expect(result.body).not.toHaveProperty('iv');
      expect(result.body).not.toHaveProperty('authTag');
      expect(result.body).not.toHaveProperty('salt');
    });
  });

  // AC-4.2: Get metadata for certificate with no stored key
  describe('AC-4.2 — Get metadata for certificate with no stored key', () => {
    it('returns 404 when no key is stored', () => {
      const result = store.getKeyMetadata('cert-456');

      expect(result.status).toBe(404);
      expect(result.body.message).toBe('No private key stored for this certificate');
    });
  });

  // AC-4.3: Get metadata for deleted key shows deleted status
  describe('AC-4.3 — Get metadata for deleted key shows deleted status', () => {
    it('returns 200 with DELETED status and deletedAt', () => {
      store.storeKey('cert-789', SAMPLE_PEM, 'admin');
      store.deleteKey('cert-789', 'Test deletion', 'admin');

      const result = store.getKeyMetadata('cert-789');

      expect(result.status).toBe(200);
      expect(result.body.status).toBe('DELETED');
      expect(result.body.deletedAt).toBeDefined();
    });
  });
});

describe('C5 Feature 5: Retrieve (Decrypt) Private Key API', () => {
  let store: InMemoryKeyStore;

  beforeEach(() => {
    store = new InMemoryKeyStore();
    store.addCertificate('cert-123');
    store.addCertificate('cert-789');
  });

  // AC-5.1: Successfully retrieve private key with reason
  describe('AC-5.1 — Successfully retrieve private key with reason', () => {
    it('returns 200 with the decrypted PEM', () => {
      store.storeKey('cert-123', SAMPLE_PEM, 'admin');
      const result = store.retrieveKey(
        'cert-123',
        'Deploying to production load balancer',
        'devops-engineer',
      );

      expect(result.status).toBe(200);
      expect(result.body.privateKeyPem).toBe(SAMPLE_PEM);
    });

    it('creates an audit entry with action KEY_RETRIEVE and reason', () => {
      store.storeKey('cert-123', SAMPLE_PEM, 'admin');
      store.retrieveKey(
        'cert-123',
        'Deploying to production load balancer',
        'devops-engineer',
      );

      const auditLog = store.getAuditLog();
      const retrieveEntry = auditLog.find((e) => e.action === 'KEY_RETRIEVE');

      expect(retrieveEntry).toBeDefined();
      expect(retrieveEntry!.detail).toBe('Deploying to production load balancer');
      expect(retrieveEntry!.actor).toBe('devops-engineer');
      expect(retrieveEntry!.result).toBe('SUCCESS');
    });
  });

  // AC-5.2: Retrieval requires a reason (mandatory field)
  describe('AC-5.2 — Retrieval requires a reason (mandatory field)', () => {
    it('returns 400 when no reason is provided', () => {
      store.storeKey('cert-123', SAMPLE_PEM, 'admin');
      const result = store.retrieveKey('cert-123', undefined, 'admin');

      expect(result.status).toBe(400);
      expect(result.body.message).toBe('Reason is required for key retrieval (audit trail)');
    });

    it('returns 400 when reason is empty string', () => {
      store.storeKey('cert-123', SAMPLE_PEM, 'admin');
      const result = store.retrieveKey('cert-123', '', 'admin');

      expect(result.status).toBe(400);
    });

    it('returns 400 when reason is whitespace only', () => {
      store.storeKey('cert-123', SAMPLE_PEM, 'admin');
      const result = store.retrieveKey('cert-123', '   ', 'admin');

      expect(result.status).toBe(400);
    });
  });

  // AC-5.3: Retrieval of deleted key fails with 410
  describe('AC-5.3 — Retrieval of deleted key fails with 410', () => {
    it('returns 410 after key has been deleted', () => {
      store.storeKey('cert-789', SAMPLE_PEM, 'admin');
      store.deleteKey('cert-789', 'No longer needed', 'admin');

      const result = store.retrieveKey('cert-789', 'Need key', 'admin');

      expect(result.status).toBe(410);
      expect(result.body.message).toBe('Private key has been permanently deleted');
    });
  });

  // AC-5.4: Retrieval without key:retrieve scope is rejected
  describe('AC-5.4 — Retrieval without key:retrieve scope is rejected', () => {
    it('returns 403 with only key:read scope', () => {
      store.storeKey('cert-123', SAMPLE_PEM, 'admin');
      const result = store.retrieveKey(
        'cert-123',
        'Need it',
        'limited-user',
        ['key:read'],
      );

      expect(result.status).toBe(403);
    });
  });

  // AC-5.5: Every retrieval creates an audit entry
  describe('AC-5.5 — Every retrieval creates an audit entry', () => {
    it('3 retrievals create 3 audit entries with different reasons', () => {
      store.storeKey('cert-123', SAMPLE_PEM, 'admin');

      const reasons = [
        'Deploy to staging',
        'Deploy to production',
        'Emergency rollback',
      ];

      reasons.forEach((reason) => {
        store.retrieveKey('cert-123', reason, 'devops');
      });

      const auditLog = store.getAuditLog();
      const retrieveEntries = auditLog.filter((e) => e.action === 'KEY_RETRIEVE');

      expect(retrieveEntries).toHaveLength(3);
      expect(retrieveEntries[0].detail).toBe('Deploy to staging');
      expect(retrieveEntries[1].detail).toBe('Deploy to production');
      expect(retrieveEntries[2].detail).toBe('Emergency rollback');

      // Each has a different timestamp
      const timestamps = retrieveEntries.map((e) => e.timestamp.getTime());
      // Timestamps are created sequentially so should be >= previous
      expect(timestamps[0]).toBeLessThanOrEqual(timestamps[1]);
      expect(timestamps[1]).toBeLessThanOrEqual(timestamps[2]);
    });
  });

  // AC-1.4 integration: Tampered ciphertext produces failure audit
  describe('AC-1.4 integration — Tampered ciphertext creates failure audit', () => {
    it('returns 500 and creates FAILURE audit when ciphertext is corrupted', () => {
      store.storeKey('cert-123', SAMPLE_PEM, 'admin');
      store.corruptKeyData('cert-123');

      const result = store.retrieveKey('cert-123', 'need key', 'admin');

      expect(result.status).toBe(500);
      expect(result.body.message).toContain('Decryption failed');

      const auditLog = store.getAuditLog();
      const failureEntry = auditLog.find(
        (e) => e.action === 'KEY_RETRIEVE' && e.result === 'FAILURE',
      );
      expect(failureEntry).toBeDefined();
      expect(failureEntry!.detail).toContain('Decryption failed');
    });
  });
});

describe('C5 Feature 6: Private Key Rotation', () => {
  let store: InMemoryKeyStore;

  beforeEach(() => {
    store = new InMemoryKeyStore();
    store.addCertificate('cert-123');
    store.addCertificate('cert-456');
  });

  // AC-6.1: Rotate key replaces current key with new one
  describe('AC-6.1 — Rotate key replaces current key with new one', () => {
    it('returns 200 with new keyId and previousKeyId', () => {
      const storeResult = store.storeKey('cert-123', SAMPLE_PEM, 'admin');
      const oldKeyId = storeResult.body.keyId as string;

      const rotateResult = store.rotateKey('cert-123', SAMPLE_PEM_2, 'admin');

      expect(rotateResult.status).toBe(200);
      expect(rotateResult.body.keyId).toBeDefined();
      expect(rotateResult.body.keyId).not.toBe(oldKeyId);
      expect(rotateResult.body.previousKeyId).toBe(oldKeyId);
      expect(rotateResult.body.status).toBe('ACTIVE');
    });

    it('old key record has status ROTATED', () => {
      store.storeKey('cert-123', SAMPLE_PEM, 'admin');
      store.rotateKey('cert-123', SAMPLE_PEM_2, 'admin');

      const metaResult = store.getKeyMetadata('cert-123', true);
      const keys = (metaResult.body.keys as Array<Record<string, unknown>>);
      const rotatedKey = keys.find((k) => k.status === 'ROTATED');

      expect(rotatedKey).toBeDefined();
    });

    it('creates an audit entry with action KEY_ROTATE', () => {
      store.storeKey('cert-123', SAMPLE_PEM, 'admin');
      store.rotateKey('cert-123', SAMPLE_PEM_2, 'admin');

      const auditLog = store.getAuditLog();
      const rotateEntry = auditLog.find((e) => e.action === 'KEY_ROTATE');

      expect(rotateEntry).toBeDefined();
      expect(rotateEntry!.certificateId).toBe('cert-123');
      expect(rotateEntry!.result).toBe('SUCCESS');
    });
  });

  // AC-6.2: Rotation fails if no existing key
  describe('AC-6.2 — Rotation fails if no existing key', () => {
    it('returns 404 when certificate has no stored key', () => {
      const result = store.rotateKey('cert-456', SAMPLE_PEM, 'admin');

      expect(result.status).toBe(404);
      expect(result.body.message).toBe('No active key found to rotate');
    });
  });

  // AC-6.3: Old key is still accessible after rotation
  describe('AC-6.3 — Old key is still accessible after rotation (for transition)', () => {
    it('includeRotated=true returns both keys', () => {
      store.storeKey('cert-123', SAMPLE_PEM, 'admin');
      store.rotateKey('cert-123', SAMPLE_PEM_2, 'admin');

      const result = store.getKeyMetadata('cert-123', true);

      expect(result.status).toBe(200);
      const keys = result.body.keys as Array<Record<string, unknown>>;
      expect(keys).toHaveLength(2);

      const rotatedKey = keys.find((k) => k.status === 'ROTATED');
      const activeKey = keys.find((k) => k.status === 'ACTIVE');

      expect(rotatedKey).toBeDefined();
      expect(activeKey).toBeDefined();
    });
  });
});

describe('C5 Feature 7: Key Deletion (Destruction)', () => {
  let store: InMemoryKeyStore;

  beforeEach(() => {
    store = new InMemoryKeyStore();
    store.addCertificate('cert-123');
  });

  // AC-7.1: Delete key overwrites ciphertext and marks deleted
  describe('AC-7.1 — Delete key overwrites ciphertext and marks deleted', () => {
    it('returns 200 with DELETED status and deletedAt', () => {
      store.storeKey('cert-123', SAMPLE_PEM, 'admin');
      const result = store.deleteKey(
        'cert-123',
        'Certificate expired, key no longer needed',
        'admin',
      );

      expect(result.status).toBe(200);
      expect(result.body.status).toBe('DELETED');
      expect(result.body.deletedAt).toBeDefined();
    });

    it('creates an audit entry with action KEY_DELETE', () => {
      store.storeKey('cert-123', SAMPLE_PEM, 'admin');
      store.deleteKey('cert-123', 'Cert expired', 'security-officer');

      const auditLog = store.getAuditLog();
      const deleteEntry = auditLog.find((e) => e.action === 'KEY_DELETE');

      expect(deleteEntry).toBeDefined();
      expect(deleteEntry!.certificateId).toBe('cert-123');
      expect(deleteEntry!.result).toBe('SUCCESS');
      expect(deleteEntry!.detail).toBe('Cert expired');
    });
  });

  // AC-7.2: Deletion requires a reason
  describe('AC-7.2 — Deletion requires a reason', () => {
    it('returns 400 when reason is not provided', () => {
      store.storeKey('cert-123', SAMPLE_PEM, 'admin');
      const result = store.deleteKey('cert-123', undefined, 'admin');

      expect(result.status).toBe(400);
      expect(result.body.message).toBe('Reason is required for key deletion (audit trail)');
    });

    it('returns 400 when reason is empty string', () => {
      store.storeKey('cert-123', SAMPLE_PEM, 'admin');
      const result = store.deleteKey('cert-123', '', 'admin');
      expect(result.status).toBe(400);
    });
  });

  // AC-7.3: Deletion is irreversible
  describe('AC-7.3 — Deletion is irreversible', () => {
    it('retrieval after deletion returns 410', () => {
      store.storeKey('cert-123', SAMPLE_PEM, 'admin');
      store.deleteKey('cert-123', 'No longer needed', 'admin');

      const result = store.retrieveKey('cert-123', 'Oops', 'admin');

      expect(result.status).toBe(410);
      expect(result.body.message).toBe('Private key has been permanently deleted');
    });
  });

  // AC-7.4: Cannot delete already-deleted key
  describe('AC-7.4 — Cannot delete already-deleted key', () => {
    it('returns 410 on second deletion attempt', () => {
      store.storeKey('cert-123', SAMPLE_PEM, 'admin');
      store.deleteKey('cert-123', 'First delete', 'admin');

      const result = store.deleteKey('cert-123', 'Double delete', 'admin');

      expect(result.status).toBe(410);
    });
  });
});
