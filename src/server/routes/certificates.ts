/**
 * Certificate REST API routes.
 *
 * Import endpoints:
 *   POST /api/v1/certificates/import/pem    — upload single PEM certificate
 *   POST /api/v1/certificates/import/pkcs12 — upload single PKCS#12 certificate
 *   POST /api/v1/certificates/import/csv    — bulk CSV import (AC 3, 4, 42, 46, 47)
 *
 * CRUD endpoints (ADR §2.3):
 *   GET    /api/v1/certificates              — list + search + filter + paginate
 *   GET    /api/v1/certificates/export       — CSV / JSON download
 *   GET    /api/v1/certificates/:id          — detail
 *   PATCH  /api/v1/certificates/:id          — update org fields / tags
 *   DELETE /api/v1/certificates/:id          — delete
 *   GET    /api/v1/certificates/:id/download — PEM file download
 *
 * Covers AC 1–20, 22–23, 29–31, 35–42, 43–50.
 *
 * Pipeline (ADR §2.5):
 *   multer upload → read file → parse cert → validate metadata → persist → respond
 *
 * CSV pipeline (ADR §2.5):
 *   multer upload → validate file type → read CSV content → importCsv → respond
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import type Database from 'better-sqlite3';

import { uploadPem, uploadPkcs12 } from '../middleware/upload.js';
import {
  parsePemCertificate,
  parsePkcs12Certificate,
  validateImportMetadata,
  persistCertificate,
  validateCsvFilename,
  importCsv,
  createCsvCommitFn,
  type ImportMetadata,
} from '../services/import-service.js';
import { CertificateService, type ListParams, type UpdatePayload } from '../services/certificate-service.js';
import { ExportService } from '../services/export-service.js';

/* ------------------------------------------------------------------ */
/* Router factory — import routes (used by index.ts)                   */
/* ------------------------------------------------------------------ */

export function createCertificateRoutes(db: Database.Database): Router {
  const router = Router();

  /* ---------------------------------------------------------------- */
  /* POST /import/pem  — single PEM upload (AC 1, 2, 38, 39, 46, 48) */
  /* ---------------------------------------------------------------- */
  router.post(
    '/import/pem',
    // Wrap multer to convert its errors into JSON responses
    (req: Request, res: Response, next: NextFunction) => {
      uploadPem(req, res, (err) => {
        if (err) {
          return res.status(400).json({
            error: { status: 400, message: err.message },
          });
        }
        next();
      });
    },
    (req: Request, res: Response) => {
      try {
        // --- 1. Ensure a file was provided ---
        if (!req.file) {
          return res.status(400).json({
            error: { status: 400, message: 'No file uploaded' },
          });
        }

        // --- 2. Read file content ---
        const pemContent = fs.readFileSync(req.file.path, 'utf-8');

        // Clean up temp file immediately
        fs.unlinkSync(req.file.path);

        // --- 3. Parse the PEM certificate ---
        let parsed;
        try {
          parsed = parsePemCertificate(pemContent);
        } catch (parseErr) {
          return res.status(400).json({
            error: {
              status: 400,
              message:
                parseErr instanceof Error
                  ? parseErr.message
                  : 'Failed to parse PEM certificate',
            },
          });
        }

        // --- 4. Parse & validate org metadata from body ---
        const metadata: Partial<ImportMetadata> = {
          owner: req.body?.owner,
          application: req.body?.application,
          environment: req.body?.environment,
          zone: req.body?.zone,
          caProvider: req.body?.caProvider,
          description: req.body?.description,
          tags: req.body?.tags ? tryParseJson(req.body.tags) : undefined,
        };

        const validationErrors = validateImportMetadata(metadata);
        if (validationErrors.length > 0) {
          return res.status(400).json({
            error: {
              status: 400,
              message: 'Validation failed',
              details: validationErrors,
            },
          });
        }

        // --- 5. Check for preview-only request ---
        if (req.body?.preview === 'true' || req.body?.preview === true) {
          return res.status(200).json({ preview: parsed });
        }

        // --- 6. Persist ---
        const imported = persistCertificate(
          db,
          parsed,
          metadata as ImportMetadata,
        );

        return res.status(201).json(imported);
      } catch (err) {
        // Clean up temp file on unexpected error
        if (req.file?.path) {
          try {
            fs.unlinkSync(req.file.path);
          } catch {
            /* ignore cleanup errors */
          }
        }
        return res.status(500).json({
          error: {
            status: 500,
            message:
              err instanceof Error ? err.message : 'Internal server error',
          },
        });
      }
    },
  );

  /* ---------------------------------------------------------------- */
  /* POST /import/pkcs12 — single PKCS#12 upload (AC 1, 2, 46)       */
  /* ---------------------------------------------------------------- */
  router.post(
    '/import/pkcs12',
    (req: Request, res: Response, next: NextFunction) => {
      uploadPkcs12(req, res, (err) => {
        if (err) {
          return res.status(400).json({
            error: { status: 400, message: err.message },
          });
        }
        next();
      });
    },
    (req: Request, res: Response) => {
      try {
        // --- 1. Ensure a file was provided ---
        if (!req.file) {
          return res.status(400).json({
            error: { status: 400, message: 'No file uploaded' },
          });
        }

        // --- 2. Read binary file content ---
        const buffer = fs.readFileSync(req.file.path);

        // Clean up temp file immediately
        fs.unlinkSync(req.file.path);

        // --- 3. Parse the PKCS#12 container ---
        const passphrase = req.body?.passphrase ?? '';

        let parsed;
        try {
          parsed = parsePkcs12Certificate(buffer, passphrase);
        } catch (parseErr) {
          return res.status(400).json({
            error: {
              status: 400,
              message:
                parseErr instanceof Error
                  ? parseErr.message
                  : 'Failed to parse PKCS#12 file',
            },
          });
        }

        // --- 4. Parse & validate org metadata from body ---
        const metadata: Partial<ImportMetadata> = {
          owner: req.body?.owner,
          application: req.body?.application,
          environment: req.body?.environment,
          zone: req.body?.zone,
          caProvider: req.body?.caProvider,
          description: req.body?.description,
          tags: req.body?.tags ? tryParseJson(req.body.tags) : undefined,
        };

        const validationErrors = validateImportMetadata(metadata);
        if (validationErrors.length > 0) {
          return res.status(400).json({
            error: {
              status: 400,
              message: 'Validation failed',
              details: validationErrors,
            },
          });
        }

        // --- 5. Check for preview-only request ---
        if (req.body?.preview === 'true' || req.body?.preview === true) {
          return res.status(200).json({ preview: parsed });
        }

        // --- 6. Persist ---
        const imported = persistCertificate(
          db,
          parsed,
          metadata as ImportMetadata,
        );

        return res.status(201).json(imported);
      } catch (err) {
        if (req.file?.path) {
          try {
            fs.unlinkSync(req.file.path);
          } catch {
            /* ignore cleanup errors */
          }
        }
        return res.status(500).json({
          error: {
            status: 500,
            message:
              err instanceof Error ? err.message : 'Internal server error',
          },
        });
      }
    },
  );

  /* ---------------------------------------------------------------- */
  /* POST /import/csv — bulk CSV import (AC 3, 4, 42, 46, 47)        */
  /* ---------------------------------------------------------------- */

  // Use memory storage for CSV (text files, typically small)
  const csvUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  }).single('file');

  router.post(
    '/import/csv',
    (req: Request, res: Response, next: NextFunction) => {
      csvUpload(req, res, (err) => {
        if (err) {
          return res.status(400).json({
            error: { status: 400, message: err.message },
          });
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        // --- 1. Ensure a file was provided ---
        if (!req.file) {
          return res.status(400).json({
            error: { status: 400, message: 'No file uploaded' },
          });
        }

        // --- 2. Validate file type (AC 46) ---
        const fileError = validateCsvFilename(req.file.originalname);
        if (fileError) {
          return res.status(400).json({
            error: { status: 400, message: fileError },
          });
        }

        // --- 3. Read CSV content from memory buffer ---
        const csvContent = req.file.buffer.toString('utf-8');

        // --- 4. Import with row-level validation and partial commit ---
        const commitFn = createCsvCommitFn(db);
        const result = await importCsv(csvContent, commitFn);

        // --- 5. Determine response status ---
        // If nothing was imported and there are errors, it's a client error
        if (result.imported === 0 && result.errors.length > 0) {
          return res.status(400).json(result);
        }

        // Partial success (some imported, some failed) or full success
        return res.status(200).json(result);
      } catch (err) {
        return res.status(500).json({
          error: {
            status: 500,
            message:
              err instanceof Error ? err.message : 'Internal server error',
          },
        });
      }
    },
  );

  /* ================================================================ */
  /* CRUD routes (from certificate-service / export-service)           */
  /* ================================================================ */
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

/**
 * Alias for createCertificateRoutes — used by certificate-service tests.
 */
export const createCertificateRouter = createCertificateRoutes;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Try to parse a JSON string; return the parsed object or the original
 * value if it's already an object (multer may pass text fields as-is).
 */
function tryParseJson(value: unknown): Record<string, string> | undefined {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, string>;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
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
