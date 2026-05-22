/**
 * Dashboard API routes.
 *
 * Endpoints:
 *   GET /api/v1/dashboard/stats      → KPI card data (AC 24, 25)
 *   GET /api/v1/dashboard/heatmap    → 90-day expiration heatmap (AC 27, 28)
 *   GET /api/v1/dashboard/alerts     → top-N critical alerts (AC 26)
 *
 * See ADR §2.3 for REST API design.
 */

import { Router } from 'express';
import type Database from 'better-sqlite3';
import { DashboardService } from '../services/dashboard-service.js';

/**
 * Create the dashboard router.
 *
 * @param db  The initialised SQLite database instance.
 * @returns   Express Router mounted at `/api/v1/dashboard`.
 */
export function createDashboardRouter(db: Database.Database): Router {
  const router = Router();
  const service = new DashboardService(db);

  /**
   * GET /api/v1/dashboard/stats
   *
   * Returns KPI counts:
   *   { total, valid, expiringSoon, expired, revoked, growthLast7d }
   */
  router.get('/stats', (_req, res, next) => {
    try {
      const stats = service.getStats();
      res.json(stats);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/v1/dashboard/heatmap
   *
   * Returns 90-day expiration heatmap:
   *   Array<{ dayOffset: number, count: number }>
   */
  router.get('/heatmap', (_req, res, next) => {
    try {
      const heatmap = service.getHeatmap();
      res.json(heatmap);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/v1/dashboard/alerts
   *
   * Query params:
   *   - limit (optional, default 5): maximum number of alerts
   *
   * Returns top-N soonest-expiring certificates:
   *   Array<{ id, commonName, environment, caProvider, owner, daysRemaining }>
   */
  router.get('/alerts', (req, res, next) => {
    try {
      const limitParam = req.query.limit;
      let limit = 5;

      if (limitParam !== undefined) {
        const parsed = parseInt(String(limitParam), 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          limit = Math.min(parsed, 100); // Cap at 100 for safety
        }
      }

      const alerts = service.getAlerts(limit);
      res.json(alerts);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
