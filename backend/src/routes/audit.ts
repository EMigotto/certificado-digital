/**
 * Audit log routes — read-only API for the immutable audit trail.
 *
 * GET /api/audit            — Paginated, filterable audit log entries
 * GET /api/audit/batch/:id  — All entries for a specific batch ID
 *
 * No POST/PUT/PATCH/DELETE routes are exposed — audit entries are
 * created internally by other services, never by external clients.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AuditService, type AuditQueryParams } from '../services/auditService.js';
import { AuditRepository } from '../repositories/auditRepo.js';
import prisma from '../prismaClient.js';

/**
 * Register audit log routes on the Fastify instance.
 */
export async function auditRoutes(server: FastifyInstance): Promise<void> {
  const repo = new AuditRepository(prisma);
  const service = new AuditService(repo);

  // ── GET /api/audit — Paginated, filterable audit log ────────────────────

  server.get(
    '/api/audit',
    async (
      request: FastifyRequest<{
        Querystring: AuditQueryParams;
      }>,
      reply: FastifyReply,
    ) => {
      const result = await service.getEntries(request.query);
      return reply.send(result);
    },
  );

  // ── GET /api/audit/batch/:batchId — All entries for a batch ─────────────

  server.get(
    '/api/audit/batch/:batchId',
    async (
      request: FastifyRequest<{
        Params: { batchId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { batchId } = request.params;

      if (!batchId || !batchId.trim()) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'batchId parameter is required',
        });
      }

      const entries = await service.getByBatchId(batchId);
      return reply.send({ data: entries, total: entries.length });
    },
  );
}
