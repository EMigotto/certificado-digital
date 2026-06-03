import type { PrismaClient, ServiceToken } from '@prisma/client';
import type { PaginationParams } from '../utils/pagination.js';

// ─── Repository class ────────────────────────────────────────────────────────

export class TokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Create a new service token record.
   * The caller is responsible for hashing the raw token before calling this.
   */
  async create(data: {
    name: string;
    tokenHash: string;
    tokenPreview: string;
    scopes: string[];
    expiresAt: Date | null;
    createdBy: string;
  }): Promise<ServiceToken> {
    return this.prisma.serviceToken.create({ data });
  }

  /**
   * Find a token by its SHA-256 hash (used during auth validation).
   */
  async findByHash(hash: string): Promise<ServiceToken | null> {
    return this.prisma.serviceToken.findUnique({
      where: { tokenHash: hash },
    });
  }

  /**
   * List all tokens with pagination, ordered by creation date descending.
   */
  async findAll(
    pagination: PaginationParams,
  ): Promise<{ data: ServiceToken[]; total: number }> {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.serviceToken.findMany({
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.serviceToken.count(),
    ]);

    return { data, total };
  }

  /**
   * Find a single token by ID.
   */
  async findById(id: string): Promise<ServiceToken | null> {
    return this.prisma.serviceToken.findUnique({ where: { id } });
  }

  /**
   * Revoke a token by setting revokedAt and revocationReason.
   */
  async revoke(id: string, reason: string): Promise<ServiceToken> {
    return this.prisma.serviceToken.update({
      where: { id },
      data: {
        revokedAt: new Date(),
        revocationReason: reason,
      },
    });
  }

  /**
   * Update the lastUsedAt timestamp for a token.
   */
  async updateLastUsed(id: string): Promise<ServiceToken> {
    return this.prisma.serviceToken.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  }
}
