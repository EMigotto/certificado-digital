/**
 * Audit log routes — read-only API for the immutable audit trail.
 *
 * GET /api/audit              — Paginated, filterable audit log entries
 * GET /api/audit/batch/:batchId — All entries for a specific batch ID
 *
 * No POST/PUT/PATCH/DELETE routes are exposed — audit entries are
 * created internally by other services, never by external clients.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AuditFilterParams } from '@certificado-digital/shared';
import { AuditService } from '../services/auditService.js';
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
        Querystring: AuditFilterParams;
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

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(batchId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: `Invalid batch ID format: "${batchId}". Must be a valid UUID.`,
        });
      }

      const entries = await service.getByBatchId(batchId);
      return reply.send({ data: entries, batchId, total: entries.length });
    },
  );
}
