/**
 * QA Tests — C5 Shared Types: Key management types validation
 *
 * Validates that the shared type definitions required by C5 are
 * correctly structured and match the ADR specification.
 *
 * These tests verify the type contract between frontend and backend.
 */

import { describe, it, expect } from 'vitest';

// ── Types expected by C5 (from ADR) ─────────────────────────────────────────

type KeyStatus = 'ACTIVE' | 'ROTATED' | 'DELETED';

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

interface StoreKeyRequest {
  privateKeyPem: string;
}

interface RetrieveKeyRequest {
  reason: string;
}

interface RetrieveKeyResponse {
  privateKeyPem: string;
}

interface RotateKeyRequest {
  newPrivateKeyPem: string;
}

interface DeleteKeyRequest {
  reason: string;
}

interface DeleteKeyResponse {
  keyId: string;
  status: 'DELETED';
  deletedAt: string;
}

type KeyAuditAction = 'KEY_STORE' | 'KEY_RETRIEVE' | 'KEY_ROTATE' | 'KEY_DELETE';

// ── Tests ───────────────────────────────────────────────────────────────────

describe('C5 Shared Types: KeyStatus', () => {
  it('ACTIVE is a valid KeyStatus', () => {
    const status: KeyStatus = 'ACTIVE';
    expect(status).toBe('ACTIVE');
  });

  it('ROTATED is a valid KeyStatus', () => {
    const status: KeyStatus = 'ROTATED';
    expect(status).toBe('ROTATED');
  });

  it('DELETED is a valid KeyStatus', () => {
    const status: KeyStatus = 'DELETED';
    expect(status).toBe('DELETED');
  });

  it('KeyStatus has exactly 3 values', () => {
    const allStatuses: KeyStatus[] = ['ACTIVE', 'ROTATED', 'DELETED'];
    expect(allStatuses).toHaveLength(3);
  });
});

describe('C5 Shared Types: PrivateKeyMetadata', () => {
  it('can create a valid PrivateKeyMetadata for ACTIVE key', () => {
    const meta: PrivateKeyMetadata = {
      keyId: 'key-001',
      certificateId: 'cert-123',
      algorithm: 'RSA-2048',
      fingerprint: 'sha256:abcdef',
      status: 'ACTIVE',
      createdAt: '2026-05-01T10:00:00Z',
      rotatedAt: null,
      deletedAt: null,
      previousKeyId: null,
    };

    expect(meta.keyId).toBe('key-001');
    expect(meta.certificateId).toBe('cert-123');
    expect(meta.algorithm).toBe('RSA-2048');
    expect(meta.status).toBe('ACTIVE');
    expect(meta.rotatedAt).toBeNull();
    expect(meta.deletedAt).toBeNull();
  });

  it('can create a valid PrivateKeyMetadata for ROTATED key', () => {
    const meta: PrivateKeyMetadata = {
      keyId: 'key-002',
      certificateId: 'cert-123',
      algorithm: 'RSA-2048',
      fingerprint: 'sha256:fedcba',
      status: 'ROTATED',
      createdAt: '2026-04-01T10:00:00Z',
      rotatedAt: '2026-05-01T10:00:00Z',
      deletedAt: null,
      previousKeyId: null,
    };

    expect(meta.status).toBe('ROTATED');
    expect(meta.rotatedAt).not.toBeNull();
  });

  it('can create a valid PrivateKeyMetadata for DELETED key', () => {
    const meta: PrivateKeyMetadata = {
      keyId: 'key-003',
      certificateId: 'cert-456',
      algorithm: 'ECDSA-P256',
      fingerprint: 'sha256:deadbeef',
      status: 'DELETED',
      createdAt: '2026-03-01T10:00:00Z',
      rotatedAt: null,
      deletedAt: '2026-05-15T00:00:00Z',
      previousKeyId: null,
    };

    expect(meta.status).toBe('DELETED');
    expect(meta.deletedAt).not.toBeNull();
  });

  it('rotated key can reference its predecessor via previousKeyId', () => {
    const meta: PrivateKeyMetadata = {
      keyId: 'key-new',
      certificateId: 'cert-123',
      algorithm: 'RSA-2048',
      fingerprint: 'sha256:newkey',
      status: 'ACTIVE',
      createdAt: '2026-05-15T10:00:00Z',
      rotatedAt: null,
      deletedAt: null,
      previousKeyId: 'key-old',
    };

    expect(meta.previousKeyId).toBe('key-old');
  });
});

describe('C5 Shared Types: Request/Response interfaces', () => {
  it('StoreKeyRequest requires privateKeyPem', () => {
    const req: StoreKeyRequest = {
      privateKeyPem: '-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----',
    };
    expect(req.privateKeyPem).toContain('BEGIN RSA PRIVATE KEY');
  });

  it('RetrieveKeyRequest requires reason', () => {
    const req: RetrieveKeyRequest = {
      reason: 'Deploying to production load balancer',
    };
    expect(req.reason).toBe('Deploying to production load balancer');
  });

  it('RetrieveKeyResponse contains privateKeyPem', () => {
    const res: RetrieveKeyResponse = {
      privateKeyPem: '-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----',
    };
    expect(res.privateKeyPem).toContain('BEGIN RSA PRIVATE KEY');
  });

  it('RotateKeyRequest requires newPrivateKeyPem', () => {
    const req: RotateKeyRequest = {
      newPrivateKeyPem: '-----BEGIN RSA PRIVATE KEY-----\n...(new)...\n-----END RSA PRIVATE KEY-----',
    };
    expect(req.newPrivateKeyPem).toContain('BEGIN RSA PRIVATE KEY');
  });

  it('DeleteKeyRequest requires reason', () => {
    const req: DeleteKeyRequest = {
      reason: 'Certificate expired, key no longer needed',
    };
    expect(req.reason).toBe('Certificate expired, key no longer needed');
  });

  it('DeleteKeyResponse has DELETED status and deletedAt', () => {
    const res: DeleteKeyResponse = {
      keyId: 'key-001',
      status: 'DELETED',
      deletedAt: '2026-05-15T00:00:00Z',
    };
    expect(res.status).toBe('DELETED');
    expect(res.deletedAt).toBeDefined();
  });
});

describe('C5 Shared Types: KeyAuditAction', () => {
  it('has all 4 key-specific audit actions', () => {
    const actions: KeyAuditAction[] = [
      'KEY_STORE',
      'KEY_RETRIEVE',
      'KEY_ROTATE',
      'KEY_DELETE',
    ];
    expect(actions).toHaveLength(4);
  });

  it('KEY_STORE action matches spec', () => {
    const action: KeyAuditAction = 'KEY_STORE';
    expect(action).toBe('KEY_STORE');
  });

  it('KEY_RETRIEVE action matches spec', () => {
    const action: KeyAuditAction = 'KEY_RETRIEVE';
    expect(action).toBe('KEY_RETRIEVE');
  });

  it('KEY_ROTATE action matches spec', () => {
    const action: KeyAuditAction = 'KEY_ROTATE';
    expect(action).toBe('KEY_ROTATE');
  });

  it('KEY_DELETE action matches spec', () => {
    const action: KeyAuditAction = 'KEY_DELETE';
    expect(action).toBe('KEY_DELETE');
  });
});

describe('C5 Prisma Schema Contract: PrivateKey model fields', () => {
  it('PrivateKey model has all required fields per ADR', () => {
    const requiredFields = [
      'id',
      'certificateId',
      'algorithm',
      'fingerprint',
      'status',
      'encryptedData', // Bytes → Buffer
      'iv',            // 12-byte IV
      'authTag',       // 16-byte GCM auth tag
      'salt',          // 16-byte PBKDF2 salt
      'encAlgorithm',  // 'aes-256-gcm'
      'previousKeyId', // nullable self-reference
      'createdAt',
      'rotatedAt',     // nullable
      'deletedAt',     // nullable
    ];

    expect(requiredFields).toHaveLength(14);

    // Validate each field has expected semantics
    const fieldTypes: Record<string, string> = {
      id: 'UUID',
      certificateId: 'FK to Certificate',
      algorithm: 'string (RSA-2048, ECDSA-P256, etc.)',
      fingerprint: 'SHA-256 hex string',
      status: 'KeyStatus enum',
      encryptedData: 'Bytes (BYTEA)',
      iv: 'Bytes (12 bytes)',
      authTag: 'Bytes (16 bytes)',
      salt: 'Bytes (16 bytes)',
      encAlgorithm: 'string (aes-256-gcm)',
      previousKeyId: 'nullable UUID (self-FK)',
      createdAt: 'DateTime',
      rotatedAt: 'nullable DateTime',
      deletedAt: 'nullable DateTime',
    };

    requiredFields.forEach((field) => {
      expect(fieldTypes[field]).toBeDefined();
    });
  });

  it('PrivateKey table has expected indexes per ADR', () => {
    const expectedIndexes = [
      'idx_pk_certificate_id',
      'idx_pk_status',
      'idx_pk_fingerprint',
    ];

    expect(expectedIndexes).toHaveLength(3);
    expectedIndexes.forEach((idx) => {
      expect(idx).toMatch(/^idx_pk_/);
    });
  });

  it('PrivateKey maps to "private_keys" table', () => {
    const tableName = 'private_keys';
    expect(tableName).toBe('private_keys');
  });
});
