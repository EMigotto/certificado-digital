/**
 * OpenAPI / Swagger plugin for Fastify.
 *
 * Registers @fastify/swagger (spec generation) and @fastify/swagger-ui
 * (interactive docs UI). The Swagger UI is served at /api/docs and the
 * raw OpenAPI JSON spec is available at /api/docs/openapi.json.
 *
 * Security: Defines a Bearer token scheme (HTTP bearer) used by
 * service-token-authenticated endpoints.
 */

import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

/**
 * Register OpenAPI documentation plugins on the Fastify instance.
 */
export async function registerOpenApi(server: FastifyInstance): Promise<void> {
  // ── @fastify/swagger — OpenAPI 3.0.0 spec generation ──────────────────
  await server.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Certificado Digital API',
        description:
          'REST API for centralized mTLS certificate inventory management. ' +
          'Provides endpoints for certificate CRUD, import, expiration alerting, ' +
          'policy management, CSR generation, and dashboard analytics.',
        version: '1.0.0',
        contact: {
          name: 'Certificado Digital Team',
        },
        license: {
          name: 'MIT',
        },
      },
      servers: [
        {
          url: 'http://localhost:3000',
          description: 'Local development server',
        },
      ],
      tags: [
        { name: 'Certificates', description: 'Certificate CRUD and export operations' },
        { name: 'Import', description: 'Certificate file and CSV import' },
        { name: 'Audit', description: 'Immutable audit trail' },
        { name: 'Alerts', description: 'Expiration alert management' },
        { name: 'Policies', description: 'Expiration policy configuration' },
        { name: 'Dashboard', description: 'Analytics and KPI dashboard' },
        { name: 'Scheduler', description: 'Internal scheduler management' },
        { name: 'Tokens', description: 'Service token authentication' },
        { name: 'CSR', description: 'Certificate Signing Request generation' },
        { name: 'Zones', description: 'Network zone management' },
        { name: 'Health', description: 'System health checks' },
      ],
      components: {
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'ServiceToken',
            description:
              'Service token authentication. Obtain a token via the ' +
              'POST /api/tokens endpoint. Include the token in the ' +
              'Authorization header as: Bearer <token>',
          },
        },
      },
    },
  });

  // ── @fastify/swagger-ui — Interactive documentation UI ────────────────
  await server.register(swaggerUi, {
    routePrefix: '/api/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      persistAuthorization: true,
    },
    staticCSP: true,
    transformStaticCSP: (header: string) => header,
  });
}
