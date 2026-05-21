/**
 * Certificate import routes.
 *
 * POST /api/v1/certificates/import/pem    — upload single PEM certificate
 * POST /api/v1/certificates/import/pkcs12 — upload single PKCS#12 certificate
 * POST /api/v1/certificates/import/csv    — bulk CSV import (AC 3, 4, 42, 46, 47)
 *
 * Covers AC 1, 2, 3, 4, 38, 39, 42, 46, 47, 48.
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
