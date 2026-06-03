import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TokenRepository } from '../repositories/tokenRepo.js';
import type { PrismaClient, ServiceToken } from '@prisma/client';

/**
 * Unit tests for TokenRepository.
 * These test the repository methods by mocking the PrismaClient.
 */

// ─── Mock helpers ───────────────────────────────────────────────────────────

const NOW = new Date();

function makeToken(overrides: Partial<ServiceToken> = {}): ServiceToken {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'CI Pipeline Token',
    tokenHash: 'abc123hash',
    tokenPreview: 'st_abc...wxyz',
    scopes: ['certificates:read', 'certificates:write'],
    createdAt: NOW,
    expiresAt: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    revocationReason: null,
    lastUsedAt: null,
    createdBy: 'admin',
    ...overrides,
  };
}

function makeMockPrisma() {
  return {
    serviceToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  } as unknown as PrismaClient;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('TokenRepository', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  let repo: TokenRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makeMockPrisma();
    repo = new TokenRepository(prisma);
  });

  describe('create', () => {
    it('should create a new token record', async () => {
      const token = makeToken();
      (prisma.serviceToken.create as ReturnType<typeof vi.fn>).mockResolvedValue(token);

      const data = {
        name: 'CI Pipeline Token',
        tokenHash: 'abc123hash',
        tokenPreview: 'st_abc...wxyz',
        scopes: ['certificates:read', 'certificates:write'],
        expiresAt: token.expiresAt,
        createdBy: 'admin',
      };

      const result = await repo.create(data);

      expect(result).toEqual(token);
      expect(prisma.serviceToken.create).toHaveBeenCalledWith({ data });
    });
  });

  describe('findByHash', () => {
    it('should find a token by its SHA-256 hash', async () => {
      const token = makeToken();
      (prisma.serviceToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(token);

      const result = await repo.findByHash('abc123hash');

      expect(result).toEqual(token);
      expect(prisma.serviceToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: 'abc123hash' },
      });
    });

    it('should return null when hash not found', async () => {
      (prisma.serviceToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await repo.findByHash('unknown-hash');

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return paginated list of tokens', async () => {
      const tokens = [makeToken(), makeToken({ id: 'token-2', name: 'Token 2' })];
      (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([tokens, 2]);

      const pagination = { page: 1, pageSize: 25, skip: 0, take: 25 };
      const result = await repo.findAll(pagination);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });
  });

  describe('findById', () => {
    it('should find a token by ID', async () => {
      const token = makeToken();
      (prisma.serviceToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(token);

      const result = await repo.findById('550e8400-e29b-41d4-a716-446655440000');

      expect(result).toEqual(token);
      expect(prisma.serviceToken.findUnique).toHaveBeenCalledWith({
        where: { id: '550e8400-e29b-41d4-a716-446655440000' },
      });
    });

    it('should return null when ID not found', async () => {
      (prisma.serviceToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await repo.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('revoke', () => {
    it('should update revokedAt and revocationReason', async () => {
      const revokedToken = makeToken({
        revokedAt: NOW,
        revocationReason: 'Compromised',
      });
      (prisma.serviceToken.update as ReturnType<typeof vi.fn>).mockResolvedValue(revokedToken);

      const result = await repo.revoke('550e8400-e29b-41d4-a716-446655440000', 'Compromised');

      expect(result.revokedAt).toBeDefined();
      expect(result.revocationReason).toBe('Compromised');
      expect(prisma.serviceToken.update).toHaveBeenCalledWith({
        where: { id: '550e8400-e29b-41d4-a716-446655440000' },
        data: expect.objectContaining({
          revocationReason: 'Compromised',
        }),
      });
    });
  });

  describe('updateLastUsed', () => {
    it('should update lastUsedAt timestamp', async () => {
      const token = makeToken({ lastUsedAt: NOW });
      (prisma.serviceToken.update as ReturnType<typeof vi.fn>).mockResolvedValue(token);

      const result = await repo.updateLastUsed('550e8400-e29b-41d4-a716-446655440000');

      expect(result.lastUsedAt).toBeDefined();
      expect(prisma.serviceToken.update).toHaveBeenCalledWith({
        where: { id: '550e8400-e29b-41d4-a716-446655440000' },
        data: expect.objectContaining({
          lastUsedAt: expect.any(Date),
        }),
      });
    });
  });
});
