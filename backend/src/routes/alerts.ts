import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AlertService, AlertServiceError, type ListAlertsQuery } from '../services/alertService.js';
import { AlertRepository } from '../repositories/alertRepo.js';
import prisma from '../prismaClient.js';

/**
 * Register expiration alert routes.
 *
 * Routes:
 *   GET  /api/alerts/expiration        — list all alerts (paginated)
 *   GET  /api/alerts/expiration/:id     — alert detail with notifications
 *   PUT  /api/alerts/expiration/:id     — acknowledge alert
 *   GET  /api/certificates/:id/alerts   — alerts for a specific certificate
 */
export async function alertRoutes(server: FastifyInstance): Promise<void> {
  const repo = new AlertRepository(prisma);
  const service = new AlertService(repo);

  // ── GET /api/alerts/expiration — Paginated list with filters ─────────────

  server.get(
    '/api/alerts/expiration',
    { config: { requiredScope: 'certificates:read' } },
    async (
      request: FastifyRequest<{
        Querystring: ListAlertsQuery;
      }>,
      reply: FastifyReply,
    ) => {
      const result = await service.listAlerts(request.query);
      return reply.send(result);
    },
  );

  // ── GET /api/alerts/expiration/:id — Alert detail with notifications ─────

  server.get(
    '/api/alerts/expiration/:id',
    { config: { requiredScope: 'certificates:read' } },
    async (
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const alert = await service.getAlert(id);
      if (!alert) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Alert with id "${id}" not found`,
        });
      }
      return reply.send(alert);
    },
  );

  // ── PUT /api/alerts/expiration/:id — Acknowledge alert ───────────────────

  server.put(
    '/api/alerts/expiration/:id',
    { config: { requiredScope: 'certificates:write' } },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { actor?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const body = (request.body ?? {}) as { actor?: string };
      const actor = body.actor ?? 'system';

      try {
        const result = await service.acknowledgeAlert(id, actor);
        return reply.send(result);
      } catch (err) {
        if (err instanceof AlertServiceError) {
          return reply.status(err.statusCode).send({
            statusCode: err.statusCode,
            error: err.statusCode === 404 ? 'Not Found' : err.statusCode === 409 ? 'Conflict' : 'Bad Request',
            message: err.message,
          });
        }
        throw err;
      }
    },
  );

  // ── GET /api/certificates/:id/alerts — Alerts for a specific cert ───────

  server.get(
    '/api/certificates/:id/alerts',
    { config: { requiredScope: 'certificates:read' } },
    async (
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const alerts = await service.getAlertsByCertificate(id);
      return reply.send({ data: alerts, total: alerts.length });
    },
  );
}
