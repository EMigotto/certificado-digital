/**
 * Audit log routes.
 *
 * GET /api/v1/audit                    — global audit log (paginated, filterable)
 * GET /api/v1/certificates/:id/audit   — cert-specific audit log
 *
 * Covers AC 21, 32–34.
 *
 * Issue #16 — C3 Chunk 5/7: Audit Log Service & API
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type Database from 'better-sqlite3';

import {
  getGlobalLog,
  getCertificateLog,
  type AuditAction,
  type AuditFilters,
} from '../services/audit-service.js';

/* ------------------------------------------------------------------ */
/* Validation helpers                                                  */
/* ------------------------------------------------------------------ */

const VALID_ACTIONS: AuditAction[] = ['CREATE', 'UPDATE', 'DELETE', 'REVOKE'];

function isValidAction(value: string): value is AuditAction {
  return VALID_ACTIONS.includes(value as AuditAction);
}

/**
 * Rough check for an ISO-8601 date string.
 * Accepts yyyy-mm-dd and full ISO timestamps.
 */
function isValidIsoDate(value: string): boolean {
  return !isNaN(Date.parse(value));
}

/* ------------------------------------------------------------------ */
/* Route factory — global audit log                                    */
/* ------------------------------------------------------------------ */

/**
 * Create the router for global audit log endpoints.
 *
 * GET /api/v1/audit
 *
 * Query parameters:
 *  - action:    AuditAction (CREATE, UPDATE, DELETE, REVOKE)
 *  - actor:     substring match (case-insensitive)
 *  - cert_cn:   substring match on certificate CN (case-insensitive)
 *  - date_from: ISO-8601 start date (inclusive)
 *  - date_to:   ISO-8601 end date (inclusive)
 *  - page:      1-based page number (default 1)
 *  - page_size: items per page (default 50, max 100)
 */
export function createAuditRoutes(db: Database.Database): Router {
  const router = Router();

  router.get('/', (req: Request, res: Response) => {
    try {
      // Parse filters
      const filters: AuditFilters = {};

      if (typeof req.query.action === 'string' && req.query.action) {
        const actionUpper = req.query.action.toUpperCase();
        if (!isValidAction(actionUpper)) {
          return res.status(400).json({
            error: {
              status: 400,
              message: `Invalid action filter. Must be one of: ${VALID_ACTIONS.join(', ')}`,
            },
          });
        }
        filters.action = actionUpper;
      }

      if (typeof req.query.actor === 'string' && req.query.actor) {
        filters.actor = req.query.actor;
      }

      if (typeof req.query.cert_cn === 'string' && req.query.cert_cn) {
        filters.certCn = req.query.cert_cn;
      }

      if (typeof req.query.date_from === 'string' && req.query.date_from) {
        if (!isValidIsoDate(req.query.date_from)) {
          return res.status(400).json({
            error: { status: 400, message: 'Invalid date_from. Must be a valid ISO-8601 date.' },
          });
        }
        filters.dateFrom = req.query.date_from;
      }

      if (typeof req.query.date_to === 'string' && req.query.date_to) {
        if (!isValidIsoDate(req.query.date_to)) {
          return res.status(400).json({
            error: { status: 400, message: 'Invalid date_to. Must be a valid ISO-8601 date.' },
          });
        }
        filters.dateTo = req.query.date_to;
      }

      // Parse pagination
      const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
      const pageSize = Math.max(1, Math.min(parseInt(String(req.query.page_size ?? '50'), 10) || 50, 100));

      const result = getGlobalLog(db, filters, page, pageSize);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({
        error: {
          status: 500,
          message: err instanceof Error ? err.message : 'Internal server error',
        },
      });
    }
  });

  return router;
}

/* ------------------------------------------------------------------ */
/* Route factory — certificate-specific audit log                      */
/* ------------------------------------------------------------------ */

/**
 * Create the router for certificate-specific audit log endpoints.
 *
 * GET /api/v1/certificates/:id/audit
 *
 * Returns all audit entries for the given certificate, sorted newest-first.
 */
export function createCertificateAuditRoutes(db: Database.Database): Router {
  const router = Router({ mergeParams: true });

  router.get('/:id/audit', (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);

      if (!id) {
        return res.status(400).json({
          error: { status: 400, message: 'Certificate ID is required' },
        });
      }

      const entries = getCertificateLog(db, id);
      return res.json({ items: entries });
    } catch (err) {
      return res.status(500).json({
        error: {
          status: 500,
          message: err instanceof Error ? err.message : 'Internal server error',
        },
      });
    }
  });

  return router;
}
