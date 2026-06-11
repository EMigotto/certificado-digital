import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { registerOpenApi } from './plugins/openapi.js';
import authPlugin from './plugins/auth.js';
import auditContextPlugin from './plugins/auditContext.js';
import { certificateRoutes } from './routes/certificates.js';
import { importRoutes } from './routes/import.js';
import { auditRoutes } from './routes/audit.js';
import { alertRoutes } from './routes/alerts.js';
import { schedulerRoutes } from './routes/scheduler.js';
import { startScheduler, stopScheduler } from './scheduler/cronJob.js';
import { policyRoutes } from './routes/policies.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { healthResponseSchema } from './schemas/index.js';
import { tokenRoutes } from './routes/tokens.js';

/** Build and configure the Fastify instance */
export async function buildServer() {
  const server = Fastify({
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  });

  // Register CORS
  await server.register(cors, {
    origin: config.CORS_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Register OpenAPI / Swagger documentation
  await registerOpenApi(server);

  // Contexto de auditoria — deve ser registrado ANTES do auth
  // para que requestId e IP estejam disponíveis no hook de autenticação
  await server.register(auditContextPlugin);

  // Register token authentication middleware
  await server.register(authPlugin);

  // Health-check route
  server.get('/health', {
    schema: {
      tags: ['Health'],
      summary: 'Health check',
      description: 'Returns server health status and current timestamp.',
      response: {
        200: healthResponseSchema,
      },
    },
    handler: async () => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    },
  });

  // Certificate CRUD routes
  await server.register(certificateRoutes);

  // Certificate import routes (file upload + CSV)
  await server.register(importRoutes);

  // Audit log routes (read-only)
  await server.register(auditRoutes);

  // Expiration alert routes
  await server.register(alertRoutes);

  // Scheduler routes (internal/admin)
  await server.register(schedulerRoutes);

  // Expiration policy routes (CRUD + webhook test)
  await server.register(policyRoutes);

  // Dashboard routes (snapshot, heatmap, critical alerts)
  await server.register(dashboardRoutes);

  // Service token CRUD routes (C7)
  await server.register(tokenRoutes);

  // Start expiration scheduler after server is ready
  server.addHook('onReady', async () => {
    startScheduler();
  });

  // Stop scheduler on server close
  server.addHook('onClose', async () => {
    stopScheduler();
  });

  return server;
}

/** Start the server — only when run directly (not imported for testing) */
const isDirectRun =
  typeof process.argv[1] === 'string' &&
  (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'));

if (isDirectRun) {
  (async () => {
    const server = await buildServer();
    try {
      const address = await server.listen({
        port: config.PORT,
        host: config.HOST,
      });
      server.log.info(`🚀 Backend listening at ${address}`);
    } catch (err) {
      server.log.error(err);
      process.exit(1);
    }
  })();
}
