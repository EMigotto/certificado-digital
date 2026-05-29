import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { certificateRoutes } from './routes/certificates.js';
import { importRoutes } from './routes/import.js';
import { auditRoutes } from './routes/audit.js';
import { alertRoutes } from './routes/alerts.js';

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

  // Health-check route
  server.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Certificate CRUD routes
  await server.register(certificateRoutes);

  // Certificate import routes (file upload + CSV)
  await server.register(importRoutes);

  // Audit log routes (read-only)
  await server.register(auditRoutes);

  // Expiration alert routes
  await server.register(alertRoutes);

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
