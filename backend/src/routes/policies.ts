import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PolicyCreateWithWebhooks, PolicyUpdate } from '@certificado-digital/shared';
import { PolicyService, type ListPoliciesQuery } from '../services/policyService.js';
import { PolicyRepository } from '../repositories/policyRepo.js';
import prisma from '../prismaClient.js';

/**
 * Register expiration policy routes under /api prefix.
 */
export async function policyRoutes(server: FastifyInstance): Promise<void> {
  const repo = new PolicyRepository(prisma);
  const service = new PolicyService(repo);

  // ── GET /api/policies/expiration — List all policies ─────────────────────

  server.get(
    '/api/policies/expiration',
    { config: { requiredScope: 'policies:read' } },
    async (
      request: FastifyRequest<{
        Querystring: ListPoliciesQuery;
      }>,
      reply: FastifyReply,
    ) => {
      const result = await service.listPolicies(request.query);
      return reply.send(result);
    },
  );

  // ── POST /api/policies/expiration — Create policy ────────────────────────

  server.post(
    '/api/policies/expiration',
    { config: { requiredScope: 'policies:write' } },
    async (
      request: FastifyRequest<{
        Body: PolicyCreateWithWebhooks;
      }>,
      reply: FastifyReply,
    ) => {
      const body = request.body as PolicyCreateWithWebhooks;

      if (!body || typeof body !== 'object') {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Request body is required',
        });
      }

      const result = await service.createPolicy({
        name: body.name,
        description: body.description,
        zoneId: body.zoneId,
        isDefault: body.isDefault,
        thresholds: body.thresholds,
        emailEnabled: body.emailEnabled,
        emailRecipientsAdditional: body.emailRecipientsAdditional,
        emailSubjectPrefix: body.emailSubjectPrefix,
        createdBy: body.createdBy || 'system',
        webhooks: body.webhooks,
      });

      if ('error' in result) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: result.error,
        });
      }

      return reply.status(201).send(result);
    },
  );

  // ── GET /api/policies/expiration/:id — Get policy detail ─────────────────

  server.get(
    '/api/policies/expiration/:id',
    { config: { requiredScope: 'policies:read' } },
    async (
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const policy = await service.getPolicy(id);

      if (!policy) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Policy with id "${id}" not found`,
        });
      }

      return reply.send({ data: policy });
    },
  );

  // ── PUT /api/policies/expiration/:id — Update policy ─────────────────────

  server.put(
    '/api/policies/expiration/:id',
    { config: { requiredScope: 'policies:write' } },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: PolicyUpdate;
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const body = request.body as PolicyUpdate;

      if (!body || typeof body !== 'object') {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Request body is required',
        });
      }

      const result = await service.updatePolicy(id, {
        name: body.name,
        description: body.description,
        zoneId: body.zoneId,
        isDefault: body.isDefault,
        thresholds: body.thresholds,
        emailEnabled: body.emailEnabled,
        emailRecipientsAdditional: body.emailRecipientsAdditional,
        emailSubjectPrefix: body.emailSubjectPrefix,
        updatedBy: body.updatedBy || 'system',
      });

      if ('error' in result) {
        const statusCode = result.statusCode ?? 400;
        return reply.status(statusCode).send({
          statusCode,
          error: statusCode === 404 ? 'Not Found' : 'Bad Request',
          message: result.error,
        });
      }

      return reply.send(result);
    },
  );

  // ── DELETE /api/policies/expiration/:id — Soft delete policy ─────────────

  server.delete(
    '/api/policies/expiration/:id',
    { config: { requiredScope: 'policies:write' } },
    async (
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const result = await service.deletePolicy(id);

      if (!result) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Policy with id "${id}" not found`,
        });
      }

      return reply.send({ data: result });
    },
  );

  // ── GET /api/zones/:zoneId/policies/expiration — Zone policy ─────────────

  server.get(
    '/api/zones/:zoneId/policies/expiration',
    { config: { requiredScope: 'policies:read' } },
    async (
      request: FastifyRequest<{
        Params: { zoneId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { zoneId } = request.params;
      const policy = await service.getZonePolicy(zoneId);

      if (!policy) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `No expiration policy found for zone "${zoneId}"`,
        });
      }

      return reply.send({ data: policy });
    },
  );

  // ── POST /api/policies/expiration/:id/test-webhook — Test webhook ────────

  server.post(
    '/api/policies/expiration/:id/test-webhook',
    { config: { requiredScope: 'policies:write' } },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { webhookId?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id: policyId } = request.params;
      const body = (request.body ?? {}) as { webhookId?: string };

      // Verify the policy exists
      const policy = await service.getPolicy(policyId);
      if (!policy) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Policy with id "${policyId}" not found`,
        });
      }

      // Determine which webhook to test
      let webhookId = body.webhookId;
      if (!webhookId) {
        // Default: test the first active webhook
        const activeWebhook = policy.webhooks.find((w) => w.isActive);
        if (!activeWebhook) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: 'No active webhook found for this policy',
          });
        }
        webhookId = activeWebhook.id;
      }

      // Verify the webhook belongs to this policy
      const webhookBelongsToPolicy = policy.webhooks.some((w) => w.id === webhookId);
      if (!webhookBelongsToPolicy) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: `Webhook "${webhookId}" does not belong to policy "${policyId}"`,
        });
      }

      const result = await service.testWebhook(webhookId);
      if (!result) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Webhook with id "${webhookId}" not found`,
        });
      }

      return reply.send({ data: result });
    },
  );
}
