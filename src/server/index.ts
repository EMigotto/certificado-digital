/**
 * Express application entry point.
 *
 * Sets up:
 *  - JSON body parsing
 *  - CORS
 *  - Static file serving (for the frontend SPA)
 *  - Health-check endpoint: GET /api/v1/health
 *  - Global error-handling middleware
 *
 * See ADR §2.1 / §2.3 for architecture decisions.
 */

import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { initDatabase, closeDatabase } from './db.js';
import { errorHandler } from './middleware/error-handler.js';

/* ------------------------------------------------------------------ */
/* App factory (testable)                                              */
/* ------------------------------------------------------------------ */

export function createApp(db: ReturnType<typeof initDatabase>) {
  const app = express();

  // --- Middleware ---
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // --- Static files (frontend SPA) ---
  const publicDir = path.join(process.cwd(), 'src', 'frontend');
  app.use(express.static(publicDir));

  // --- Health check ---
  app.get('/api/v1/health', (_req, res) => {
    // Quick DB probe: ensure we can query
    try {
      const row = db.prepare('SELECT 1 AS ok').get() as { ok: number } | undefined;
      const dbOk = row?.ok === 1;
      res.json({
        status: dbOk ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        database: dbOk ? 'connected' : 'error',
      });
    } catch {
      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
      });
    }
  });

  // --- Error handling (must be last) ---
  app.use(errorHandler);

  return app;
}

/* ------------------------------------------------------------------ */
/* Server bootstrap (only when run directly)                           */
/* ------------------------------------------------------------------ */

const PORT = parseInt(process.env.PORT ?? '3000', 10);

// Only start listening when this file is the entry point (not imported in tests)
const isMainModule =
  typeof process.argv[1] === 'string' &&
  (process.argv[1].endsWith('src/server/index.ts') ||
    process.argv[1].endsWith('dist/server/index.js'));

if (isMainModule) {
  const db = initDatabase();
  const app = createApp(db);

  const server = app.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`);
    console.log(`[server] health check → http://localhost:${PORT}/api/v1/health`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n[server] shutting down…');
    server.close(() => {
      closeDatabase(db);
      console.log('[server] closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
