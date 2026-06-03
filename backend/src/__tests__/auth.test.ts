import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';

// ─── Mock Prisma client ────────────────────────────────────────────────────

const { mockFindUnique, mockUpdate } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock('../prismaClient.js', () => ({
  default: {
    serviceToken: {
      findUnique: mockFindUnique,
      update: mockUpdate,
    },
  },
}));

// ─── Mock config with AUTH_SKIP_UI default ─────────────────────────────────

const { mockConfig } = vi.hoisted(() => ({
  mockConfig: {
    CORS_ORIGIN: 'http://localhost:5173',
    AUTH_SKIP_UI: true,
    NODE_ENV: 'test' as const,
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    PORT: 3000,
    HOST: '0.0.0.0',
    ENCRYPTION_KEY: '0'.repeat(64),
    SMTP_HOST: '',
    SMTP_PORT: 587,
    SMTP_USER: '',
    SMTP_PASSWORD: '',
    SMTP_FROM_ADDRESS: '',
    SMTP_FROM_NAME: '',
    EXPIRATION_SCHEDULER_ENABLED: false,
    EXPIRATION_SCHEDULER_CRON: '0 2 * * *',
    WEBHOOK_TIMEOUT_MS: 10_000,
    WEBHOOK_MAX_RETRIES: 3,
  },
}));

vi.mock('../config.js', () => ({ config: mockConfig }));

import authPlugin from '../plugins/auth.js';

// ─── Test helpers ──────────────────────────────────────────────────────────

const RAW_TOKEN = 'st_test-valid-token-value-0123456789abcdef';
const TOKEN_HASH = createHash('sha256').update(RAW_TOKEN).digest('hex');
const NOW = new Date();
const FUTURE = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
const PAST = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);

function makeDbToken(overrides: Record<string, unknown> = {}) {
  return {
    id: 'token-uuid-1',
    name: 'CI Pipeline Token',
    tokenHash: TOKEN_HASH,
    tokenPreview: 'st_tes...cdef',
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

/**
 * Build a minimal Fastify server with the auth plugin and a test route.
 */
async function buildTestServer(
  routeOptions: { requiredScope?: string } = {},
): Promise<FastifyInstance> {
  const server = Fastify();
  await server.register(authPlugin);

  // Protected test route
  server.get(
    '/api/test',
    {
      config: routeOptions.requiredScope
        ? { requiredScope: routeOptions.requiredScope }
        : {},
    },
    async (request) => {
      return {
        ok: true,
        tokenAuth: request.tokenAuth ?? null,
      };
    },
  );

  // Public test routes
  server.get('/health', async () => ({ status: 'ok' }));
  server.get('/api/docs/openapi.json', async () => ({ spec: {} }));

  await server.ready();
  return server;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Auth Plugin', () => {
  let server: FastifyInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset AUTH_SKIP_UI to default true
    mockConfig.AUTH_SKIP_UI = true;
  });

  afterEach(async () => {
    if (server) await server.close();
  });

  // ── Public Routes ──────────────────────────────────────────────────────

  describe('public routes', () => {
    it('should allow /health without auth', async () => {
      server = await buildTestServer();
      const res = await server.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
    });

    it('should allow /api/docs without auth', async () => {
      server = await buildTestServer();
      const res = await server.inject({ method: 'GET', url: '/api/docs/openapi.json' });
      expect(res.statusCode).toBe(200);
    });
  });

  // ── Missing Authorization header ───────────────────────────────────────

  describe('missing Authorization header', () => {
    it('should return 401 when AUTH_SKIP_UI=false and no header', async () => {
      mockConfig.AUTH_SKIP_UI = false;
      server = await buildTestServer();

      const res = await server.inject({ method: 'GET', url: '/api/test' });
      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.payload);
      expect(body.message).toBe('Missing Authorization header');
    });

    it('should pass through when AUTH_SKIP_UI=true and no header', async () => {
      mockConfig.AUTH_SKIP_UI = true;
      server = await buildTestServer();

      const res = await server.inject({ method: 'GET', url: '/api/test' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.ok).toBe(true);
      expect(body.tokenAuth).toBeNull();
    });
  });

  // ── Invalid Authorization header format ────────────────────────────────

  describe('invalid Authorization header format', () => {
    it('should return 401 for Basic auth scheme', async () => {
      server = await buildTestServer();

      const res = await server.inject({
        method: 'GET',
        url: '/api/test',
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.payload);
      expect(body.message).toContain('Invalid Authorization header format');
    });

    it('should return 401 for Bearer with no token', async () => {
      server = await buildTestServer();

      const res = await server.inject({
        method: 'GET',
        url: '/api/test',
        headers: { authorization: 'Bearer ' },
      });

      expect(res.statusCode).toBe(401);
    });

    it('should return 401 for malformed header with extra parts', async () => {
      server = await buildTestServer();

      const res = await server.inject({
        method: 'GET',
        url: '/api/test',
        headers: { authorization: 'Bearer token extra' },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ── Invalid / unknown token ────────────────────────────────────────────

  describe('invalid token', () => {
    it('should return 401 when token hash not found in DB', async () => {
      mockFindUnique.mockResolvedValue(null);
      server = await buildTestServer();

      const res = await server.inject({
        method: 'GET',
        url: '/api/test',
        headers: { authorization: 'Bearer st_unknown-token-value' },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.payload);
      expect(body.message).toBe('Invalid token');
    });
  });

  // ── Revoked token ─────────────────────────────────────────────────────

  describe('revoked token', () => {
    it('should return 401 when token is revoked', async () => {
      mockFindUnique.mockResolvedValue(
        makeDbToken({ revokedAt: PAST, revocationReason: 'Compromised' }),
      );
      server = await buildTestServer();

      const res = await server.inject({
        method: 'GET',
        url: '/api/test',
        headers: { authorization: `Bearer ${RAW_TOKEN}` },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.payload);
      expect(body.message).toBe('Token has been revoked');
    });
  });

  // ── Expired token ─────────────────────────────────────────────────────

  describe('expired token', () => {
    it('should return 401 when token has expired', async () => {
      mockFindUnique.mockResolvedValue(
        makeDbToken({ expiresAt: PAST }),
      );
      server = await buildTestServer();

      const res = await server.inject({
        method: 'GET',
        url: '/api/test',
        headers: { authorization: `Bearer ${RAW_TOKEN}` },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.payload);
      expect(body.message).toBe('Token has expired');
    });
  });

  // ── Valid token (no scope required) ────────────────────────────────────

  describe('valid token without required scope', () => {
    it('should pass and decorate request.tokenAuth', async () => {
      mockFindUnique.mockResolvedValue(makeDbToken());
      mockUpdate.mockResolvedValue(makeDbToken());
      server = await buildTestServer();

      const res = await server.inject({
        method: 'GET',
        url: '/api/test',
        headers: { authorization: `Bearer ${RAW_TOKEN}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.ok).toBe(true);
      expect(body.tokenAuth).toEqual({
        id: 'token-uuid-1',
        name: 'CI Pipeline Token',
        scopes: ['certificates:read', 'certificates:write'],
      });
    });

    it('should accept token with null expiresAt (never expires)', async () => {
      mockFindUnique.mockResolvedValue(makeDbToken({ expiresAt: null }));
      mockUpdate.mockResolvedValue(makeDbToken());
      server = await buildTestServer();

      const res = await server.inject({
        method: 'GET',
        url: '/api/test',
        headers: { authorization: `Bearer ${RAW_TOKEN}` },
      });

      expect(res.statusCode).toBe(200);
    });

    it('should fire-and-forget updateLastUsed', async () => {
      mockFindUnique.mockResolvedValue(makeDbToken());
      mockUpdate.mockResolvedValue(makeDbToken());
      server = await buildTestServer();

      await server.inject({
        method: 'GET',
        url: '/api/test',
        headers: { authorization: `Bearer ${RAW_TOKEN}` },
      });

      // Give the fire-and-forget a tick to resolve
      await new Promise((r) => setTimeout(r, 10));
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'token-uuid-1' },
        data: expect.objectContaining({ lastUsedAt: expect.any(Date) }),
      });
    });

    it('should not fail if updateLastUsed throws', async () => {
      mockFindUnique.mockResolvedValue(makeDbToken());
      mockUpdate.mockRejectedValue(new Error('DB write error'));
      server = await buildTestServer();

      const res = await server.inject({
        method: 'GET',
        url: '/api/test',
        headers: { authorization: `Bearer ${RAW_TOKEN}` },
      });

      // Should still succeed — updateLastUsed is fire-and-forget
      expect(res.statusCode).toBe(200);
    });
  });

  // ── Scope enforcement ─────────────────────────────────────────────────

  describe('scope enforcement', () => {
    it('should allow when token has the required scope', async () => {
      mockFindUnique.mockResolvedValue(
        makeDbToken({ scopes: ['certificates:read', 'certificates:write'] }),
      );
      mockUpdate.mockResolvedValue(makeDbToken());
      server = await buildTestServer({ requiredScope: 'certificates:read' });

      const res = await server.inject({
        method: 'GET',
        url: '/api/test',
        headers: { authorization: `Bearer ${RAW_TOKEN}` },
      });

      expect(res.statusCode).toBe(200);
    });

    it('should return 403 when token lacks the required scope', async () => {
      mockFindUnique.mockResolvedValue(
        makeDbToken({ scopes: ['certificates:read'] }),
      );
      server = await buildTestServer({ requiredScope: 'certificates:write' });

      const res = await server.inject({
        method: 'GET',
        url: '/api/test',
        headers: { authorization: `Bearer ${RAW_TOKEN}` },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.payload);
      expect(body.message).toContain('Insufficient scope');
      expect(body.message).toContain('certificates:write');
    });

    it('should allow admin scope to access any route', async () => {
      mockFindUnique.mockResolvedValue(
        makeDbToken({ scopes: ['admin'] }),
      );
      mockUpdate.mockResolvedValue(makeDbToken());
      server = await buildTestServer({ requiredScope: 'certificates:delete' });

      const res = await server.inject({
        method: 'GET',
        url: '/api/test',
        headers: { authorization: `Bearer ${RAW_TOKEN}` },
      });

      expect(res.statusCode).toBe(200);
    });

    it('should allow token with multiple scopes to access matching endpoint', async () => {
      mockFindUnique.mockResolvedValue(
        makeDbToken({
          scopes: ['certificates:read', 'audit:read', 'policies:read'],
        }),
      );
      mockUpdate.mockResolvedValue(makeDbToken());

      // Test each scope
      for (const scope of ['certificates:read', 'audit:read', 'policies:read']) {
        const srv = await buildTestServer({ requiredScope: scope });
        const res = await srv.inject({
          method: 'GET',
          url: '/api/test',
          headers: { authorization: `Bearer ${RAW_TOKEN}` },
        });
        expect(res.statusCode).toBe(200);
        await srv.close();
      }
    });
  });

  // ── UI Compatibility mode ─────────────────────────────────────────────

  describe('UI compatibility mode (AUTH_SKIP_UI)', () => {
    it('should skip auth for requests with matching Origin header when AUTH_SKIP_UI=true', async () => {
      mockConfig.AUTH_SKIP_UI = true;
      server = await buildTestServer({ requiredScope: 'certificates:read' });

      const res = await server.inject({
        method: 'GET',
        url: '/api/test',
        headers: { origin: 'http://localhost:5173' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.tokenAuth).toBeNull();
    });

    it('should require auth when AUTH_SKIP_UI=false even for UI origin', async () => {
      mockConfig.AUTH_SKIP_UI = false;
      server = await buildTestServer({ requiredScope: 'certificates:read' });

      const res = await server.inject({
        method: 'GET',
        url: '/api/test',
        headers: { origin: 'http://localhost:5173' },
      });

      expect(res.statusCode).toBe(401);
    });

    it('should still validate token when Authorization header is present with AUTH_SKIP_UI=true', async () => {
      mockConfig.AUTH_SKIP_UI = true;
      mockFindUnique.mockResolvedValue(null);
      server = await buildTestServer({ requiredScope: 'certificates:read' });

      const res = await server.inject({
        method: 'GET',
        url: '/api/test',
        headers: {
          origin: 'http://localhost:5173',
          authorization: 'Bearer st_invalid-token',
        },
      });

      // Even with UI skip, if Authorization IS provided it should be validated
      expect(res.statusCode).toBe(401);
    });
  });
});
