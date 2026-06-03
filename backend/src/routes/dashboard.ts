import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { DashboardService } from '../services/dashboardService.js';
import { DashboardRepository } from '../repositories/dashboardRepo.js';
import prisma from '../prismaClient.js';

/**
 * Register dashboard API routes.
 *
 * Routes:
 *   GET /api/dashboard/snapshot       — KPIs + heatmap + trends + lastUpdated
 *   GET /api/dashboard/heatmap        — detailed heatmap data (configurable days)
 *   GET /api/dashboard/critical-alerts — top N urgent alerts
 */
export async function dashboardRoutes(server: FastifyInstance): Promise<void> {
  const repo = new DashboardRepository(prisma);
  const service = new DashboardService(repo);

  // ── GET /api/dashboard/snapshot ─────────────────────────────────────────────
  //
  // Returns the full dashboard snapshot: KPIs + heatmap + critical alerts + trends.
  // Response is cached for 30 seconds (both server-side and via Cache-Control).
  //
  // AC 4.1: KPI Total Managed accurate count
  // AC 4.2: KPI Valid shows non-expired, non-revoked
  // AC 4.3: KPI Expiring < 30d with correct window and trend
  // AC 4.7: Query SLA < 2 seconds via snapshot caching

  server.get(
    '/api/dashboard/snapshot',
    { config: { requiredScope: 'certificates:read' } },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const snapshot = await service.getSnapshot();

      return reply
        .header('Cache-Control', 'max-age=30')
        .send(snapshot);
    },
  );

  // ── GET /api/dashboard/heatmap ──────────────────────────────────────────────
  //
  // Returns heatmap data: day-offset → count of certificates expiring that day.
  // Query param `days` controls the look-ahead window (default 90, max 365).
  //
  // AC 4.4: Heatmap data grouped by day with correct intensity mapping

  server.get(
    '/api/dashboard/heatmap',
    { config: { requiredScope: 'certificates:read' } },
    async (
      request: FastifyRequest<{
        Querystring: { days?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const rawDays = Number(request.query.days);
      const days = Number.isFinite(rawDays) && rawDays > 0
        ? Math.min(Math.floor(rawDays), 365)
        : 90;

      const heatmap = await service.getHeatmap(days);

      return reply
        .header('Cache-Control', 'max-age=30')
        .send({ days, heatmap });
    },
  );

  // ── GET /api/dashboard/critical-alerts ──────────────────────────────────────
  //
  // Returns the top N most urgent alerts (by daysUntilExpiryAtAlert ASC).
  // Query param `limit` controls how many (default 5, max 50).
  //
  // AC 4.5: Critical alerts sorted by urgency (daysUntilExpiry ASC)

  server.get(
    '/api/dashboard/critical-alerts',
    { config: { requiredScope: 'certificates:read' } },
    async (
      request: FastifyRequest<{
        Querystring: { limit?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const rawLimit = Number(request.query.limit);
      const limit = Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(Math.floor(rawLimit), 50)
        : 5;

      const alerts = await service.getCriticalAlerts(limit);

      return reply.send({ alerts, total: alerts.length });
    },
  );
}
