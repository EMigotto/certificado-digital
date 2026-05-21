/**
 * Certificate routes.
 *
 * POST   /api/v1/certificates/import/pem    — upload single PEM certificate
 * POST   /api/v1/certificates/import/pkcs12 — upload single PKCS#12 certificate
 * POST   /api/v1/certificates/import/csv    — bulk CSV import
 * PATCH  /api/v1/certificates/:id           — update org fields / tags (AC 33)
 * DELETE /api/v1/certificates/:id           — delete certificate (AC 34)
 *
 * Covers AC 1, 2, 3, 4, 33, 34, 38, 39, 42, 46, 47, 48.
 *
 * Pipeline (ADR §2.5):
 *   multer upload → read file → parse cert → validate metadata → persist → respond
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import fs from 'node:fs';
import type Database from 'better-sqlite3';

import { uploadPem, uploadPkcs12, uploadCsv } from '../middleware/upload.js';
import {
  parsePemCertificate,
  parsePkcs12Certificate,
  validateImportMetadata,
  persistCertificate,
  importCsvContent,
  type ImportMetadata,
} from '../services/import-service.js';
import {
  updateCertificate,
  deleteCertificate,
  type CertificateUpdateFields,
} from '../services/certificate-service.js';

/* ------------------------------------------------------------------ */
/* Router factory                                                      */
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
  router.post(
    '/import/csv',
    // Wrap multer to convert its errors into JSON responses (AC 46)
    (req: Request, res: Response, next: NextFunction) => {
      uploadCsv(req, res, (err) => {
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
        const csvContent = fs.readFileSync(req.file.path, 'utf-8');

        // Clean up temp file immediately
        fs.unlinkSync(req.file.path);

        // --- 3. Import CSV with row-level validation ---
        let result;
        try {
          result = importCsvContent(db, csvContent);
        } catch (importErr) {
          // AC 47: empty CSV or parse error
          return res.status(400).json({
            error: {
              status: 400,
              message:
                importErr instanceof Error
                  ? importErr.message
                  : 'Failed to process CSV file',
            },
          });
        }

        // --- 4. Return the import result ---
        // Use 200 even for partial success (some rows imported, some failed)
        const status = result.imported > 0 ? 200 : 400;
        return res.status(status).json(result);
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
  /* PATCH /:id — update org fields / tags (AC 33)                    */
  /* ---------------------------------------------------------------- */
  router.patch('/:id', (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const fields: CertificateUpdateFields = {};

      if (req.body.owner !== undefined) fields.owner = String(req.body.owner);
      if (req.body.application !== undefined) fields.application = String(req.body.application);
      if (req.body.environment !== undefined) {
        const env = String(req.body.environment);
        if (!['dev', 'hml', 'prd'].includes(env)) {
          return res.status(400).json({
            error: { status: 400, message: 'Environment must be dev, hml, or prd' },
          });
        }
        fields.environment = env as 'dev' | 'hml' | 'prd';
      }
      if (req.body.zone !== undefined) fields.zone = String(req.body.zone);
      if (req.body.caProvider !== undefined) fields.caProvider = String(req.body.caProvider);
      if (req.body.description !== undefined) fields.description = String(req.body.description);
      if (req.body.tags !== undefined) fields.tags = req.body.tags;
      if (req.body.customFields !== undefined) fields.customFields = req.body.customFields;

      const actor = (req.headers['x-actor'] as string) ?? 'system';
      const updated = updateCertificate(db, id, fields, actor);

      if (!updated) {
        return res.status(404).json({
          error: { status: 404, message: 'Certificate not found' },
        });
      }

      return res.json(updated);
    } catch (err) {
      return res.status(500).json({
        error: {
          status: 500,
          message: err instanceof Error ? err.message : 'Internal server error',
        },
      });
    }
  });

  /* ---------------------------------------------------------------- */
  /* DELETE /:id — delete certificate (AC 34)                         */
  /* ---------------------------------------------------------------- */
  router.delete('/:id', (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const actor = (req.headers['x-actor'] as string) ?? 'system';
      const deleted = deleteCertificate(db, id, actor);

      if (!deleted) {
        return res.status(404).json({
          error: { status: 404, message: 'Certificate not found' },
        });
      }

      return res.status(204).send();
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
