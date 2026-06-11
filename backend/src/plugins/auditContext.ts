/**
 * Plugin Fastify — Contexto de Auditoria (C6)
 *
 * Decora cada request com `auditContext`, contendo:
 * - requestId: UUID v4 gerado no onRequest hook
 * - ipAddress: IP do cliente (request.ip)
 * - userAgent: cabeçalho User-Agent
 * - userId, userEmail, userRole: extraídos de headers JWT decodificado
 *   ou de headers X-User-* temporários (fase de integração)
 *
 * Esses dados são consumidos pelo AuditEventService para preencher
 * automaticamente os campos de contexto de cada evento de auditoria.
 */

import { randomUUID } from 'node:crypto';
import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Tipos ──────────────────────────────────────────────────────────────────

/** Contexto de auditoria anexado a cada request */
export interface AuditContext {
  /** UUID v4 único para esta requisição */
  requestId: string;

  /** Endereço IP do cliente (IPv4 ou IPv6) */
  ipAddress: string;

  /** User-Agent do cliente HTTP */
  userAgent: string;

  /** ID do usuário/serviço autenticado (vazio se anônimo) */
  userId: string;

  /** Email do usuário autenticado (vazio se indisponível) */
  userEmail: string;

  /** Role/papel do usuário autenticado (vazio se indisponível) */
  userRole: string;

  /** Timestamp de início da requisição (para cálculo de duração) */
  startedAt: number;
}

// ─── Extensão do tipo Fastify ───────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyRequest {
    auditContext?: AuditContext;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extrai um valor de header como string simples.
 * Lida com headers que podem ser string | string[] | undefined.
 */
function extractHeader(request: FastifyRequest, name: string): string {
  const value = request.headers[name];
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

/**
 * Extrai informações do usuário dos headers da requisição.
 *
 * Ordem de precedência:
 * 1. Headers X-User-* (injetados por API gateway ou middleware de auth)
 * 2. Payload do token de serviço (request.tokenAuth, do plugin auth.ts)
 *
 * Em produção com JWT, a extração será feita do token decodificado.
 * Os headers X-User-* servem como fallback durante a fase de integração.
 */
function extractUserInfo(request: FastifyRequest): {
  userId: string;
  userEmail: string;
  userRole: string;
} {
  // 1) Headers X-User-* (gateway / integração)
  const headerUserId = extractHeader(request, 'x-user-id');
  const headerUserEmail = extractHeader(request, 'x-user-email');
  const headerUserRole = extractHeader(request, 'x-user-role');

  if (headerUserId) {
    return {
      userId: headerUserId,
      userEmail: headerUserEmail,
      userRole: headerUserRole,
    };
  }

  // 2) Token de serviço autenticado (plugin auth.ts)
  const tokenAuth = request.tokenAuth;
  if (tokenAuth) {
    return {
      userId: tokenAuth.id,
      userEmail: '', // Tokens de serviço não possuem email
      userRole: tokenAuth.scopes.includes('admin') ? 'admin' : 'service',
    };
  }

  // 3) Anônimo / não autenticado
  return {
    userId: 'anonymous',
    userEmail: '',
    userRole: '',
  };
}

// ─── Plugin ─────────────────────────────────────────────────────────────────

async function auditContextPlugin(server: FastifyInstance): Promise<void> {
  // Decora request com valor padrão (Fastify exige para type-safety)
  server.decorateRequest('auditContext', undefined);

  // Hook onRequest — preenche o contexto de auditoria
  server.addHook('onRequest', async (request: FastifyRequest) => {
    const userInfo = extractUserInfo(request);

    request.auditContext = {
      requestId: randomUUID(),
      ipAddress: request.ip,
      userAgent: extractHeader(request, 'user-agent'),
      userId: userInfo.userId,
      userEmail: userInfo.userEmail,
      userRole: userInfo.userRole,
      startedAt: Date.now(),
    };
  });
}

// Exporta encapsulado com fastify-plugin para compartilhar decorators
export default fp(auditContextPlugin, {
  name: 'auditContext',
  fastify: '5.x',
});
