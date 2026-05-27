import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { CertificateService, type ListCertificatesQuery } from '../services/certificateService.js';
import { CertificateRepository } from '../repositories/certificateRepo.js';
import prisma from '../prismaClient.js';

/**
 * Register certificate CRUD routes under /api prefix.
 */
export async function certificateRoutes(server: FastifyInstance): Promise<void> {
  const repo = new CertificateRepository(prisma);
  const service = new CertificateService(repo);

  // ── GET /api/certificates — Paginated list with search, filter, sort ─────

  server.get(
    '/api/certificates',
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

  server.get('/api/meta/filters', async (_request: FastifyRequest, reply: FastifyReply) => {
    const meta = await service.getFilterMeta();
    return reply.send(meta);
  });
}
