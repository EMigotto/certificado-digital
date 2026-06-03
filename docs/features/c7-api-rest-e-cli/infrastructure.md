# C7. API REST e CLI - Infrastructure Requirements

This document tracks persistent infrastructure resources required for this feature. All items start with status `NEEDS_HUMAN_CONFIRMATION` until approved.

---

## Database: ServiceToken Table

- **Status**: NEEDS_HUMAN_CONFIRMATION
- **Kind**: PostgreSQL Table
- **Reason**: Service tokens must be stored persistently to validate incoming API requests. Each token requires storage of hashed token value, scopes, creation/expiration dates, and revocation status.
- **Proposed**: 
  - PostgreSQL 16 (existing database connection in app)
  - Table: `service_tokens`
  - Columns:
    - `id` (UUID primary key)
    - `name` (varchar, indexed)
    - `token_hash` (varchar, indexed, stores bcrypt hash of actual token)
    - `scopes` (text array, stores ["cert:read", "cert:create", ...])
    - `created_at` (timestamp with timezone)
    - `expires_at` (timestamp with timezone, indexed)
    - `revoked_at` (timestamp with timezone, nullable)
    - `revocation_reason` (text, nullable)
    - `last_used_at` (timestamp with timezone, nullable)
    - `user_id` (UUID, foreign key to users table)
    - Indexes: `(expires_at)`, `(revoked_at)`, `(token_hash)`, `(user_id)`
- **Alternative-existing**: Check if a similar tokens table already exists for session tokens or API keys
- **Migration script (planned)**: `backend/prisma/migrations/<YYYYMMDD>_create_service_tokens.sql`

---

## CLI Tool: GitHub Release Pipeline

- **Status**: NEEDS_HUMAN_CONFIRMATION
- **Kind**: GitHub Actions Workflow (for multi-platform binary releases)
- **Reason**: CLI must be distributed as pre-built binaries for Linux, macOS, and Windows. GitHub Actions can build, sign, and create releases automatically on version tags.
- **Proposed**:
  - Workflow file: `.github/workflows/cli-release.yml`
  - Builds CLI from `backend/cli/` (or separate `cli/` package)
  - Targets: `linux-x64`, `linux-arm64`, `macos-x64`, `macos-arm64`, `windows-x64`
  - Publishes to GitHub Releases as `.tar.gz` and `.zip` artifacts
  - Optional: Notarization for macOS (requires Apple Developer account)
- **Alternative-existing**: Check if release pipeline already exists in `.github/workflows/`
- **Migration script (planned)**: `.github/workflows/cli-release.yml` (configuration, not DDL)

---

## Documentation: OpenAPI Specification

- **Status**: NEEDS_HUMAN_CONFIRMATION
- **Kind**: Application Resource (Fastify @fastify/swagger)
- **Reason**: OpenAPI 3.0.0 spec generated from Fastify route definitions using `@fastify/swagger` plugin. Must be served at `/api/docs` (Swagger UI) and `/api/docs/openapi.json` (JSON spec).
- **Proposed**:
  - Fastify plugins: `@fastify/swagger` (schema generation), `@fastify/swagger-ui` (web UI)
  - Schema definitions: Inline in route handlers or centralized in `backend/src/schemas/`
  - Served at: `/api/docs` (HTML), `/api/docs/openapi.json` (JSON)
  - No persistent storage required; generated on-the-fly from app startup
- **Alternative-existing**: Check if OpenAPI support already exists in Fastify config
- **Migration script (planned)**: `backend/src/plugins/openapi.ts` (plugin setup)

---

## Token Authentication Middleware

- **Status**: NEEDS_HUMAN_CONFIRMATION
- **Kind**: Application Middleware (Fastify)
- **Reason**: All protected endpoints require verification of Bearer token from `Authorization` header. Middleware must:
  1. Extract token from request header
  2. Validate token signature (if signed) or lookup in database
  3. Check expiration date
  4. Check revocation status
  5. Verify requested operation matches token scopes
  6. Attach token metadata to request object for logging/audit
- **Proposed**:
  - Middleware file: `backend/src/plugins/auth.ts`
  - Uses `jsonwebtoken` (HS256 signing) or database lookup
  - Registers as Fastify plugin with `@fastify/jwt` or custom implementation
  - Public endpoints: `/health`, `/api/docs`, `/api/docs/openapi.json`, `/login`, `/logout`, `/register`
- **Alternative-existing**: Check if Fastify auth plugin or middleware already exists for session auth
- **Migration script (planned)**: `backend/src/plugins/auth.ts` (plugin setup)

---

## Summary Table

| Resource | Kind | Status | Approval Pending |
|----------|------|--------|-----------------|
| ServiceToken Table | PostgreSQL | NEEDS_HUMAN_CONFIRMATION | Yes |
| CLI Release Pipeline | GitHub Actions | NEEDS_HUMAN_CONFIRMATION | Yes |
| OpenAPI Documentation | Fastify Plugin | NEEDS_HUMAN_CONFIRMATION | Yes |
| Token Auth Middleware | Fastify Plugin | NEEDS_HUMAN_CONFIRMATION | Yes |

---

## Next Steps

1. Human reviews each resource proposal
2. For each resource, human responds in the task chat with:
   - **"approved"** → Agent proceeds to implement (updates Status to "created", adds migration script path)
   - **"use existing <name>"** → Agent uses existing resource instead
   - **"redesign: <spec>"** → Agent revises proposal and re-submits for approval
3. Once all resources are approved, agent creates migrations/configurations and commits to Homologacao
