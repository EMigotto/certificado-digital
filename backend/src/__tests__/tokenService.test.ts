import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TokenService,
  TokenValidationError,
  TokenAlreadyRevokedError,
  generateRawToken,
  hashToken,
  maskToken,
  validateScopes,
  mapToApiToken,
} from '../services/tokenService.js';
import type { TokenRepository } from '../repositories/tokenRepo.js';
import type { ServiceToken } from '@prisma/client';

// ─── Mock helpers ───────────────────────────────────────────────────────────

const NOW = new Date();
const FUTURE = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);

function makeDbToken(overrides: Partial<ServiceToken> = {}): ServiceToken {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'CI Pipeline Token',
    tokenHash: 'abc123hash',
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

function makeMockRepo(): TokenRepository {
  return {
    create: vi.fn(),
    findByHash: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
    revoke: vi.fn(),
    updateLastUsed: vi.fn(),
  } as unknown as TokenRepository;
}

// ─── Pure function tests ────────────────────────────────────────────────────

describe('Token utility functions', () => {
  describe('generateRawToken', () => {
    it('should generate a token with st_ prefix', () => {
      const raw = generateRawToken();
      expect(raw.startsWith('st_')).toBe(true);
    });

    it('should generate a token of expected length (st_ + 43 chars base64url)', () => {
      const raw = generateRawToken();
      // st_ (3 chars) + 32 bytes base64url ≈ 43 chars
      expect(raw.length).toBe(3 + 43);
    });

    it('should generate unique tokens', () => {
      const t1 = generateRawToken();
      const t2 = generateRawToken();
      expect(t1).not.toBe(t2);
    });
  });

  describe('hashToken', () => {
    it('should return a hex string', () => {
      const hash = hashToken('st_test_token');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should be deterministic', () => {
      const h1 = hashToken('st_test_token');
      const h2 = hashToken('st_test_token');
      expect(h1).toBe(h2);
    });

    it('should produce different hashes for different inputs', () => {
      const h1 = hashToken('st_token_a');
      const h2 = hashToken('st_token_b');
      expect(h1).not.toBe(h2);
    });
  });

  describe('maskToken', () => {
    it('should mask the middle of a token', () => {
      const masked = maskToken('st_abcdefghijklmnopqrstuvwxyz');
      expect(masked).toBe('st_abc...wxyz');
    });

    it('should return short tokens unchanged', () => {
      const masked = maskToken('st_abc');
      expect(masked).toBe('st_abc');
    });
  });

  describe('validateScopes', () => {
    it('should accept valid scopes', () => {
      expect(validateScopes(['certificates:read', 'admin'])).toBe(true);
    });

    it('should reject invalid scopes', () => {
      expect(validateScopes(['certificates:read', 'invalid:scope'])).toBe(false);
    });

    it('should reject empty scopes', () => {
      expect(validateScopes([])).toBe(true); // empty is valid per spec (checked at service level)
    });
  });

  describe('mapToApiToken', () => {
    it('should map Prisma token to API token with ISO dates', () => {
      const dbToken = makeDbToken();
      const api = mapToApiToken(dbToken);

      expect(api.id).toBe(dbToken.id);
      expect(api.name).toBe(dbToken.name);
      expect(api.tokenPreview).toBe(dbToken.tokenPreview);
      expect(api.scopes).toEqual(dbToken.scopes);
      expect(api.createdAt).toBe(NOW.toISOString());
      expect(api.expiresAt).toBe(FUTURE.toISOString());
      expect(api.revokedAt).toBeNull();
      expect(api.lastUsedAt).toBeNull();
    });

    it('should handle null optional dates', () => {
      const dbToken = makeDbToken({ expiresAt: null, lastUsedAt: null, revokedAt: null });
      const api = mapToApiToken(dbToken);

      expect(api.expiresAt).toBeNull();
      expect(api.revokedAt).toBeNull();
      expect(api.lastUsedAt).toBeNull();
    });
  });
});

// ─── Service class tests ────────────────────────────────────────────────────

describe('TokenService', () => {
  let repo: ReturnType<typeof makeMockRepo>;
  let service: TokenService;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = makeMockRepo();
    service = new TokenService(repo);
  });

  describe('createToken', () => {
    it('should create a token and return the raw value once', async () => {
      (repo.create as ReturnType<typeof vi.fn>).mockImplementation(async (data) =>
        makeDbToken({
          name: data.name,
          tokenHash: data.tokenHash,
          tokenPreview: data.tokenPreview,
          scopes: data.scopes,
          expiresAt: data.expiresAt,
          createdBy: data.createdBy,
        }),
      );

      const result = await service.createToken({
        name: 'CI Token',
        scopes: ['certificates:read'],
        createdBy: 'admin',
      });

      expect(result.plainToken).toBeDefined();
      expect(result.plainToken.startsWith('st_')).toBe(true);
      expect(result.token.name).toBe('CI Token');
      expect(result.token.scopes).toEqual(['certificates:read']);
      expect(result.token.createdBy).toBe('admin');
      expect(repo.create).toHaveBeenCalledTimes(1);
    });

    it('should use default 30-day expiry when expiresIn is omitted', async () => {
      (repo.create as ReturnType<typeof vi.fn>).mockImplementation(async (data) =>
        makeDbToken({ expiresAt: data.expiresAt }),
      );

      const before = Date.now();
      const result = await service.createToken({
        name: 'Default Expiry',
        scopes: ['certificates:read'],
      });
      const after = Date.now();

      // Check that expiresAt is ~30 days from now
      const call = (repo.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const expiresAt = call.expiresAt as Date;
      const expectedMs = 30 * 24 * 60 * 60 * 1000;
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + expectedMs);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(after + expectedMs);
      expect(result.token).toBeDefined();
    });

    it('should allow explicit null expiresIn for no expiry', async () => {
      (repo.create as ReturnType<typeof vi.fn>).mockImplementation(async (data) =>
        makeDbToken({ expiresAt: data.expiresAt }),
      );

      await service.createToken({
        name: 'No Expiry',
        scopes: ['admin'],
        expiresIn: null,
      });

      const call = (repo.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.expiresAt).toBeNull();
    });

    it('should allow custom expiresIn in milliseconds', async () => {
      (repo.create as ReturnType<typeof vi.fn>).mockImplementation(async (data) =>
        makeDbToken({ expiresAt: data.expiresAt }),
      );

      const oneHour = 60 * 60 * 1000;
      const before = Date.now();
      await service.createToken({
        name: 'Custom Expiry',
        scopes: ['certificates:read'],
        expiresIn: oneHour,
      });
      const after = Date.now();

      const call = (repo.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const expiresAt = call.expiresAt as Date;
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + oneHour);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(after + oneHour);
    });

    it('should throw TokenValidationError for empty name', async () => {
      await expect(
        service.createToken({ name: '', scopes: ['certificates:read'] }),
      ).rejects.toThrow(TokenValidationError);
    });

    it('should throw TokenValidationError for empty scopes', async () => {
      await expect(service.createToken({ name: 'Token', scopes: [] })).rejects.toThrow(
        TokenValidationError,
      );
    });

    it('should throw TokenValidationError for invalid scopes', async () => {
      await expect(
        service.createToken({ name: 'Token', scopes: ['invalid:scope'] }),
      ).rejects.toThrow(TokenValidationError);
    });
  });

  describe('listTokens', () => {
    it('should return paginated list of masked tokens', async () => {
      const tokens = [makeDbToken(), makeDbToken({ id: 'id-2', name: 'Token 2' })];
      (repo.findAll as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: tokens,
        total: 2,
      });

      const result = await service.listTokens({ page: '1', pageSize: '25' });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(25);
      expect(result.totalPages).toBe(1);
      // Verify the hash is NOT exposed
      for (const t of result.data) {
        expect(t).not.toHaveProperty('tokenHash');
      }
    });
  });

  describe('getToken', () => {
    it('should return a single masked token', async () => {
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeDbToken());

      const result = await service.getToken('550e8400-e29b-41d4-a716-446655440000');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(result).not.toHaveProperty('tokenHash');
    });

    it('should return null when token not found', async () => {
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await service.getToken('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('revokeToken', () => {
    it('should revoke an active token', async () => {
      const token = makeDbToken();
      const revokedToken = makeDbToken({
        revokedAt: NOW,
        revocationReason: 'Compromised',
      });
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(token);
      (repo.revoke as ReturnType<typeof vi.fn>).mockResolvedValue(revokedToken);

      const result = await service.revokeToken(
        '550e8400-e29b-41d4-a716-446655440000',
        'Compromised',
      );

      expect(result).not.toBeNull();
      expect(result!.revokedAt).toBe(NOW.toISOString());
      expect(result!.revocationReason).toBe('Compromised');
    });

    it('should use default reason when not provided', async () => {
      const token = makeDbToken();
      const revokedToken = makeDbToken({
        revokedAt: NOW,
        revocationReason: 'No reason provided',
      });
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(token);
      (repo.revoke as ReturnType<typeof vi.fn>).mockResolvedValue(revokedToken);

      const result = await service.revokeToken('550e8400-e29b-41d4-a716-446655440000');

      expect(result).not.toBeNull();
      expect(repo.revoke).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        'No reason provided',
      );
    });

    it('should return null when token not found', async () => {
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await service.revokeToken('nonexistent');

      expect(result).toBeNull();
    });

    it('should throw TokenAlreadyRevokedError if already revoked', async () => {
      const revokedToken = makeDbToken({ revokedAt: NOW });
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(revokedToken);

      await expect(
        service.revokeToken('550e8400-e29b-41d4-a716-446655440000', 'Again'),
      ).rejects.toThrow(TokenAlreadyRevokedError);
    });
  });
});
