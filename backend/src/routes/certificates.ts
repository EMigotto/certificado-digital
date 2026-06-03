import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { CertificateService, type ListCertificatesQuery } from '../services/certificateService.js';
import { CertificateRepository } from '../repositories/certificateRepo.js';
import prisma from '../prismaClient.js';
import {
  certificateListQuerySchema,
  certificateListResponseSchema,
  certificateDetailSchema,
  certificateIdParamSchema,
  certificateExportParamSchema,
  filterMetaResponseSchema,
  errorResponseSchema,
  notFoundResponseSchema,
} from '../schemas/index.js';

/**
 * Register certificate CRUD routes under /api prefix.
 */
export async function certificateRoutes(server: FastifyInstance): Promise<void> {
  const repo = new CertificateRepository(prisma);
  const service = new CertificateService(repo);

  // ── GET /api/certificates — Paginated list with search, filter, sort ─────

  server.get(
    '/api/certificates',
    {
      config: { requiredScope: 'certificates:read' },
      schema: {
        tags: ['Certificates'],
        summary: 'List certificates',
        description:
          'Retrieve a paginated list of certificates with optional search, filter, and sort.',
        querystring: certificateListQuerySchema,
        security: [{ BearerAuth: [] }],
        response: {
          200: certificateListResponseSchema,
        },
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: ListCertificatesQuery;
      }>,
      reply: FastifyReply,
    ) => {
      const result = await service.listCertificates(request.query);
      return reply.send(result);
    },
  );

  // ── GET /api/certificates/:id — Single certificate detail ────────────────

  server.get(
    '/api/certificates/:id',
    {
      config: { requiredScope: 'certificates:read' },
      schema: {
        tags: ['Certificates'],
        summary: 'Get certificate detail',
        description: 'Retrieve a single certificate by its UUID.',
        params: certificateIdParamSchema,
        security: [{ BearerAuth: [] }],
        response: {
          200: certificateDetailSchema,
          404: notFoundResponseSchema,
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const cert = await service.getCertificate(id);
      if (!cert) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Certificate with id "${id}" not found`,
        });
      }
      return reply.send(cert);
    },
  );

  // ── GET /api/certificates/:id/export/:format — Export PEM or JSON ────────

  server.get(
    '/api/certificates/:id/export/:format',
    {
      config: { requiredScope: 'certificates:read' },
      schema: {
        tags: ['Certificates'],
        summary: 'Export certificate',
        description: 'Download a certificate in PEM or JSON format.',
        params: certificateExportParamSchema,
        security: [{ BearerAuth: [] }],
        response: {
          400: errorResponseSchema,
          404: notFoundResponseSchema,
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string; format: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id, format } = request.params;

      if (!['pem', 'json'].includes(format)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: `Unsupported export format "${format}". Use "pem" or "json".`,
        });
      }

      const result = await service.exportCertificate(id, format);
      if (!result) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Certificate with id "${id}" not found`,
        });
      }

      return reply
        .header('Content-Type', result.contentType)
        .header('Content-Disposition', `attachment; filename="${result.filename}"`)
        .send(result.body);
    },
  );

  // ── DELETE /api/certificates/:id — Soft-delete (revoke) ──────────────────

  server.delete(
    '/api/certificates/:id',
    {
      config: { requiredScope: 'certificates:delete' },
      schema: {
        tags: ['Certificates'],
        summary: 'Delete certificate',
        description: 'Soft-delete (revoke) a certificate by its UUID.',
        params: certificateIdParamSchema,
        security: [{ BearerAuth: [] }],
        response: {
          200: certificateDetailSchema,
          404: notFoundResponseSchema,
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const result = await service.deleteCertificate(id);
      if (!result) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Certificate with id "${id}" not found`,
        });
      }
      return reply.send(result);
    },
  );

  // ── GET /api/meta/filters — Available filter values for dropdowns ────────

  server.get(
    '/api/meta/filters',
    {
      config: { requiredScope: 'certificates:read' },
      schema: {
        tags: ['Certificates'],
        summary: 'Get filter metadata',
        description:
          'Retrieve available filter values (environments, applications, owners, zones, statuses) for UI dropdowns.',
        security: [{ BearerAuth: [] }],
        response: {
          200: filterMetaResponseSchema,
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const meta = await service.getFilterMeta();
      return reply.send(meta);
    },
  );
}
