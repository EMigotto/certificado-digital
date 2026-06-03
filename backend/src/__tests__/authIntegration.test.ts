/**
 * Auth integration tests — verifies that auth middleware is correctly
 * wired up to actual route handlers and that scope enforcement works
 * end-to-end on representative API endpoints.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';

// ─── Mock setup ────────────────────────────────────────────────────────────

const { mockFindUnique, mockUpdate, mockFindMany, mockCount, mockTransaction } =
  vi.hoisted(() => ({
    mockFindUnique: vi.fn(),
    mockUpdate: vi.fn(),
    mockFindMany: vi.fn(),
    mockCount: vi.fn(),
    mockTransaction: vi.fn(),
  }));

vi.mock('../prismaClient.js', () => ({
  default: {
    serviceToken: {
      findUnique: mockFindUnique,
      create: vi.fn(),
      findMany: mockFindMany,
      count: mockCount,
      update: mockUpdate,
    },
    certificate: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    auditEntry: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    $transaction: mockTransaction,
  },
}));

vi.mock('../config.js', () => ({
  config: {
    CORS_ORIGIN: 'http://localhost:5173',
    AUTH_SKIP_UI: false, // Disable UI bypass for integration tests
    NODE_ENV: 'test',
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

import authPlugin from '../plugins/auth.js';
import { auditRoutes } from '../routes/audit.js';

// ─── Test helpers ──────────────────────────────────────────────────────────

const RAW_TOKEN = 'st_integration-test-token-0123456789abcdef';
const TOKEN_HASH = createHash('sha256').update(RAW_TOKEN).digest('hex');
const NOW = new Date();
const FUTURE = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
const PAST = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);

function makeDbToken(overrides: Record<string, unknown> = {}) {
  return {
    id: 'integration-token-1',
    name: 'Integration Test Token',
    tokenHash: TOKEN_HASH,
    tokenPreview: 'st_int...cdef',
    scopes: ['audit:read'],
    createdAt: NOW,
    expiresAt: FUTURE,
    revokedAt: null,
    revocationReason: null,
    lastUsedAt: null,
    createdBy: 'admin',
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Auth Integration — wired-up routes', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();

    server = Fastify();
    await server.register(authPlugin);
    await server.register(auditRoutes);
    await server.ready();
  });

  afterEach(async () => {
    if (server) await server.close();
  });

  // ── F2: Request with valid token succeeds ──────────────────────────────

  it('should return 200 for GET /api/audit with valid token and audit:read scope', async () => {
    mockFindUnique.mockResolvedValue(makeDbToken({ scopes: ['audit:read'] }));
    mockUpdate.mockResolvedValue(makeDbToken());
    mockTransaction.mockResolvedValue([[], 0]);

    const res = await server.inject({
      method: 'GET',
      url: '/api/audit',
      headers: { authorization: `Bearer ${RAW_TOKEN}` },
    });

    expect(res.statusCode).toBe(200);
  });

  // ── F2: Request with expired token is rejected ─────────────────────────

  it('should return 401 for GET /api/audit with expired token', async () => {
    mockFindUnique.mockResolvedValue(makeDbToken({ expiresAt: PAST }));

    const res = await server.inject({
      method: 'GET',
      url: '/api/audit',
      headers: { authorization: `Bearer ${RAW_TOKEN}` },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.message).toBe('Token has expired');
  });

  // ── F2: Request with invalid token signature is rejected ───────────────

  it('should return 401 for GET /api/audit with unknown token', async () => {
    mockFindUnique.mockResolvedValue(null);

    const res = await server.inject({
      method: 'GET',
      url: '/api/audit',
      headers: { authorization: 'Bearer st_completely-invalid-token' },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.message).toBe('Invalid token');
  });

  // ── F2: Request without Authorization header is rejected ───────────────

  it('should return 401 for GET /api/audit without Authorization header', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/audit',
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.message).toBe('Missing Authorization header');
  });

  // ── F2: Endpoint with required scope rejects insufficient scope ────────

  it('should return 403 for GET /api/audit when token has wrong scope', async () => {
    mockFindUnique.mockResolvedValue(
      makeDbToken({ scopes: ['certificates:read'] }), // Wrong scope
    );

    const res = await server.inject({
      method: 'GET',
      url: '/api/audit',
      headers: { authorization: `Bearer ${RAW_TOKEN}` },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.message).toContain('Insufficient scope');
    expect(body.message).toContain('audit:read');
  });

  // ── F2: Token with multiple scopes grants access ───────────────────────

  it('should allow access with multi-scope token to matching endpoint', async () => {
    mockFindUnique.mockResolvedValue(
      makeDbToken({ scopes: ['audit:read', 'certificates:read', 'policies:read'] }),
    );
    mockUpdate.mockResolvedValue(makeDbToken());
    mockTransaction.mockResolvedValue([[], 0]);

    const res = await server.inject({
      method: 'GET',
      url: '/api/audit',
      headers: { authorization: `Bearer ${RAW_TOKEN}` },
    });

    expect(res.statusCode).toBe(200);
  });

  // ── F2: Admin scope overrides any required scope ───────────────────────

  it('should allow admin-scoped token on any endpoint', async () => {
    mockFindUnique.mockResolvedValue(makeDbToken({ scopes: ['admin'] }));
    mockUpdate.mockResolvedValue(makeDbToken());
    mockTransaction.mockResolvedValue([[], 0]);

    const res = await server.inject({
      method: 'GET',
      url: '/api/audit',
      headers: { authorization: `Bearer ${RAW_TOKEN}` },
    });

    expect(res.statusCode).toBe(200);
  });

  // ── F2: Revoked token is rejected ──────────────────────────────────────

  it('should return 401 for revoked token', async () => {
    mockFindUnique.mockResolvedValue(
      makeDbToken({ revokedAt: PAST, revocationReason: 'Compromised' }),
    );

    const res = await server.inject({
      method: 'GET',
      url: '/api/audit',
      headers: { authorization: `Bearer ${RAW_TOKEN}` },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.message).toBe('Token has been revoked');
  });
});
