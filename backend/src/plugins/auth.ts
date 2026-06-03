/**
 * Authentication plugin — validates Bearer tokens on protected routes
 * and enforces scope-based access control.
 *
 * Public routes (health, docs) skip auth entirely.
 *
 * UI compatibility mode (AUTH_SKIP_UI=true, default):
 *   Requests without an Authorization header from browser origins
 *   (matching CORS_ORIGIN) pass through without auth. This allows
 *   the existing UI to work until session auth is implemented.
 */

import { createHash } from 'node:crypto';
import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TokenRepository } from '../repositories/tokenRepo.js';
import prisma from '../prismaClient.js';
import { config } from '../config.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Metadata attached to `request.tokenAuth` on successful validation */
export interface TokenAuthPayload {
  /** Token UUID (from service_tokens.id) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Granted scopes */
  scopes: string[];
}

/** Extend Fastify route config with optional scope requirement */
declare module 'fastify' {
  interface FastifyContextConfig {
    requiredScope?: string;
  }
  interface FastifyRequest {
    tokenAuth?: TokenAuthPayload;
  }
}

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Routes that skip authentication entirely.
 * Matched by prefix — e.g. /api/docs/openapi.json is covered by /api/docs.
 */
const PUBLIC_ROUTE_PREFIXES = ['/health', '/api/docs'];

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Compute SHA-256 hex digest of a raw token string */
function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Check whether a URL path is public (no auth required) */
function isPublicRoute(url: string): boolean {
  // Strip query string for matching
  const path = url.split('?')[0];
  return PUBLIC_ROUTE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(prefix + '/'),
  );
}

/**
 * Check whether a request originates from the configured UI origin.
 * Uses the Origin or Referer header.
 */
function isFromUiOrigin(request: FastifyRequest): boolean {
  const corsOrigin = config.CORS_ORIGIN;
  if (!corsOrigin) return false;

  const origin = request.headers.origin;
  if (origin && origin === corsOrigin) return true;

  const referer = request.headers.referer;
  if (referer && referer.startsWith(corsOrigin)) return true;

  // If no Origin or Referer header, allow requests without Authorization
  // header to pass through when AUTH_SKIP_UI is true (typical browser
  // requests from same-page navigation don't always send Origin).
  return !request.headers.authorization;
}

// ─── Plugin ─────────────────────────────────────────────────────────────────

async function authPlugin(server: FastifyInstance): Promise<void> {
  const tokenRepo = new TokenRepository(prisma);

  // Decorate request with tokenAuth so it is always accessible
  server.decorateRequest('tokenAuth', undefined);

  server.addHook(
    'onRequest',
    async (request: FastifyRequest, reply: FastifyReply) => {
      // 1) Skip auth for public routes
      if (isPublicRoute(request.url)) return;

      const authHeader = request.headers.authorization;

      // 2) UI compatibility: skip auth for browser-originated requests
      //    without Authorization header when AUTH_SKIP_UI is enabled.
      if (!authHeader && config.AUTH_SKIP_UI) {
        if (isFromUiOrigin(request)) return;
      }

      // 3) Require Authorization header
      if (!authHeader) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Missing Authorization header',
        });
      }

      // 4) Extract Bearer token
      const parts = authHeader.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid Authorization header format. Expected: Bearer <token>',
        });
      }

      const rawToken = parts[1];

      // 5) Hash and look up
      const tokenHash = sha256(rawToken);
      const token = await tokenRepo.findByHash(tokenHash);

      if (!token) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid token',
        });
      }

      // 6) Check revocation
      if (token.revokedAt) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Token has been revoked',
        });
      }

      // 7) Check expiration
      if (token.expiresAt && token.expiresAt < new Date()) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Token has expired',
        });
      }

      // 8) Check route-level scope
      const routeConfig = request.routeOptions.config;
      const requiredScope = routeConfig?.requiredScope;

      if (requiredScope) {
        const hasScope =
          token.scopes.includes(requiredScope) || token.scopes.includes('admin');

        if (!hasScope) {
          return reply.status(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: `Insufficient scope. Required: ${requiredScope}`,
          });
        }
      }

      // 9) Decorate request with token metadata
      request.tokenAuth = {
        id: token.id,
        name: token.name,
        scopes: token.scopes,
      };

      // 10) Fire-and-forget: update last_used_at
      tokenRepo.updateLastUsed(token.id).catch(() => {
        // Intentionally silent — non-blocking side effect
      });
    },
  );
}

// Export wrapped with fastify-plugin so decorators are shared
export default fp(authPlugin, {
  name: 'auth',
  fastify: '5.x',
});
