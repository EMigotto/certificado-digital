/**
 * Import routes — certificate file upload and bulk CSV import.
 *
 * POST /api/certificates/import        — Single cert file (PEM/PKCS12/DER)
 * POST /api/certificates/import/csv    — Bulk CSV import
 * GET  /api/certificates/import/csv/template — Download CSV template
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import multipart from '@fastify/multipart';
import { ImportService } from '../services/importService.js';
import { generateCsvTemplate } from '../utils/csvParser.js';
import prisma from '../prismaClient.js';

/** Max file size: 10 MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Register import routes on the Fastify instance.
 */
export async function importRoutes(server: FastifyInstance): Promise<void> {
  // Register multipart support for file uploads
  await server.register(multipart, {
    limits: {
      fileSize: MAX_FILE_SIZE,
      files: 1,
    },
  });

  const importService = new ImportService(prisma);

  // ── POST /api/certificates/import — Single file upload ──────────────────

  server.post('/api/certificates/import', async (request: FastifyRequest, reply: FastifyReply) => {
    let data;
    try {
      data = await request.file();
    } catch (err) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: `File upload error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    if (!data) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'No file provided. Please upload a certificate file (PEM, PKCS#12, or DER).',
      });
    }

    // Consume the file buffer
    const fileBuffer = await data.toBuffer();
    const filename = data.filename ?? 'unknown';

    // Extract metadata from multipart fields
    const fields = data.fields;
    const password = extractFieldValue(fields, 'password');
    const owner = extractFieldValue(fields, 'owner');
    const environment = extractFieldValue(fields, 'environment');
    const application = extractFieldValue(fields, 'application');
    const tagsRaw = extractFieldValue(fields, 'tags');

    let tags: Record<string, string> = {};
    if (tagsRaw) {
      try {
        tags = JSON.parse(tagsRaw);
      } catch {
        // Try key:value;key:value format
        tags = parseTagString(tagsRaw);
      }
    }

    const result = await importService.importSingleCertificate(
      fileBuffer,
      filename,
      password || undefined,
      { owner, environment, application, tags },
      'system',
    );

    switch (result.status) {
      case 'created':
        return reply.status(201).send({
          certificate: result.certificate,
          auditId: result.auditId,
        });

      case 'duplicate':
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: `Duplicate certificate detected (${result.duplicate.matchType}): ${result.duplicate.commonName}`,
          duplicate: result.duplicate,
        });

      case 'invalid':
        return reply.status(422).send({
          statusCode: 422,
          error: 'Unprocessable Entity',
          message: result.error,
          code: result.code,
        });

      case 'unsupported':
        return reply.status(415).send({
          statusCode: 415,
          error: 'Unsupported Media Type',
          message: result.error,
          supportedFormats: ['PEM (.pem, .crt)', 'PKCS#12 (.p12, .pfx)', 'DER (.der, .cer)'],
        });
    }
  });

  // ── POST /api/certificates/import/csv — Bulk CSV import ─────────────────

  server.post(
    '/api/certificates/import/csv',
    async (request: FastifyRequest<{ Querystring: { confirm?: string } }>, reply: FastifyReply) => {
      let data;
      try {
        data = await request.file();
      } catch (err) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: `File upload error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }

      if (!data) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'No CSV file provided.',
        });
      }

      const fileBuffer = await data.toBuffer();
      const csvContent = fileBuffer.toString('utf-8');

      // Check for BOM and strip it
      const cleanContent = csvContent.replace(/^\uFEFF/, '');

      // Check the confirm flag — from query string or multipart field
      const confirmFromQuery = (request.query as { confirm?: string }).confirm;
      const confirmFromField = extractFieldValue(data.fields, 'confirm');
      const isConfirm =
        confirmFromQuery === 'true' ||
        confirmFromQuery === '1' ||
        confirmFromField === 'true' ||
        confirmFromField === '1';

      if (isConfirm) {
        // Execute import
        const result = await importService.executeCsvImport(cleanContent, 'system');
        return reply.status(200).send(result);
      } else {
        // Preview / validate only
        const preview = await importService.previewCsvImport(cleanContent);

        if (preview.headerErrors.length > 0) {
          return reply.status(422).send({
            statusCode: 422,
            error: 'Unprocessable Entity',
            message: 'CSV header validation failed',
            headerErrors: preview.headerErrors,
          });
        }

        return reply.status(200).send(preview);
      }
    },
  );

  // ── GET /api/certificates/import/csv/template — Download CSV template ───

  server.get(
    '/api/certificates/import/csv/template',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const template = generateCsvTemplate();
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="certificate_import_template.csv"')
        .send(template);
    },
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract a string value from multipart fields.
 * Handles both single-value and array fields from @fastify/multipart.
 */
function extractFieldValue(fields: Record<string, unknown>, name: string): string {
  const field = fields[name];
  if (!field) return '';

  // @fastify/multipart field objects have a .value property
  if (typeof field === 'object' && field !== null && 'value' in field) {
    return String((field as { value: unknown }).value);
  }

  if (typeof field === 'string') return field;

  return '';
}

/**
 * Parse tags from "key:value;key:value" format.
 */
function parseTagString(tagStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  const pairs = tagStr.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf(':');
    if (idx > 0) {
      const key = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (key) result[key] = value;
    }
  }
  return result;
}
