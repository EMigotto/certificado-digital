# C7. API REST e CLI - Infrastructure Requirements

This document tracks persistent infrastructure resources required for this feature. All items start with status `NEEDS_HUMAN_CONFIRMATION` until approved.

---

## Database: ServiceToken Table

- **Status**: NEEDS_HUMAN_CONFIRMATION
- **Kind**: PostgreSQL Table
- **Reason**: Service tokens must be stored persistently to validate incoming API requests. Each token requires storage of hashed token value (SHA-256), scopes, creation/expiration dates, and revocation status.
- **Proposed**: 
  - PostgreSQL 16 (existing database connection in app)
  - Table: `service_tokens`
  - Columns:
    - `id` (UUID primary key)
    - `name` (varchar, human-readable label)
    - `token_hash` (varchar(64), indexed, stores SHA-256 hex hash of actual token)
    - `token_preview` (varchar(8), last 4 chars of token for display)
    - `scopes` (text array, stores ["cert:read", "cert:create", ...])
    - `created_at` (timestamp with timezone)
    - `expires_at` (timestamp with timezone, indexed)
    - `revoked_at` (timestamp with timezone, nullable)
    - `revocation_reason` (text, nullable)
    - `last_used_at` (timestamp with timezone, nullable)
    - `created_by` (varchar, actor who created the token)
    - Indexes: `(token_hash)` UNIQUE, `(expires_at)`, `(name)`
- **Alternative-existing**: No similar token/API-key table exists in the current schema
- **Migration script (planned)**: `backend/prisma/migrations/20260603000001_create_service_tokens/migration.sql`

---

## Database: Policy Table

- **Status**: NEEDS_HUMAN_CONFIRMATION
- **Kind**: PostgreSQL Table
- **Reason**: Certificate policies define governance rules (allowed key sizes, validity periods, required fields, allowed organizations). The PRD requires GET /api/policies and GET /api/policies/:id endpoints. Policies must be stored in the database for querying.
- **Proposed**:
  - PostgreSQL 16 (existing database connection in app)
  - Table: `policies`
  - Columns:
    - `id` (UUID primary key)
    - `name` (varchar, unique)
    - `description` (text, nullable)
    - `environment` (Environment enum, nullable — null means all environments)
    - `min_key_size` (int, default 2048)
    - `max_validity_days` (int, default 365)
    - `allowed_key_types` (text array, default ["RSA"])
    - `allowed_org_names` (text array, default [])
    - `required_fields` (text array, default [])
    - `rules` (jsonb, default {})
    - `created_at` (timestamp with timezone)
    - `updated_at` (timestamp with timezone)
    - Index: `(name)` UNIQUE, `(environment)`
- **Alternative-existing**: No policy table exists; `zone` is stored as a plain string on Certificate
- **Migration script (planned)**: `backend/prisma/migrations/20260603000002_create_policies_zones/migration.sql`

---

## Database: Zone Table

- **Status**: NEEDS_HUMAN_CONFIRMATION
- **Kind**: PostgreSQL Table
- **Reason**: Zones define organizational divisions for certificate management. The PRD requires GET /api/zones and GET /api/zones/:id endpoints. Zones must be stored in the database for querying.
- **Proposed**:
  - PostgreSQL 16 (existing database connection in app)
  - Table: `zones`
  - Columns:
    - `id` (UUID primary key)
    - `name` (varchar, unique)
    - `description` (text, nullable)
    - `region` (varchar, nullable)
    - `metadata` (jsonb, default {})
    - `created_at` (timestamp with timezone)
    - `updated_at` (timestamp with timezone)
    - Index: `(name)` UNIQUE
- **Alternative-existing**: `zone` field on Certificate is a plain string; no Zone table exists
- **Migration script (planned)**: `backend/prisma/migrations/20260603000002_create_policies_zones/migration.sql` (same migration as Policy)

---

## CLI Tool: GitHub Release Pipeline

- **Status**: NEEDS_HUMAN_CONFIRMATION
- **Kind**: GitHub Actions Workflow (for multi-platform binary releases)
- **Reason**: CLI must be distributed as pre-built binaries for Linux, macOS, and Windows. GitHub Actions can build and create releases automatically on version tags.
- **Proposed**:
  - Workflow file: `.github/workflows/cli-release.yml`
  - Builds CLI from `cli/` workspace package
  - Targets: `linux-x64`, `linux-arm64`, `macos-x64`, `macos-arm64`, `windows-x64`
  - Publishes to GitHub Releases as `.tar.gz` and `.zip` artifacts
  - Triggered on tags matching `cli-v*`
- **Alternative-existing**: Only `ci.yml` exists; no release pipeline
- **Migration script (planned)**: `.github/workflows/cli-release.yml` (configuration, not DDL)

---

## Application: OpenAPI Specification Plugin

- **Status**: NEEDS_HUMAN_CONFIRMATION
- **Kind**: Application Resource (Fastify Plugin — no persistent infrastructure)
- **Reason**: OpenAPI 3.0.0 spec generated from Fastify route definitions. Must be served at `/api/docs` (Swagger UI) and `/api/docs/openapi.json` (JSON spec).
- **Proposed**:
  - npm packages: `@fastify/swagger`, `@fastify/swagger-ui`
  - Plugin file: `backend/src/plugins/openapi.ts`
  - Served at: `/api/docs` (HTML), `/api/docs/openapi.json` (JSON)
  - No persistent storage required; generated on-the-fly at app startup
- **Alternative-existing**: No OpenAPI support currently in the Fastify configuration
- **Migration script (planned)**: N/A (application code only)

---

## Application: Token Authentication Middleware

- **Status**: NEEDS_HUMAN_CONFIRMATION
- **Kind**: Application Middleware (Fastify Plugin — no persistent infrastructure)
- **Reason**: All protected endpoints require verification of Bearer token from Authorization header. Uses SHA-256 hash + DB lookup approach (see ADR §3.1).
- **Proposed**:
  - Plugin file: `backend/src/plugins/auth.ts`
  - Custom implementation using Node.js `crypto.createHash('sha256')`
  - No additional npm packages required (uses native crypto)
  - Public endpoints (skip auth): `/health`, `/api/docs`, `/api/docs/openapi.json`
  - ENV var: `AUTH_SKIP_UI=true` to allow unauthenticated UI requests during transition
- **Alternative-existing**: No auth middleware currently exists
- **Migration script (planned)**: N/A (application code only)

---

## Summary Table

| Resource | Kind | Status | Approval Pending |
|----------|------|--------|-----------------|
| ServiceToken Table | PostgreSQL Table | NEEDS_HUMAN_CONFIRMATION | Yes |
| Policy Table | PostgreSQL Table | NEEDS_HUMAN_CONFIRMATION | Yes |
| Zone Table | PostgreSQL Table | NEEDS_HUMAN_CONFIRMATION | Yes |
| CLI Release Pipeline | GitHub Actions | NEEDS_HUMAN_CONFIRMATION | Yes |
| OpenAPI Plugin | Fastify Plugin (app code) | NEEDS_HUMAN_CONFIRMATION | Yes |
| Token Auth Middleware | Fastify Plugin (app code) | NEEDS_HUMAN_CONFIRMATION | Yes |

---

## Next Steps

1. Human reviews each resource proposal
2. For each resource, human responds in the task chat with:
   - **"approved"** → Agent proceeds to implement (updates Status to "created", adds migration script path)
   - **"use existing <name>"** → Agent uses existing resource instead
   - **"redesign: <spec>"** → Agent revises proposal and re-submits for approval
3. Once all resources are approved, agent creates migrations/configurations and commits to Homologacao
