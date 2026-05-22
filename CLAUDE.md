# CLAUDE.md — certificado-digital

## Project Overview
mTLS Control Plane — Certificate Lifecycle Manager. A Node.js/TypeScript web application managing certificate inventory, import (PEM/PKCS#12/CSV), CRUD operations, audit logging, and dashboard analytics.

## Architecture
- **Backend**: Express.js + TypeScript (ESM), SQLite via better-sqlite3
- **Frontend**: Vanilla TypeScript SPA with esbuild bundling
- **Database**: SQLite with WAL mode. Schema in `src/server/db.ts`
- **Tests**: Vitest (unit), Playwright (e2e)

## Key Directories
```
src/server/           — Express server
  db.ts               — DB init, schema DDL
  index.ts            — App factory, route mounting
  routes/             — Route modules (certificates, audit, dashboard)
  services/           — Business logic (import, certificate, audit, dashboard, export)
  middleware/          — Error handler, multer upload config
src/frontend/         — SPA source (HTML + TS + CSS)
src/models/           — Shared type definitions (certificate, filters, pagination)
tests/unit/           — Vitest unit tests
tests/e2e/            — Playwright e2e tests
docs/features/c3/     — PRD, ADR, prototypes
```

## Commands
| Command             | Description                          |
|---------------------|--------------------------------------|
| `npm install`       | Install dependencies                 |
| `npm test`          | Run unit tests (vitest)              |
| `npm run test:coverage` | Unit tests with coverage        |
| `npm run test:e2e`  | Run Playwright e2e tests             |
| `npm run build`     | TypeScript compile (tsc)             |
| `npm run dev`       | Dev server with tsx watch            |
| `npm start`         | Production server                    |
| `npx tsc --noEmit`  | Type-check without emitting          |

## Key Conventions
- TypeScript strict mode, ESM (`"type": "module"`)
- All imports use `.js` extension (ESM resolution)
- Database functions: `initDatabase()` (with path), `createDatabase()` (alias, defaults to `:memory:`)
- Audit logging via `audit-service.ts` → `auditService.log()`
- Two certificate-service APIs: class-based `CertificateService` (CRUD/search) and standalone functions (`updateCertificate`, `deleteCertificate`, `getCertificateById`)
- CSV import: async `importCsv()` with callback, sync `importCsvContent()` with DB

## Git Conventions
- Branch pattern: `feat/c3/<chunk-number>-impl`
- Integration branch: `feat/c3/integration`
- Commit signing disabled
