/**
 * Scheduler routes — internal API for manual trigger and status queries.
 *
 * POST /api/internal/scheduler/expiration-check        — Manual trigger (admin only)
 * GET  /api/internal/scheduler/expiration-check/status  — Last execution status
 * GET  /api/internal/scheduler/logs                     — Recent execution logs
 *
 * These endpoints are intended for internal/admin use.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getSchedulerService } from '../scheduler/cronJob.js';

/**
 * Register scheduler routes on the Fastify instance.
 */
export async function schedulerRoutes(server: FastifyInstance): Promise<void> {
  // ── POST /api/internal/scheduler/expiration-check — Manual trigger ──────
  server.post(
    '/api/internal/scheduler/expiration-check',
    { config: { requiredScope: 'admin' } },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const service = getSchedulerService();
      const status = service.getStatus();

      if (status.isRunning) {
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: 'Expiration check is already running. Please wait for it to complete.',
        });
      }

      // Run the check asynchronously but await for the response
      const result = await service.runCheck();

      return reply.status(200).send({
        message: 'Expiration check completed',
        data: result,
      });
    },
  );

  // ── GET /api/internal/scheduler/expiration-check/status — Status ────────
  server.get(
    '/api/internal/scheduler/expiration-check/status',
    { config: { requiredScope: 'admin' } },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const service = getSchedulerService();
      const status = service.getStatus();

      return reply.status(200).send({ data: status });
    },
  );

  // ── GET /api/internal/scheduler/logs — Recent execution logs ────────────
  server.get(
    '/api/internal/scheduler/logs',
    { config: { requiredScope: 'admin' } },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const service = getSchedulerService();
      const logs = service.getLogs();

      return reply.status(200).send({ data: logs, total: logs.length });
    },
  );
}
