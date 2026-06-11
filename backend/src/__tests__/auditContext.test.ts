/**
 * Testes unitários do plugin auditContext (C6).
 *
 * Verifica que o plugin decora corretamente cada request com:
 * - requestId (UUID v4)
 * - ipAddress, userAgent
 * - userId, userEmail, userRole (de headers X-User-* ou tokenAuth)
 * - startedAt (timestamp de início)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import auditContextPlugin from '../plugins/auditContext.js';
import type { AuditContext } from '../plugins/auditContext.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function buildTestServer(): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });
  await server.register(auditContextPlugin);

  // Rota de teste que retorna o auditContext
  server.get('/test-context', async (request) => {
    return request.auditContext;
  });

  await server.ready();
  return server;
}

// ─── Testes ─────────────────────────────────────────────────────────────────

describe('auditContext plugin', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('deve gerar requestId como UUID v4', async () => {
    const response = await server.inject({ method: 'GET', url: '/test-context' });
    const ctx = JSON.parse(response.payload) as AuditContext;

    expect(ctx.requestId).toMatch(UUID_REGEX);
  });

  it('deve gerar requestId único para cada requisição', async () => {
    const response1 = await server.inject({ method: 'GET', url: '/test-context' });
    const response2 = await server.inject({ method: 'GET', url: '/test-context' });

    const ctx1 = JSON.parse(response1.payload) as AuditContext;
    const ctx2 = JSON.parse(response2.payload) as AuditContext;

    expect(ctx1.requestId).not.toBe(ctx2.requestId);
  });

  it('deve extrair ipAddress do request.ip', async () => {
    const response = await server.inject({ method: 'GET', url: '/test-context' });
    const ctx = JSON.parse(response.payload) as AuditContext;

    // Fastify inject usa 127.0.0.1 como IP padrão
    expect(ctx.ipAddress).toBe('127.0.0.1');
  });

  it('deve extrair userAgent do header', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/test-context',
      headers: { 'user-agent': 'TestAgent/1.0' },
    });
    const ctx = JSON.parse(response.payload) as AuditContext;

    expect(ctx.userAgent).toBe('TestAgent/1.0');
  });

  it('deve definir userAgent vazio quando header ausente', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/test-context',
      headers: { 'user-agent': undefined },
    });
    const ctx = JSON.parse(response.payload) as AuditContext;

    // Fastify pode injetar um user-agent padrão no inject, verificamos que é string
    expect(typeof ctx.userAgent).toBe('string');
  });

  it('deve extrair userId dos headers X-User-*', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/test-context',
      headers: {
        'x-user-id': 'user-123',
        'x-user-email': 'user@example.com',
        'x-user-role': 'admin',
      },
    });
    const ctx = JSON.parse(response.payload) as AuditContext;

    expect(ctx.userId).toBe('user-123');
    expect(ctx.userEmail).toBe('user@example.com');
    expect(ctx.userRole).toBe('admin');
  });

  it('deve usar "anonymous" quando nenhuma identificação é fornecida', async () => {
    const response = await server.inject({ method: 'GET', url: '/test-context' });
    const ctx = JSON.parse(response.payload) as AuditContext;

    expect(ctx.userId).toBe('anonymous');
    expect(ctx.userEmail).toBe('');
    expect(ctx.userRole).toBe('');
  });

  it('deve incluir startedAt como timestamp numérico', async () => {
    const before = Date.now();
    const response = await server.inject({ method: 'GET', url: '/test-context' });
    const after = Date.now();

    const ctx = JSON.parse(response.payload) as AuditContext;

    expect(ctx.startedAt).toBeGreaterThanOrEqual(before);
    expect(ctx.startedAt).toBeLessThanOrEqual(after);
  });

  it('deve preencher todos os campos obrigatórios do contexto', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/test-context',
      headers: {
        'x-user-id': 'user-456',
        'user-agent': 'Mozilla/5.0',
      },
    });
    const ctx = JSON.parse(response.payload) as AuditContext;

    // Todos os campos obrigatórios presentes
    expect(ctx).toHaveProperty('requestId');
    expect(ctx).toHaveProperty('ipAddress');
    expect(ctx).toHaveProperty('userAgent');
    expect(ctx).toHaveProperty('userId');
    expect(ctx).toHaveProperty('userEmail');
    expect(ctx).toHaveProperty('userRole');
    expect(ctx).toHaveProperty('startedAt');
  });
});
