# ADR: C7 — REST API & CLI Tool

**Feature ID**: C7  
**Slug**: `c7-api-rest-e-cli`  
**Status**: Proposed  
**Date**: 2026-06-03  
**Deciders**: Tech Lead  
**Parent Issue**: #0

---

## 1. Context

The Certificado Digital platform currently exposes certificate management operations exclusively through the Web UI. All interactions—listing, importing, viewing, revoking—require a browser session. This blocks three high-value use cases:

- **CI/CD automation**: Pipelines cannot issue, renew, or download certificates without manual UI interaction.
- **System integration**: External platforms (IaC tools, secret managers, monitoring systems) cannot call the platform programmatically.
- **Scriptable workflows**: SREs and DevOps engineers cannot write bulk-management scripts for certificate lifecycle operations.

Feature C7 addresses these gaps by delivering:

1. A **complete REST API** with OpenAPI documentation, covering certificates, CSR generation, renewals, revocations, policies, and zones.
2. **Service token authentication** with scoped permissions for machine-to-machine access.
3. A **cross-platform CLI tool** that wraps the API for command-line workflows.

### Constraints & Inputs

| Input | Detail |
|-------|--------|
| PRD | `docs/features/c7-api-rest-e-cli/prd.md` — 11 functional areas, 10 CLI commands |
| Acceptance Criteria | `docs/features/c7-api-rest-e-cli/acceptance-criteria.md` — 13 features, 60+ Gherkin scenarios |
| Prototype | `docs/features/c7-api-rest-e-cli/prototype.html` — Token management UI |
| Infrastructure | `docs/features/c7-api-rest-e-cli/infrastructure.md` — 4 resources pending approval |
| CLAUDE.md | Stack: React 19, Vite, Fastify 5, Prisma, PostgreSQL 16, npm workspaces |

### What Already Exists

- **Database**: `Certificate` model (30+ fields), `AuditEntry` model, enums (`CertStatus`, `Environment`, `ImportSource`, `AuditAction`)
- **Backend routes**: `GET /api/certificates`, `GET /api/certificates/:id`, `GET /api/certificates/:id/export/:format`, `DELETE /api/certificates/:id` (soft-delete), `GET /api/meta/filters`, `/api/import/*`, `/api/audit/*`, `GET /health`
- **Backend services**: `CertificateService` (list, detail, export, soft-delete), `AuditService`, `ImportService`
- **No authentication**: All routes are currently open (no auth middleware)
- **No POST/PATCH for certificates**: Creation is only via file upload/CSV import; no JSON-body create or update
- **No CSR generation**: `node-forge` is a dependency (used for cert parsing) but no CSR route exists
- **No Policy/Zone models**: `zone` is a string field on Certificate; no Policy or Zone tables
- **No CLI**: No command-line tooling exists

---

## 2. Decision Drivers

1. **API-first**: Design all endpoints with OpenAPI schemas first, then implement. The spec becomes the contract for both CLI and future integrations.
2. **Security by default**: Every non-public endpoint requires a valid, non-expired, non-revoked service token with the correct scope. No exceptions.
3. **Backward compatibility**: Existing UI-driven routes (`/api/certificates GET`, `DELETE`, export) must continue to work. Auth middleware must support both session-based (future) and token-based auth without breaking the frontend.
4. **Monorepo consistency**: CLI is a new npm workspace package in the same monorepo, sharing types from `@certificado-digital/shared` and built with the same TypeScript/ESM toolchain.
5. **Minimal new dependencies**: Prefer extending existing libraries (node-forge for CSR, Fastify plugin system for auth/swagger) over adding heavy new frameworks.
6. **Incremental delivery**: Each chunk is independently testable and deployable. Token auth can be wired up without changing existing UI behavior.

---

## 3. Architectural Decisions

### 3.1 Service Token Design

**Decision**: Hash-based tokens stored in PostgreSQL, validated per-request via database lookup.

**Token format**: `st_<44-char-base64url-random>` (prefix `st_` identifies token type; 32 bytes of `crypto.randomBytes` encoded as base64url = 44 chars).

**Storage**: SHA-256 hash of the full token stored in `service_tokens.token_hash`. The raw token is returned to the user exactly once (at creation) and never stored or logged in plaintext.

**Validation flow**:
1. Extract `Bearer <token>` from `Authorization` header
2. Compute `SHA-256(token)` → lookup in `service_tokens` by `token_hash`
3. Check `expires_at > now()` and `revoked_at IS NULL`
4. Check that token's `scopes` array includes the required scope for the endpoint
5. Attach token metadata to `request.tokenAuth` for downstream logging/audit

**Why not JWT?**
- Service tokens must be revocable (JWT requires a blocklist or short expiry + refresh, adding complexity).
- Database lookup is acceptable for API traffic patterns (not user-session scale).
- SHA-256 hashing is fast (~µs) and the `token_hash` column is indexed.
- Simpler implementation: no key rotation, no signing algorithm configuration.

**Why SHA-256 instead of bcrypt for storage?**
- Token is 32 bytes of random data (high entropy), so brute-force resistance of bcrypt is unnecessary.
- SHA-256 allows O(1) indexed lookup on `token_hash`; bcrypt would require loading all tokens and comparing one-by-one.
- Industry precedent: GitHub, Stripe, and Slack all use SHA-256 for high-entropy API token storage.

**Alternatives considered**:
| Alternative | Rejected because |
|-------------|-----------------|
| JWT tokens (HS256/RS256) | Revocation requires blocklist; adds complexity without benefit for long-lived service tokens |
| OAuth2 client credentials | Over-engineered for MVP; no need for authorization server |
| bcrypt-hashed tokens | Cannot index for lookup; O(n) scan per request |

### 3.2 Scope Enforcement

**Decision**: Fastify `preHandler` hook registered as a plugin.

Each route declares its required scope in the route options schema. The auth plugin reads the scope from the route config and validates it against the token's `scopes` array.

```typescript
// Example route registration
server.get('/api/certificates', {
  config: { requiredScope: 'cert:read' },
  handler: async (request, reply) => { ... }
});
```

**Public routes** (`/health`, `/api/docs`, `/api/docs/openapi.json`) are whitelisted in the plugin and skip auth.

**Frontend compatibility**: During the transition period, if no `Authorization` header is present and the request comes from a browser origin (checked via `Referer` or `Origin` header matching `CORS_ORIGIN`), the middleware can optionally pass through to support the existing UI. This is controlled by an env var `AUTH_SKIP_UI=true` (default: `true` in dev/HML, `false` in production once UI auth is implemented).

### 3.3 OpenAPI / Swagger

**Decision**: Use `@fastify/swagger` + `@fastify/swagger-ui` with Fastify's native JSON Schema route definitions.

- OpenAPI 3.0.0 spec auto-generated from route schemas.
- Swagger UI served at `/api/docs`.
- Raw JSON spec at `/api/docs/openapi.json`.
- All request/response types defined as JSON Schema in route options (Fastify's native approach).

**Why not `@fastify/type-provider-zod`?**
- The existing codebase uses Zod only for env config validation, not for route schemas.
- Fastify's native JSON Schema is more performant (compiled by Ajv) and generates OpenAPI directly.
- Adding `@fastify/type-provider-zod` would require refactoring all existing routes; JSON Schema is additive.

**Alternatives considered**:
| Alternative | Rejected because |
|-------------|-----------------|
| Manually written OpenAPI YAML | Out of sync with code; no compile-time validation |
| `@fastify/type-provider-zod` | Requires refactoring existing routes; less performant than Ajv |
| Redoc instead of Swagger UI | Swagger UI has better "try it out" support for API testing |

### 3.4 New Certificate Endpoints (POST, PATCH, Renew, Revoke)

**Decision**: Extend the existing `certificateRoutes` plugin and `CertificateService` class.

**POST /api/certificates**: Accepts a JSON body with certificate metadata (no file upload—that stays on `/api/import`). Creates a new Certificate record with `importSource: 'API_SYNC'`. Requires `cert:create` scope.

**PATCH /api/certificates/:id**: Accepts partial update payload. Updates `tags`, `customFields`, `description`, `owner`, `team`, `application`, `zone`. Does NOT update cryptographic or validity fields (those are immutable). Requires `cert:update` scope.

**POST /api/certificates/:id/renew**: Creates a new certificate record based on the original, with updated validity dates. Original cert's metadata (owner, team, application, tags) is preserved. Returns 409 if cert is revoked or not within 90 days of expiry. Requires `cert:renew` scope.

**POST /api/certificates/:id/revoke**: Sets `revoked=true`, `revokedAt`, `revocationReason`. Validated reasons: `superseded`, `compromised`, `cessationOfOperation`, `certificateHold`. Returns 409 if already revoked. Requires `cert:revoke` scope.

These endpoints reuse the existing `CertificateRepository` (extended with `create`, `update` methods) and `mapToApiCertificate` helper.

### 3.5 CSR Generation

**Decision**: Use `node-forge` (already a dependency) for CSR and key pair generation.

The `POST /api/csr` endpoint generates an RSA key pair and CSR on the server and returns all three PEM strings (CSR, private key, public key) in the response. Key sizes restricted to 2048 or 4096 bits. Signature algorithm defaults to SHA-256.

**Security note**: Private keys are generated, returned once, and NOT stored. The response is not logged. This matches industry practice for CSR-as-a-service tools.

**Why not WebCrypto / native Node.js `crypto`?**
- `node-forge` is already a dependency and provides a complete CSR builder with X.509 subject fields.
- Node.js `crypto.generateKeyPairSync` can generate keys but does not build CSR with subject DN fields.
- `node-forge` has a well-tested `pki.createCertificationRequest()` API.

### 3.6 Policy & Zone Models

**Decision**: New Prisma models `Policy` and `Zone` with read-only API endpoints.

Policies define governance rules (allowed key sizes, validity periods, required org fields, allowed environments). Zones define organizational divisions for certificate grouping.

Both are read-only in this feature (no create/update/delete API). Data is populated via Prisma seed or direct DB operations by admins. Future features may add management endpoints.

**Schema design**:

```
model Policy {
  id              String   @id @default(uuid())
  name            String   @unique
  description     String?
  environment     Environment?
  minKeySize      Int      @default(2048)
  maxValidityDays Int      @default(365)
  allowedKeyTypes String[] @default(["RSA"])
  allowedOrgNames String[] @default([])
  requiredFields  String[] @default([])
  rules           Json     @default("{}") @db.JsonB
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model Zone {
  id          String   @id @default(uuid())
  name        String   @unique
  description String?
  region      String?
  metadata    Json     @default("{}") @db.JsonB
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### 3.7 CLI Architecture

**Decision**: New `cli/` workspace package using `commander.js` for command parsing, bundled with `esbuild` and compiled to standalone binaries with `pkg`.

**Package structure**:
```
cli/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # Entry point, commander program
│   ├── config.ts         # Config file + env var + flag resolution
│   ├── client.ts         # HTTP client (axios or fetch wrapper)
│   ├── output.ts         # Table / JSON / YAML / CSV formatters
│   └── commands/
│       ├── certs.ts      # certs list/get/create/update/delete/export/renew/revoke
│       ├── csr.ts        # csr generate
│       ├── policy.ts     # policy list/get
│       ├── zone.ts       # zone list/get
│       ├── token.ts      # token create/list/revoke
│       └── config.ts     # config set/get
```

**Config resolution order** (last wins):
1. Config file: `~/.certificado/config.yaml`
2. Environment variables: `CERTIFICADO_API_URL`, `CERTIFICADO_TOKEN`, `CERTIFICADO_TIMEOUT`
3. CLI flags: `--api-url`, `--token`, `--timeout`

**Output formats**: `--format table` (default, human-readable), `--format json`, `--format yaml`, `--format csv` (list commands only).

**Binary distribution**: GitHub Actions workflow builds binaries for `linux-x64`, `linux-arm64`, `macos-x64`, `macos-arm64`, `windows-x64` on version tags. Published as GitHub Release assets.

**Why `commander.js`?**
- Lightweight (~50KB), well-maintained, TypeScript-friendly.
- Automatic help generation, option parsing, subcommand support.
- Used by hundreds of popular CLIs (Vue CLI, Create React App, etc.).

**Alternatives considered**:
| Alternative | Rejected because |
|-------------|-----------------|
| `oclif` | Heavy framework (800+ deps); overkill for 6 command groups |
| `yargs` | API is more complex; commander is simpler for subcommand-based CLIs |
| Go binary | Different language from monorepo; harder to share types |
| `tsx` script (no binary) | Requires Node.js installed; not suitable for distribution |

### 3.8 Frontend Token Management Page

**Decision**: New page at `/tokens` route, following existing page patterns (lazy-loaded, Layout wrapper, TanStack Query hooks).

The page provides a UI for:
- Creating tokens (name, scopes selection, expiry)
- Listing active tokens (name, scopes, created/expires dates, masked value)
- Revoking tokens

This mirrors the existing patterns in `InventoryPage`, `AuditLogPage`, etc. Uses existing components: `Button`, `Modal`, `Badge`, `Toast`, `Table` patterns.

---

## 4. Data Flow

### API Request Flow (Token Auth)

```
Client → Authorization: Bearer st_xxx
  → Fastify preHandler hook (auth plugin)
    → SHA-256(token) → DB lookup on service_tokens.token_hash
      → Check expires_at, revoked_at, scopes
        → 401 if invalid/expired/revoked
        → 403 if insufficient scope
        → Attach token metadata to request
          → Route handler executes
            → Response returned
```

### CLI Command Flow

```
User → certificado-cli certs list --filter-status EXPIRING_SOON
  → Config resolution (file → env → flags)
    → HTTP client sends GET /api/certificates?filter[status]=EXPIRING_SOON
      → Authorization: Bearer <resolved-token>
        → API responds with PaginatedResponse
          → Output formatter renders table/json/yaml/csv
            → stdout
```

---

## 5. Consequences

### Positive

- **Full automation**: CI/CD pipelines can issue, renew, revoke, and download certificates without UI.
- **Self-documenting API**: OpenAPI spec ensures all integrations have up-to-date documentation.
- **Security model**: Scoped tokens follow principle of least privilege; tokens are revocable instantly.
- **Consistent toolchain**: CLI shares TypeScript types with backend/frontend via `@certificado-digital/shared`.
- **Backward compatible**: Existing UI routes continue to work during transition.

### Negative

- **Token management overhead**: Service tokens must be provisioned, rotated, and revoked. Adds operational burden.
- **Database load**: Every API request triggers a DB lookup for token validation. Mitigated by indexed `token_hash` column.
- **CLI binary size**: Node.js/pkg binaries are larger (~40-50MB) than Go binaries (~10MB). Acceptable per PRD metrics (< 50MB).
- **No rate limiting**: MVP does not include per-token rate limiting. Must be added before production scale.

### Risks

| Risk | Mitigation |
|------|-----------|
| Token leakage in CI logs | Document `--token` flag as dangerous; recommend env vars or config files |
| Stale OpenAPI spec | Spec is auto-generated from route schemas; cannot drift from implementation |
| CSR private key exposure | Keys returned once, never stored; response not logged; HTTPS required |
| Policy/Zone data management | Seed data for MVP; admin CRUD in future feature |

---

## 6. Acceptance Criteria Mapping

| Feature | AC Scenarios | Covered by Chunk(s) |
|---------|-------------|---------------------|
| F1: OpenAPI/Swagger | 5 scenarios | Chunk 2 |
| F2: Service Token Auth | 10 scenarios | Chunks 1, 3, 4 |
| F3: Certificate CRUD | 12 scenarios | Chunks 5, 6 |
| F4: CSR Generation | 6 scenarios | Chunk 7 |
| F5: Renewal | 6 scenarios | Chunk 6 |
| F6: Revocation | 4 scenarios | Chunk 6 |
| F7: Policies | 4 scenarios | Chunks 1, 8 |
| F8: Zones | 3 scenarios | Chunks 1, 8 |
| F9: CLI Install/Config | 5 scenarios | Chunk 10 |
| F10: CLI Cert Commands | 9 scenarios | Chunk 10 |
| F11: CLI CSR Commands | 4 scenarios | Chunk 11 |
| F12: CLI Policy/Zone | 4 scenarios | Chunk 11 |
| F13: E2E CI/CD | 3 scenarios | Chunk 12 |

---

## 7. Dependencies Between Chunks

```
Chunk 1 (DB schema)
  ├─→ Chunk 3 (Token CRUD) ─→ Chunk 4 (Auth middleware)
  │                               ├─→ Chunk 5 (Cert POST/PATCH)
  │                               ├─→ Chunk 6 (Cert renew/revoke)
  │                               ├─→ Chunk 7 (CSR endpoint)
  │                               └─→ Chunk 8 (Policy/Zone endpoints)
  │
  └─→ Chunk 8 (Policy/Zone - needs tables)

Chunk 2 (OpenAPI) ─── independent, can be done in parallel with Chunk 1

Chunk 9 (Frontend token UI) ─→ depends on Chunk 3

Chunk 10 (CLI scaffold + cert commands) ─→ depends on Chunks 4-6
Chunk 11 (CLI CSR/policy/zone/token) ─→ depends on Chunks 7-8, 10

Chunk 12 (E2E integration test) ─→ depends on all previous chunks
```
