import crypto from 'node:crypto';
import type { ServiceToken as PrismaServiceToken } from '@prisma/client';
import type {
  ServiceToken,
  ServiceTokenCreateResponse,
  TokenScope,
} from '@certificado-digital/shared';
import { TokenRepository } from '../repositories/tokenRepo.js';
import { parsePaginationParams, buildPaginatedResponse } from '../utils/pagination.js';
import type { PaginatedResponse } from '@certificado-digital/shared';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Token prefix for service tokens */
const TOKEN_PREFIX = 'st_';

/** Default expiry: 30 days in milliseconds */
const DEFAULT_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

/** Valid scopes for validation */
const VALID_SCOPES: ReadonlySet<string> = new Set<string>([
  'certificates:read',
  'certificates:write',
  'certificates:delete',
  'policies:read',
  'policies:write',
  'zones:read',
  'zones:write',
  'tokens:read',
  'tokens:write',
  'audit:read',
  'admin',
]);

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically secure raw token string.
 * Format: st_ + 32 bytes as base64url (43 chars).
 */
export function generateRawToken(): string {
  const bytes = crypto.randomBytes(32);
  return TOKEN_PREFIX + bytes.toString('base64url');
}

/**
 * Compute the SHA-256 hash of a raw token string.
 */
export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Create a masked preview of a raw token.
 * Shows first 6 and last 4 characters: st_abc...wxyz
 */
export function maskToken(rawToken: string): string {
  if (rawToken.length <= 10) return rawToken;
  return rawToken.slice(0, 6) + '...' + rawToken.slice(-4);
}

/**
 * Map a Prisma ServiceToken to the shared API ServiceToken type.
 * Dates become ISO-8601 strings; the token hash is never exposed.
 */
export function mapToApiToken(token: PrismaServiceToken): ServiceToken {
  return {
    id: token.id,
    name: token.name,
    tokenPreview: token.tokenPreview,
    scopes: token.scopes as TokenScope[],
    createdAt: token.createdAt.toISOString(),
    expiresAt: token.expiresAt?.toISOString() ?? null,
    revokedAt: token.revokedAt?.toISOString() ?? null,
    revocationReason: token.revocationReason,
    lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
    createdBy: token.createdBy,
  };
}

/**
 * Validate that all scopes are known values.
 */
export function validateScopes(scopes: string[]): scopes is TokenScope[] {
  return scopes.every((s) => VALID_SCOPES.has(s));
}

// ─── Service class ──────────────────────────────────────────────────────────

export interface CreateTokenParams {
  name: string;
  scopes: string[];
  expiresIn?: number | null; // milliseconds — null means use default 30 days
  createdBy?: string;
}

export interface ListTokensQuery {
  page?: string;
  pageSize?: string;
}

export class TokenService {
  constructor(private readonly repo: TokenRepository) {}

  /**
   * Create a new service token.
   *
   * 1. Generate a random raw token (st_ + 32 bytes base64url)
   * 2. Compute its SHA-256 hash
   * 3. Store the hash (never the raw value)
   * 4. Return the raw token exactly once in the response
   *
   * Default expiry is 30 days if expiresIn is not provided.
   */
  async createToken(params: CreateTokenParams): Promise<ServiceTokenCreateResponse> {
    const { name, scopes, createdBy = 'system' } = params;

    // Validate
    if (!name || name.trim().length === 0) {
      throw new TokenValidationError('Token name is required');
    }

    if (!scopes || scopes.length === 0) {
      throw new TokenValidationError('At least one scope is required');
    }

    if (!validateScopes(scopes)) {
      throw new TokenValidationError(
        `Invalid scope(s). Valid scopes: ${Array.from(VALID_SCOPES).join(', ')}`,
      );
    }

    // Generate token
    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const tokenPreview = maskToken(rawToken);

    // Compute expiry
    let expiresAt: Date | null;
    if (params.expiresIn === null) {
      // Explicitly no expiry
      expiresAt = null;
    } else if (params.expiresIn !== undefined && params.expiresIn > 0) {
      expiresAt = new Date(Date.now() + params.expiresIn);
    } else {
      // Default: 30 days
      expiresAt = new Date(Date.now() + DEFAULT_EXPIRY_MS);
    }

    const created = await this.repo.create({
      name: name.trim(),
      tokenHash,
      tokenPreview,
      scopes,
      expiresAt,
      createdBy,
    });

    return {
      token: mapToApiToken(created),
      plainToken: rawToken,
    };
  }

  /**
   * List tokens with pagination. Token hashes are never exposed.
   */
  async listTokens(
    query: ListTokensQuery,
  ): Promise<PaginatedResponse<ServiceToken>> {
    const pagination = parsePaginationParams({
      page: query.page,
      pageSize: query.pageSize,
    });

    const { data, total } = await this.repo.findAll(pagination);
    const mapped = data.map(mapToApiToken);
    return buildPaginatedResponse(mapped, total, pagination.page, pagination.pageSize);
  }

  /**
   * Get a single token by ID (masked, no hash exposed).
   */
  async getToken(id: string): Promise<ServiceToken | null> {
    const token = await this.repo.findById(id);
    if (!token) return null;
    return mapToApiToken(token);
  }

  /**
   * Revoke a token. Sets revokedAt and optional revocation reason.
   */
  async revokeToken(id: string, reason?: string): Promise<ServiceToken | null> {
    const existing = await this.repo.findById(id);
    if (!existing) return null;

    if (existing.revokedAt) {
      throw new TokenAlreadyRevokedError(id);
    }

    const revoked = await this.repo.revoke(id, reason ?? 'No reason provided');
    return mapToApiToken(revoked);
  }
}

// ─── Custom errors ──────────────────────────────────────────────────────────

export class TokenValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenValidationError';
  }
}

export class TokenAlreadyRevokedError extends Error {
  constructor(tokenId: string) {
    super(`Token ${tokenId} is already revoked`);
    this.name = 'TokenAlreadyRevokedError';
  }
}
