# Certificado Digital — Inventário Centralizado

Centralized certificate inventory management system for mTLS certificates.

## Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **Docker & Docker Compose** (for PostgreSQL)
- **npm** ≥ 9

### 1. Clone & Install

```bash
git clone https://github.com/EMigotto/certificado-digital.git
cd certificado-digital
npm install
```

### 2. Start the Database

```bash
docker-compose up -d
```

This starts a PostgreSQL 16 instance on `localhost:5432` with:
- **User:** `certdigital`
- **Password:** `certdigital`
- **Database:** `certdigital`

### 3. Run in Development

```bash
npm run dev
```

This starts:
- **Frontend** (Vite) → `http://localhost:5173`
- **Backend** (Fastify) → `http://localhost:3000`

The frontend proxies `/api` requests to the backend automatically.

### 4. Health Check

```bash
curl http://localhost:3000/health
# → { "status": "ok", "timestamp": "..." }
```

## Available Scripts

| Command              | Description                               |
|----------------------|-------------------------------------------|
| `npm run dev`        | Start frontend + backend in dev mode      |
| `npm run build`      | Build all workspaces                      |
| `npm run lint`       | Run ESLint across the project             |
| `npm run lint:fix`   | Auto-fix lint issues                      |
| `npm run format`     | Check formatting with Prettier            |
| `npm run format:fix` | Auto-format files                         |
| `npm run type-check` | TypeScript type-checking (all workspaces) |
| `npm run test`       | Run tests (all workspaces)                |
| `npm run clean`      | Remove all `node_modules` directories     |

## Project Structure

```
certificado-digital/
├── frontend/           # React SPA (Vite, TanStack, Zustand)
│   ├── src/
│   │   └── main.tsx    # React root mount
│   ├── index.html      # Vite entry point
│   ├── vite.config.ts  # Path aliases, proxy to backend
│   ├── tsconfig.json
│   └── package.json
├── backend/            # Fastify API server
│   ├── src/
│   │   ├── server.ts   # Fastify bootstrap + plugin registration
│   │   └── config.ts   # Validated environment variables
│   ├── tsconfig.json
│   └── package.json
├── shared/             # Shared types (consumed by frontend & backend)
│   ├── types/
│   │   └── index.ts    # Domain type definitions
│   ├── tsconfig.json
│   └── package.json
├── docker-compose.yml  # PostgreSQL 16 for local dev
├── tsconfig.base.json  # Shared TypeScript config
├── .eslintrc.cjs       # Root ESLint configuration
├── .prettierrc         # Prettier configuration
├── .github/workflows/
│   └── ci.yml          # CI pipeline (lint, type-check, test, build)
└── package.json        # npm workspaces root
```

## Tech Stack

| Layer        | Technology                                                  |
|--------------|-------------------------------------------------------------|
| **Frontend** | React 19, Vite 6, TanStack Query/Table, Zustand, React Hook Form, Zod |
| **Backend**  | Fastify 5, Prisma, node-forge, PapaParse, Pino             |
| **Database** | PostgreSQL 16                                               |
| **Shared**   | TypeScript types package                                    |
| **Testing**  | Vitest, Testing Library, MSW                                |
| **CI**       | GitHub Actions                                              |

## Environment Variables

| Variable       | Default                                                         | Description           |
|----------------|-----------------------------------------------------------------|-----------------------|
| `DATABASE_URL` | `postgresql://certdigital:certdigital@localhost:5432/certdigital` | PostgreSQL connection |
| `PORT`         | `3000`                                                          | Backend server port   |
| `HOST`         | `0.0.0.0`                                                      | Backend server host   |
| `NODE_ENV`     | `development`                                                   | Environment           |
| `CORS_ORIGIN`  | `http://localhost:5173`                                         | Allowed CORS origin   |
