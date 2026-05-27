# CLAUDE.md — Project Guide for AI Agents

## Project Overview

**Certificado Digital** is a centralized certificate inventory management system for mTLS certificates. It is a full-stack TypeScript monorepo.

## Architecture

- **Monorepo**: npm workspaces with `frontend/`, `backend/`, `shared/` packages.
- **Frontend**: React 19 SPA with Vite, TanStack Query/Table, Zustand, React Hook Form + Zod.
- **Backend**: Fastify 5 REST API with Prisma ORM, node-forge for cert parsing, PapaParse for CSV.
- **Shared**: TypeScript types-only package consumed by both frontend and backend.
- **Database**: PostgreSQL 16 (Docker Compose for local dev).
- **Testing**: Vitest for unit/integration tests, Testing Library + MSW for frontend.

## Commands

```bash
npm install          # Install all workspace dependencies
npm run dev          # Start frontend (Vite :5173) + backend (Fastify :3000)
npm run build        # Build all workspaces
npm run lint         # ESLint check
npm run lint:fix     # ESLint auto-fix
npm run format       # Prettier check
npm run format:fix   # Prettier auto-fix
npm run type-check   # TypeScript type-check (all workspaces)
npm run test         # Run tests (all workspaces)
```

## Conventions

- **Language**: TypeScript strict mode everywhere.
- **Linting**: ESLint + @typescript-eslint + Prettier.
- **Module format**: ESM (`"type": "module"` in all packages).
- **Import aliases**: Frontend uses `@/` → `src/` via Vite and tsconfig paths.
- **Environment config**: Backend uses Zod schema validation for env vars (see `backend/src/config.ts`).
- **Shared types**: All domain types live in `shared/types/index.ts`. Import from `@certificado-digital/shared`.

## Key Decisions

1. **npm workspaces** over Turborepo/Nx for simplicity in this MVP.
2. **Fastify 5** for backend (performance, TypeScript-first, plugin system).
3. **Prisma** for database ORM (type-safe queries, migrations).
4. **PostgreSQL** (not SQLite) for production-readiness and concurrency support.
5. **Vite** for frontend dev server and build tooling.
6. **Zod** shared between frontend (form validation) and backend (API validation).

## File Naming

- Components: `PascalCase.tsx`
- Utilities/hooks: `camelCase.ts`
- Types: defined in `shared/types/`, re-exported from `index.ts`
- Tests: co-located as `*.test.ts` / `*.test.tsx`

## CI

GitHub Actions pipeline (`.github/workflows/ci.yml`) runs on push to `main` and PRs:
1. Install dependencies
2. Lint
3. Type-check
4. Test
5. Build
