import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// ─── Mock Prisma client with vi.hoisted to avoid reference-before-init ──────

const {
  mockCreate,
  mockFindUnique,
  mockFindMany,
  mockCount,
  mockUpdate,
  mockTransaction,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFindUnique: vi.fn(),
  mockFindMany: vi.fn(),
  mockCount: vi.fn(),
  mockUpdate: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock('../prismaClient.js', () => ({
  default: {
    serviceToken: {
      create: mockCreate,
      findUnique: mockFindUnique,
      findMany: mockFindMany,
      count: mockCount,
      update: mockUpdate,
    },
    $transaction: mockTransaction,
  },
}));

import { tokenRoutes } from '../routes/tokens.js';

// ─── Test helpers ───────────────────────────────────────────────────────────

const NOW = new Date();
const FUTURE = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);

function makeDbToken(overrides: Record<string, unknown> = {}) {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'CI Pipeline Token',
    tokenHash: 'a'.repeat(64),
    tokenPreview: 'st_abc...wxyz',
    scopes: ['certificates:read', 'certificates:write'],
    createdAt: NOW,
    expiresAt: FUTURE,
    revokedAt: null,
    revocationReason: null,
    lastUsedAt: null,
    createdBy: 'admin',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Token Routes', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = Fastify();
    await server.register(tokenRoutes);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  // ── POST /api/tokens ──────────────────────────────────────────────────────

  describe('POST /api/tokens', () => {
    it('should create a token and return raw value with 201', async () => {
      mockCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => {
        return makeDbToken({
          name: args.data.name,
          tokenHash: args.data.tokenHash,
          tokenPreview: args.data.tokenPreview,
          scopes: args.data.scopes,
          expiresAt: args.data.expiresAt,
          createdBy: args.data.createdBy,
        });
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/tokens',
        payload: {
          name: 'CI Pipeline Token',
          scopes: ['certificates:read', 'certificates:write'],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.plainToken).toBeDefined();
      expect(body.plainToken).toMatch(/^st_/);
      expect(body.token).toBeDefined();
      expect(body.token.name).toBe('CI Pipeline Token');
      expect(body.token.scopes).toEqual(['certificates:read', 'certificates:write']);
      // Token hash should NOT be in the response
      expect(body.token).not.toHaveProperty('tokenHash');
    });

    it('should apply default 30-day expiry', async () => {
      mockCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => {
        return makeDbToken({
          expiresAt: args.data.expiresAt,
        });
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/tokens',
        payload: {
          name: 'Default Expiry Token',
          scopes: ['certificates:read'],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.token.expiresAt).toBeDefined();
    });

    it('should return 400 for missing name', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/tokens',
        payload: {
          scopes: ['certificates:read'],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for missing scopes', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/tokens',
        payload: {
          name: 'Token without scopes',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for empty scopes array', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/tokens',
        payload: {
          name: 'Empty Scopes',
          scopes: [],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid scopes', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/tokens',
        payload: {
          name: 'Bad Scope Token',
          scopes: ['invalid:scope'],
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ── GET /api/tokens ───────────────────────────────────────────────────────

  describe('GET /api/tokens', () => {
    it('should return paginated list of masked tokens', async () => {
      const tokens = [makeDbToken(), makeDbToken({ id: 'id-2', name: 'Token 2' })];
      mockTransaction.mockResolvedValue([tokens, 2]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/tokens',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(25);
      expect(body.totalPages).toBe(1);
      // Ensure tokenHash is NOT exposed
      for (const t of body.data) {
        expect(t).not.toHaveProperty('tokenHash');
      }
    });

    it('should accept pagination params', async () => {
      mockTransaction.mockResolvedValue([[], 0]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/tokens?page=2&pageSize=10',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.page).toBe(2);
      expect(body.pageSize).toBe(10);
    });
  });

  // ── GET /api/tokens/:id ───────────────────────────────────────────────────

  describe('GET /api/tokens/:id', () => {
    it('should return token detail (masked)', async () => {
      mockFindUnique.mockResolvedValue(makeDbToken());

      const response = await server.inject({
        method: 'GET',
        url: '/api/tokens/550e8400-e29b-41d4-a716-446655440000',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(body.name).toBe('CI Pipeline Token');
      expect(body.tokenPreview).toBe('st_abc...wxyz');
      expect(body).not.toHaveProperty('tokenHash');
    });

    it('should return 404 for non-existent token', async () => {
      mockFindUnique.mockResolvedValue(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/tokens/nonexistent-id',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('Not Found');
    });
  });

  // ── POST /api/tokens/:id/revoke ───────────────────────────────────────────

  describe('POST /api/tokens/:id/revoke', () => {
    it('should revoke an active token', async () => {
      const token = makeDbToken();
      const revokedToken = makeDbToken({
        revokedAt: NOW,
        revocationReason: 'Key compromised',
      });
      // First findById returns active, then revoke returns revoked
      mockFindUnique.mockResolvedValue(token);
      mockUpdate.mockResolvedValue(revokedToken);

      const response = await server.inject({
        method: 'POST',
        url: '/api/tokens/550e8400-e29b-41d4-a716-446655440000/revoke',
        payload: { reason: 'Key compromised' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.revokedAt).toBeDefined();
      expect(body.revocationReason).toBe('Key compromised');
    });

    it('should revoke with default reason when not provided', async () => {
      const token = makeDbToken();
      const revokedToken = makeDbToken({
        revokedAt: NOW,
        revocationReason: 'No reason provided',
      });
      mockFindUnique.mockResolvedValue(token);
      mockUpdate.mockResolvedValue(revokedToken);

      const response = await server.inject({
        method: 'POST',
        url: '/api/tokens/550e8400-e29b-41d4-a716-446655440000/revoke',
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.revocationReason).toBe('No reason provided');
    });

    it('should return 404 when token not found', async () => {
      mockFindUnique.mockResolvedValue(null);

      const response = await server.inject({
        method: 'POST',
        url: '/api/tokens/nonexistent-id/revoke',
        payload: { reason: 'test' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 409 when token is already revoked', async () => {
      const revokedToken = makeDbToken({ revokedAt: NOW });
      mockFindUnique.mockResolvedValue(revokedToken);

      const response = await server.inject({
        method: 'POST',
        url: '/api/tokens/550e8400-e29b-41d4-a716-446655440000/revoke',
        payload: { reason: 'Again' },
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('Conflict');
    });
  });
});
