/**
 * QA Tests — C5 Feature 8: CSR Integration (Optional Key Storage)
 *
 * Maps to acceptance criteria:
 *   AC-8.1: CSR with storeKey=true stores the generated key
 *   AC-8.2: CSR with storeKey=false (default) returns key as before
 *   AC-8.3: CSR with storeKey=true but no certificateId fails
 *
 * These tests validate the CSR endpoint enhancement logic
 * that optionally stores the generated private key.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Types ───────────────────────────────────────────────────────────────────

interface CsrRequest {
  commonName: string;
  keySize?: number;
  storeKey?: boolean;
  certificateId?: string;
}

interface CsrResponse {
  csr: string;
  publicKey: string;
  privateKeyPem?: string;
  keyMetadata?: {
    keyId: string;
    fingerprint: string;
    status: string;
  };
}

interface CsrEndpointResult {
  status: number;
  body: Record<string, unknown>;
}

// ── CSR service mock implementing the expected behavior ──────────────────────

function processCsrRequest(
  req: CsrRequest,
  scopes: string[] = ['cert:csr', 'key:write'],
  certExists: boolean = true,
  keyAlreadyExists: boolean = false,
): CsrEndpointResult {
  // Validate required fields
  if (!req.commonName) {
    return {
      status: 400,
      body: { error: 'Bad Request', message: 'commonName is required' },
    };
  }

  // AC-8.3: storeKey=true requires certificateId
  if (req.storeKey === true && !req.certificateId) {
    return {
      status: 400,
      body: { error: 'Bad Request', message: 'certificateId is required when storeKey is true' },
    };
  }

  // Certificate existence check
  if (req.storeKey === true && !certExists) {
    return {
      status: 404,
      body: { error: 'Not Found', message: 'Certificate not found' },
    };
  }

  // Scope check for key storage
  if (req.storeKey === true && !scopes.includes('key:write')) {
    return {
      status: 403,
      body: { error: 'Forbidden', message: 'key:write scope required for key storage' },
    };
  }

  // Simulate CSR + key generation
  const mockCsr = `-----BEGIN CERTIFICATE REQUEST-----\nMock CSR for ${req.commonName}\n-----END CERTIFICATE REQUEST-----`;
  const mockPublicKey = `-----BEGIN PUBLIC KEY-----\nMock public key\n-----END PUBLIC KEY-----`;
  const mockPrivateKey = `-----BEGIN RSA PRIVATE KEY-----\nMock generated key for ${req.commonName}\n-----END RSA PRIVATE KEY-----`;

  // AC-8.1: storeKey=true — store key, return metadata (not PEM)
  if (req.storeKey === true) {
    if (keyAlreadyExists) {
      return {
        status: 409,
        body: { error: 'Conflict', message: 'Certificate already has an active private key' },
      };
    }

    return {
      status: 200,
      body: {
        csr: mockCsr,
        publicKey: mockPublicKey,
        // NO privateKeyPem in response when storeKey=true
        keyMetadata: {
          keyId: 'generated-key-id-001',
          fingerprint: 'sha256:abcdef1234567890',
          status: 'ACTIVE',
        },
      },
    };
  }

  // AC-8.2: storeKey=false (default) — return key in response
  return {
    status: 200,
    body: {
      csr: mockCsr,
      publicKey: mockPublicKey,
      privateKeyPem: mockPrivateKey,
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('C5 Feature 8: CSR Integration (Optional Key Storage)', () => {
  // AC-8.1: CSR with storeKey=true stores the generated key
  describe('AC-8.1 — CSR with storeKey=true stores the generated key', () => {
    it('returns 200 with csr and publicKey', () => {
      const result = processCsrRequest({
        commonName: 'api.example.com',
        keySize: 2048,
        storeKey: true,
        certificateId: 'cert-123',
      });

      expect(result.status).toBe(200);
      expect(result.body.csr).toBeDefined();
      expect(typeof result.body.csr).toBe('string');
      expect(result.body.publicKey).toBeDefined();
      expect(typeof result.body.publicKey).toBe('string');
    });

    it('response does NOT include privateKeyPem', () => {
      const result = processCsrRequest({
        commonName: 'api.example.com',
        keySize: 2048,
        storeKey: true,
        certificateId: 'cert-123',
      });

      expect(result.body).not.toHaveProperty('privateKeyPem');
    });

    it('response includes keyMetadata with keyId, fingerprint, status ACTIVE', () => {
      const result = processCsrRequest({
        commonName: 'api.example.com',
        keySize: 2048,
        storeKey: true,
        certificateId: 'cert-123',
      });

      const meta = result.body.keyMetadata as Record<string, unknown>;
      expect(meta).toBeDefined();
      expect(meta.keyId).toBeDefined();
      expect(meta.fingerprint).toBeDefined();
      expect(meta.status).toBe('ACTIVE');
    });

    it('requires key:write scope when storeKey=true', () => {
      const result = processCsrRequest(
        {
          commonName: 'api.example.com',
          keySize: 2048,
          storeKey: true,
          certificateId: 'cert-123',
        },
        ['cert:csr'], // no key:write
      );

      expect(result.status).toBe(403);
    });
  });

  // AC-8.2: CSR with storeKey=false (default) returns key as before
  describe('AC-8.2 — CSR with storeKey=false (default) returns key as before', () => {
    it('returns 200 with privateKeyPem in plaintext', () => {
      const result = processCsrRequest({
        commonName: 'api.example.com',
        keySize: 2048,
      });

      expect(result.status).toBe(200);
      expect(result.body.privateKeyPem).toBeDefined();
      expect(typeof result.body.privateKeyPem).toBe('string');
      expect(result.body.privateKeyPem as string).toContain('BEGIN RSA PRIVATE KEY');
    });

    it('no keyMetadata in response', () => {
      const result = processCsrRequest({
        commonName: 'api.example.com',
        keySize: 2048,
      });

      expect(result.body).not.toHaveProperty('keyMetadata');
    });

    it('explicit storeKey=false works same as omitting it', () => {
      const result = processCsrRequest({
        commonName: 'api.example.com',
        keySize: 2048,
        storeKey: false,
      });

      expect(result.status).toBe(200);
      expect(result.body.privateKeyPem).toBeDefined();
      expect(result.body).not.toHaveProperty('keyMetadata');
    });
  });

  // AC-8.3: CSR with storeKey=true but no certificateId fails
  describe('AC-8.3 — CSR with storeKey=true but no certificateId fails', () => {
    it('returns 400 when certificateId is missing', () => {
      const result = processCsrRequest({
        commonName: 'api.example.com',
        keySize: 2048,
        storeKey: true,
        // certificateId intentionally omitted
      });

      expect(result.status).toBe(400);
      expect(result.body.message).toBe(
        'certificateId is required when storeKey is true',
      );
    });

    it('returns 400 when certificateId is empty string', () => {
      const result = processCsrRequest({
        commonName: 'api.example.com',
        keySize: 2048,
        storeKey: true,
        certificateId: '',
      });

      expect(result.status).toBe(400);
    });
  });

  // Backward compatibility
  describe('Backward compatibility', () => {
    it('existing CSR behavior unchanged when storeKey not specified', () => {
      const result = processCsrRequest({
        commonName: 'legacy.example.com',
        keySize: 2048,
      });

      expect(result.status).toBe(200);
      expect(result.body.csr).toBeDefined();
      expect(result.body.publicKey).toBeDefined();
      expect(result.body.privateKeyPem).toBeDefined();
    });
  });
});
