/**
 * Certificate REST API routes.
 *
 * Endpoints (ADR §2.3):
 *   GET    /api/v1/certificates              — list + search + filter + paginate
 *   GET    /api/v1/certificates/export       — CSV / JSON download
 *   GET    /api/v1/certificates/:id          — detail
 *   PATCH  /api/v1/certificates/:id          — update org fields / tags
 *   DELETE /api/v1/certificates/:id          — delete
 *   GET    /api/v1/certificates/:id/download — PEM file download
 */
import { Router, type Request, type Response } from 'express';
import { CertificateService, type ListParams, type UpdatePayload } from '../services/certificate-service.js';
import { ExportService } from '../services/export-service.js';
import type Database from 'better-sqlite3';

export function createCertificateRouter(db: Database.Database): Router {
  const router = Router();
  const certService = new CertificateService(db);
  const exportService = new ExportService(certService);

  /* ================================================================ */
  /* GET /certificates/export — must be BEFORE :id routes (AC 31, 40) */
  /* ================================================================ */
  router.get('/export', (req: Request, res: Response) => {
    try {
      const format = (req.query.format as string) ?? 'csv';
      const params = extractFilterParams(req);

      if (format === 'json') {
        const result = exportService.exportJson(params);
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        res.setHeader('Content-Type', result.contentType);
        return res.send(result.data);
      }

      // Default to CSV
      const result = exportService.exportCsv(params);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.setHeader('Content-Type', result.contentType);
      return res.send(result.data);
    } catch (err) {
      return res.status(500).json({ error: 'Export failed', detail: String(err) });
    }
  });

  /* ================================================================ */
  /* GET /certificates — list + search + filter + paginate             */
  /*   (AC 5–18, 30, 35–37, 41, 45, 49, 50)                          */
  /* ================================================================ */
  router.get('/', (req: Request, res: Response) => {
    try {
      const params = extractListParams(req);
      const result = certService.list(params);

      if (result.totalItems === 0) {
        return res.json({ ...result, message: 'No certificates found' });
      }
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to list certificates', detail: String(err) });
    }
  });

  /* ================================================================ */
  /* GET /certificates/:id — detail (AC 19, 20, 43, 44)               */
  /* ================================================================ */
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const cert = certService.getById(String(req.params.id));
      if (!cert) {
        return res.status(404).json({ error: 'Certificate not found' });
      }
      return res.json(cert);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to retrieve certificate', detail: String(err) });
    }
  });

  /* ================================================================ */
  /* PATCH /certificates/:id — update org fields / tags (AC 29, 43)    */
  /* ================================================================ */
  router.patch('/:id', (req: Request, res: Response) => {
    try {
      const payload: UpdatePayload = {};

      // Only allow org fields (AC 43 — PKI fields read-only)
      if (req.body.owner !== undefined) payload.owner = req.body.owner;
      if (req.body.application !== undefined) payload.application = req.body.application;
      if (req.body.environment !== undefined) payload.environment = req.body.environment;
      if (req.body.zone !== undefined) payload.zone = req.body.zone;
      if (req.body.ca_provider !== undefined) payload.ca_provider = req.body.ca_provider;
      if (req.body.tags !== undefined) payload.tags = req.body.tags;
      if (req.body.custom_fields !== undefined) payload.custom_fields = req.body.custom_fields;
      if (req.body.description !== undefined) payload.description = req.body.description;

      const actor = String(req.headers['x-actor'] ?? 'system');
      const updated = certService.update(String(req.params.id), payload, actor);

      if (!updated) {
        return res.status(404).json({ error: 'Certificate not found' });
      }
      return res.json(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Environment must be')) {
        return res.status(400).json({ error: message });
      }
      return res.status(500).json({ error: 'Failed to update certificate', detail: message });
    }
  });

  /* ================================================================ */
  /* DELETE /certificates/:id — delete + audit (AC 23)                 */
  /* ================================================================ */
  router.delete('/:id', (req: Request, res: Response) => {
    try {
      const actor = String(req.headers['x-actor'] ?? 'system');
      const deleted = certService.delete(String(req.params.id), actor);

      if (!deleted) {
        return res.status(404).json({ error: 'Certificate not found' });
      }
      return res.status(200).json({ message: 'Certificate deleted' });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to delete certificate', detail: String(err) });
    }
  });

  /* ================================================================ */
  /* GET /certificates/:id/download — PEM file (AC 22)                 */
  /* ================================================================ */
  router.get('/:id/download', (req: Request, res: Response) => {
    try {
      const result = certService.download(String(req.params.id));
      if (!result) {
        return res.status(404).json({ error: 'Certificate or PEM not found' });
      }
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.setHeader('Content-Type', 'application/x-pem-file');
      return res.send(result.pem);
    } catch (err) {
      return res.status(500).json({ error: 'Download failed', detail: String(err) });
    }
  });

  return router;
}

/* ------------------------------------------------------------------ */
/* Query-string extractors                                             */
/* ------------------------------------------------------------------ */

function extractListParams(req: Request): ListParams {
  return {
    q: req.query.q as string | undefined,
    environment: req.query.environment as string | undefined,
    owner: req.query.owner as string | undefined,
    ca: req.query.ca as string | undefined,
    status: req.query.status as string | undefined,
    tag: req.query.tag as string | undefined,
    expires_before: req.query.expires_before ? Number(req.query.expires_before) : undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    page_size: req.query.page_size ? Number(req.query.page_size) : undefined,
    sort: req.query.sort as string | undefined,
    order: req.query.order === 'desc' ? 'desc' : 'asc',
  };
}

function extractFilterParams(req: Request): Omit<ListParams, 'page' | 'page_size'> {
  return {
    q: req.query.q as string | undefined,
    environment: req.query.environment as string | undefined,
    owner: req.query.owner as string | undefined,
    ca: req.query.ca as string | undefined,
    status: req.query.status as string | undefined,
    tag: req.query.tag as string | undefined,
    expires_before: req.query.expires_before ? Number(req.query.expires_before) : undefined,
    sort: req.query.sort as string | undefined,
    order: req.query.order === 'desc' ? 'desc' : 'asc',
  };
}
