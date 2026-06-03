# C7. API REST e CLI - Product Requirements Document

## Problem Statement

Currently, all certificate operations in the Certificado Digital system are accessible exclusively through the Web UI. This creates a barrier to automation, integration with external systems, CI/CD pipelines, and developers who prefer command-line workflows.

Certificate management operations—such as issuance, renewal, revocation, policy lookup, and zone management—must be repeatable and scriptable to support:
- Fully automated certificate lifecycle management in CI/CD pipelines
- Integration with infrastructure-as-code (IaC) tools
- Third-party system integrations
- Programmatic access for enterprise automation
- Consistent certificate governance across development and production environments

**Reference**: Venafi vcert CLI provides an industry-standard model for this capability.

## Jobs to Be Done (JTBD)

1. **DevOps Engineer**: "I want to emit and download a certificate from my CI/CD pipeline without manual UI interaction, so that certificate provisioning is fully automated."

2. **Platform SRE**: "I want to write scripts to audit, renew, and revoke certificates in bulk, so that certificate lifecycle is managed programmatically."

3. **Integration Developer**: "I want to call REST endpoints with service token authentication to read and manage certificates, so that I can integrate Certificado Digital with other enterprise systems."

4. **Security Team**: "I want to enforce certificate policies via API, so that I can ensure all provisioned certificates meet compliance requirements."

## Functional Scope

### 1. OpenAPI/Swagger Documentation

- **Deliverable**: Full OpenAPI 3.0.0 specification of all API endpoints.
- **Format**: Served at `/api/docs` and `/api/docs/openapi.json`.
- **Coverage**: All endpoints documented with request/response schemas, authentication, status codes, and examples.
- **Tool**: Use `@fastify/swagger` and `@fastify/swagger-ui` plugins in Fastify.

### 2. Service Token Authentication

**Tokens** are long-lived, scoped API credentials issued to services and CI/CD pipelines.

#### 2.1 Token Issuance (UI)
- UI endpoint: POST `/api/tokens` (authenticated with session/JWT)
- **Fields**:
  - `name`: Human-readable token name (e.g., "CI/CD Pipeline Prod")
  - `scopes`: Array of permission scopes (e.g., `["cert:read", "cert:create", "cert:renew"]`)
  - `expiresIn`: Lifetime in seconds (e.g., 86400 for 24 hours; optional, defaults to 30 days)
- **Response**: Returns a masked token (full value shown only once; cannot be retrieved later)
- **Database**: Tokens stored in a new `ServiceToken` table with hash, scopes, expiration, creation/revocation audit trail

#### 2.2 Token Validation (API)
- All endpoints (except `/health`, `/metrics`, login) require `Authorization: Bearer <token>` header.
- Endpoint validates token signature, expiration, revocation status, and scopes.
- If invalid or expired: return 401 Unauthorized with clear error message.
- Token refresh NOT supported (client must request new token before expiration).

#### 2.3 Scopes
Scope matrix:
| Scope | Operations |
|-------|-----------|
| `cert:read` | GET /api/certificates, GET /api/certificates/:id |
| `cert:create` | POST /api/certificates |
| `cert:update` | PATCH /api/certificates/:id |
| `cert:delete` | DELETE /api/certificates/:id (soft-delete/revoke) |
| `cert:csr` | POST /api/csr |
| `cert:renew` | POST /api/certificates/:id/renew |
| `cert:revoke` | POST /api/certificates/:id/revoke |
| `policy:read` | GET /api/policies, GET /api/policies/:id |
| `zone:read` | GET /api/zones, GET /api/zones/:id |

### 3. Certificate Endpoints (Extended CRUD)

#### 3.1 GET /api/certificates
- **Querystring**: `page`, `limit`, `search`, `filter[status]`, `filter[environment]`, `sort`
- **Auth**: `cert:read` scope
- **Response**: Paginated list of Certificate objects
- **Example**: `GET /api/certificates?page=1&limit=20&filter[status]=EXPIRING_SOON&sort=-notAfter`

#### 3.2 GET /api/certificates/:id
- **Auth**: `cert:read` scope
- **Response**: Full Certificate object with all metadata
- **Errors**: 404 if not found

#### 3.3 POST /api/certificates
- **Auth**: `cert:create` scope
- **Body**: CertificateCreate payload
- **Response**: Created Certificate object with id, timestamps
- **Errors**: 400 Bad Request if validation fails

#### 3.4 PATCH /api/certificates/:id
- **Auth**: `cert:update` scope
- **Body**: Partial CertificateUpdate payload (any field optional)
- **Response**: Updated Certificate object
- **Errors**: 404 if not found, 400 if validation fails

#### 3.5 DELETE /api/certificates/:id
- **Auth**: `cert:delete` scope
- **Semantics**: Soft-delete (revoke); sets `revoked=true` and `revokedAt` timestamp
- **Response**: Revoked Certificate object
- **Errors**: 404 if not found

#### 3.6 GET /api/certificates/:id/export/:format
- **Auth**: `cert:read` scope
- **Formats**: `pem` (X.509), `json` (full metadata)
- **Response**: File download with `Content-Disposition: attachment`
- **Errors**: 404 if not found, 400 if format unsupported

### 4. CSR Endpoint

#### 4.1 POST /api/csr
- **Auth**: `cert:csr` scope
- **Description**: Generate a Certificate Signing Request (CSR) and private key
- **Body**:
  ```json
  {
    "commonName": "api.example.com",
    "organizationName": "Example Corp",
    "organizationUnit": "Engineering",
    "countryCode": "US",
    "state": "California",
    "locality": "San Francisco",
    "keySize": 2048,
    "signatureAlgorithm": "sha256"
  }
  ```
- **Response**:
  ```json
  {
    "csr": "-----BEGIN CERTIFICATE REQUEST-----\n...",
    "privateKey": "-----BEGIN RSA PRIVATE KEY-----\n...",
    "publicKey": "-----BEGIN PUBLIC KEY-----\n...",
    "keySize": 2048
  }
  ```

### 5. Renewal Endpoint

#### 5.1 POST /api/certificates/:id/renew
- **Auth**: `cert:renew` scope
- **Description**: Renew an existing certificate; typically used in scheduled tasks
- **Body** (optional): Overrides (e.g., new SAN list, different validity period)
- **Response**: New Certificate object with updated validity dates and metadata
- **Errors**: 404 if source cert not found, 409 if cert not renewableyet (not close enough to expiry)

### 6. Revocation Endpoint

#### 6.1 POST /api/certificates/:id/revoke
- **Auth**: `cert:revoke` scope
- **Description**: Revoke a certificate; sets `revoked=true`, `revokedAt`, `revocationReason`
- **Body**:
  ```json
  {
    "reason": "superseded|compromised|cessationOfOperation|certificateHold",
    "comment": "Optional context"
  }
  ```
- **Response**: Revoked Certificate object
- **Errors**: 404 if not found, 409 if already revoked

### 7. Policies Endpoints

#### 7.1 GET /api/policies
- **Auth**: `policy:read` scope
- **Description**: List all certificate policies (naming, key size, validity, SANs, etc.)
- **Response**: Array of Policy objects
- **Querystring**: `page`, `limit`, `search`, `filter[environment]`

#### 7.2 GET /api/policies/:id
- **Auth**: `policy:read` scope
- **Response**: Full Policy object with rules and enforcement settings
- **Errors**: 404 if not found

### 8. Zones Endpoints

#### 8.1 GET /api/zones
- **Auth**: `zone:read` scope
- **Description**: List all zones (organizational divisions for certificate management)
- **Response**: Array of Zone objects
- **Querystring**: `page`, `limit`, `search`

#### 8.2 GET /api/zones/:id
- **Auth**: `zone:read` scope
- **Response**: Full Zone object with metadata
- **Errors**: 404 if not found

### 9. Health & Metadata Endpoints

#### 9.1 GET /health
- **Auth**: None
- **Response**: `{"status": "ok"}`
- **Use**: Kubernetes/load-balancer health checks

#### 9.2 GET /api/meta/filters
- **Auth**: `cert:read` scope
- **Description**: Available filter values for UI/script dropdowns (environments, statuses, CA names, etc.)
- **Response**: MetaFilters object

### 10. CLI Tool

**Distribution**: Multi-platform binary (Linux, macOS, Windows)

#### 10.1 Installation
- Distributed via GitHub Releases as `certificado-cli-<version>-<os>-<arch>.tar.gz` or `.zip`
- Unpacks to `certificado-cli` executable (or `.exe` on Windows)

#### 10.2 Configuration
- **Config file**: `~/.certificado/config.yaml` (or `%APPDATA%\certificado\config.yaml` on Windows)
  ```yaml
  api_url: "https://api.example.com"
  token: "st_xxxxx"  # or read from env var CERTIFICADO_TOKEN
  timeout: 30s
  ```
- **Env vars**: `CERTIFICADO_API_URL`, `CERTIFICADO_TOKEN`, `CERTIFICADO_TIMEOUT`
- **CLI flags**: Override config/env (e.g., `--token`, `--api-url`)

#### 10.3 Commands

| Command | Subcommands | Example |
|---------|-------------|---------|
| `certs` | `list`, `get`, `create`, `update`, `delete`, `export`, `renew`, `revoke` | `certificado-cli certs list --filter-status EXPIRING_SOON` |
| `csr` | `generate` | `certificado-cli csr generate --cn api.example.com --key-size 2048` |
| `policy` | `list`, `get` | `certificado-cli policy list` |
| `zone` | `list`, `get` | `certificado-cli zone list` |
| `token` | `create`, `list`, `revoke` | `certificado-cli token create --name "CI Prod" --scopes cert:read,cert:renew` |
| `config` | `set`, `get` | `certificado-cli config set api_url https://api.example.com` |

#### 10.4 Output Formats
- Default: Human-readable tables
- `--format json`: Structured JSON
- `--format yaml`: YAML output
- `--format csv`: CSV (for certs list)

#### 10.5 Examples
```bash
# List all certificates
certificado-cli certs list

# Get a specific certificate and export as PEM
certificado-cli certs get abc123 --export pem > cert.pem

# Renew a certificate (dry-run first)
certificado-cli certs renew abc123 --dry-run
certificado-cli certs renew abc123

# Revoke with reason
certificado-cli certs revoke abc123 --reason superseded

# Generate CSR
certificado-cli csr generate --cn api.example.com --org "My Corp" --key-size 2048 > csr.pem

# List policies matching a filter
certificado-cli policy list --filter-env PRD
```

### 11. Acceptance Criteria (CI/CD Integration)

- **Happy path**: A CI/CD pipeline can emit a new certificate and download it via CLI in **< 30 seconds** (from API call to file on disk)
- **Prerequisite**: Service token pre-provisioned and stored in secrets manager; API endpoint reachable

## Out of Scope

1. **OAuth2 / OIDC integration** for API (service tokens only in MVP)
2. **Rate limiting per token** (applies globally if implemented)
3. **Webhook callbacks** on certificate events
4. **API versioning** (single version `v1` initially; breaking changes documented in migration guide)
5. **Certificate upload** (POST /api/certificates expects metadata only; CSR+key generation for new issuance)
6. **Multi-tenancy** (single organization assumption; future extension)
7. **CLI auto-update mechanism** (manual download/installation)
8. **API request signing** (Bearer token only; no HMAC/signature verification in MVP)

## Risks & Assumptions

### Risks

1. **Token leakage**: Service tokens are long-lived; compromise exposes full scope access
   - **Mitigation**: Clear documentation on token storage best practices; recommend short expiry (24-72h) in CI; rotate regularly
   - **Monitoring**: Log token issuance, usage, and revocation; alert on suspicious patterns

2. **Scope creep**: Clients may request very fine-grained scopes; spec must remain maintainable
   - **Mitigation**: Start with 9 coarse scopes (cert:read, cert:create, etc.); consolidate if needed; version in future

3. **CLI distribution** across platforms may require signing/notarization (especially macOS/Windows)
   - **Mitigation**: GitHub Actions automate builds; code signing setup documented in CLAUDE.md

4. **Performance**: Large certificate lists (10k+) must not timeout; pagination essential
   - **Mitigation**: Database indexes on `status`, `environment`, `commonName`; test with realistic dataset

### Assumptions

1. **Existing UI authentication** (session/JWT) continues to work; service tokens are separate auth scheme
2. **Token storage**: Client is responsible for secure storage (e.g., GitHub Secrets, HashiCorp Vault)
3. **CLI network**: CLI has outbound HTTPS access to API; firewall/proxy configs are client responsibility
4. **Certificate format**: PEM (X.509) is the only export format needed for MVP
5. **No interactive auth in CLI**: Service tokens required; no username/password prompts
6. **API and CLI versions align**: Breaking changes bump major version on both; documentation tracks compatibility

## Success Metrics

- [ ] CI/CD pipeline executes certificate issuance + download in < 30 seconds (E2E test in pipeline)
- [ ] OpenAPI spec 100% coverage of all endpoints
- [ ] Token auth applied to 100% of non-public endpoints (/health excluded)
- [ ] CLI binary <50MB total for all platforms
- [ ] At least 1 integration test demonstrating API + CLI end-to-end workflow
- [ ] Documentation includes curl examples for all endpoints and CLI command reference

## Timeline Considerations

- OpenAPI spec can be scaffolded early (before backend implementation)
- Token infrastructure (table, validation middleware) is prerequisite for endpoint auth
- CLI can be scaffolded with stub commands while backend endpoints finalize
- CI/CD acceptance test can run in parallel once both API and CLI are at least partially functional
