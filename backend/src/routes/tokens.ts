import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  TokenService,
  TokenValidationError,
  TokenAlreadyRevokedError,
  type ListTokensQuery,
} from '../services/tokenService.js';
import { TokenRepository } from '../repositories/tokenRepo.js';
import prisma from '../prismaClient.js';

// ─── Request body / param types ──────────────────────────────────────────────

interface CreateTokenBody {
  name: string;
  scopes: string[];
  expiresIn?: number | null;
}

interface RevokeTokenBody {
  reason?: string;
}

interface TokenIdParams {
  id: string;
}

// ─── JSON Schemas for OpenAPI / validation ────────────────────────────────────

const createTokenSchema = {
  body: {
    type: 'object' as const,
    required: ['name', 'scopes'],
    properties: {
      name: { type: 'string' as const, minLength: 1, description: 'Human-readable token name' },
      scopes: {
        type: 'array' as const,
        items: {
          type: 'string' as const,
          enum: [
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
          ],
        },
        minItems: 1,
        description: 'Permission scopes granted to the token',
      },
      expiresIn: {
        type: ['number', 'null'] as const,
        description:
          'Token TTL in milliseconds. Null = no expiry. Omit for default 30 days.',
      },
    },
    additionalProperties: false,
  },
};

const revokeTokenSchema = {
  body: {
    type: 'object' as const,
    properties: {
      reason: { type: 'string' as const, description: 'Reason for revocation' },
    },
    additionalProperties: false,
  },
};

const tokenIdParamSchema = {
  params: {
    type: 'object' as const,
    required: ['id'],
    properties: {
      id: { type: 'string' as const, description: 'Token UUID' },
    },
  },
};

const listTokensQuerySchema = {
  querystring: {
    type: 'object' as const,
    properties: {
      page: { type: 'string' as const },
      pageSize: { type: 'string' as const },
    },
    additionalProperties: false,
  },
};

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * Register service token CRUD routes under /api/tokens.
 */
export async function tokenRoutes(server: FastifyInstance): Promise<void> {
  const repo = new TokenRepository(prisma);
  const service = new TokenService(repo);

  // ── POST /api/tokens — Create a new service token ─────────────────────────

  server.post(
    '/api/tokens',
    { schema: createTokenSchema },
    async (
      request: FastifyRequest<{ Body: CreateTokenBody }>,
      reply: FastifyReply,
    ) => {
      try {
        const { name, scopes, expiresIn } = request.body;
        const result = await service.createToken({
          name,
          scopes,
          expiresIn: expiresIn,
          createdBy: 'admin', // placeholder — real auth in a later chunk
        });

        return reply.status(201).send(result);
      } catch (err) {
        if (err instanceof TokenValidationError) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: err.message,
          });
        }
        throw err;
      }
    },
  );

  // ── GET /api/tokens — List all tokens (masked) ───────────────────────────

  server.get(
    '/api/tokens',
    { schema: listTokensQuerySchema },
    async (
      request: FastifyRequest<{ Querystring: ListTokensQuery }>,
      reply: FastifyReply,
    ) => {
      const result = await service.listTokens(request.query);
      return reply.send(result);
    },
  );

  // ── GET /api/tokens/:id — Get token detail (masked) ──────────────────────

  server.get(
    '/api/tokens/:id',
    { schema: tokenIdParamSchema },
    async (
      request: FastifyRequest<{ Params: TokenIdParams }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const token = await service.getToken(id);

      if (!token) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Token with id "${id}" not found`,
        });
      }

      return reply.send(token);
    },
  );

  // ── POST /api/tokens/:id/revoke — Revoke a token ────────────────────────

  server.post(
    '/api/tokens/:id/revoke',
    { schema: { ...tokenIdParamSchema, ...revokeTokenSchema } },
    async (
      request: FastifyRequest<{ Params: TokenIdParams; Body: RevokeTokenBody }>,
      reply: FastifyReply,
    ) => {
      try {
        const { id } = request.params;
        const { reason } = request.body ?? {};
        const token = await service.revokeToken(id, reason);

        if (!token) {
          return reply.status(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: `Token with id "${id}" not found`,
          });
        }

        return reply.send(token);
      } catch (err) {
        if (err instanceof TokenAlreadyRevokedError) {
          return reply.status(409).send({
            statusCode: 409,
            error: 'Conflict',
            message: err.message,
          });
        }
        throw err;
      }
    },
  );
}
