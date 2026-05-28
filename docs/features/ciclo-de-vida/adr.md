# ADR: C2 — Certificate Lifecycle Management (Issue / Renew / Revoke)

**Feature ID**: C2  
**Slug**: `ciclo-de-vida`  
**Status**: Proposed  
**Date**: 2026-05-28  
**Deciders**: Tech Lead  
**Parent Issue**: #0

---

## 1. Context

The C1 feature (`crud-certificado`) established a **centralized inventory** for mTLS certificates with import, search, filter, detail view, and audit logging. Certificates today are imported as static metadata — the platform does not participate in the certificate **lifecycle** (issuance, renewal, or revocation).

The C2 feature (`ciclo-de-vida`) extends the platform from a passive inventory into an **active lifecycle management system**. This means:

- **Issue**: Generate or accept a CSR, submit it to a CA (Vault PKI or generic REST), and track the issued certificate.
- **Renew**: Re-issue an expiring certificate with the option to rotate the private key.
- **Revoke**: Submit an RFC 5280 revocation to the CA with reason codes and justification.
- **Track**: Model the full lifecycle with explicit status transitions (`PENDING → ISSUED → ACTIVE → EXPIRING_SOON → RENEWED / REVOKED / EXPIRED`).
- **Audit**: Log every lifecycle action immutably with actor, timestamp, reason, and result.

### Constraints & Inputs

| Input | Detail |
|-------|--------|
| PRD | `docs/features/ciclo-de-vida/prd.md` — 7 functional requirements |
| Acceptance Criteria | `docs/features/ciclo-de-vida/acceptance-criteria.md` — 22 Gherkin scenarios across 7 FRs |
| Approved Prototype | `docs/features/ciclo-de-vida/prototypes/prototipo-clm-mvp.html` — dark-theme UI with Issue form, Renew modal, Revoke modal |
| Existing Codebase | C1 fully implemented: Fastify backend, React frontend, Prisma ORM, PostgreSQL |
| CLAUDE.md | Established stack: React 19, Vite, TanStack Query, Zustand, Fastify 5, Prisma, PostgreSQL 16 |
| Auth | JWT stub from C1 — used for actor identity in audit logs, not enforced per route yet |

### What Already Exists (from C1)

- **Database**: `Certificate` model (30+ fields), `AuditEntry` model, status enum (`VALID`, `EXPIRING_SOON`, `EXPIRED`, `REVOKED`)
- **Backend**: `CertificateService` (list, detail, soft-delete/revoke, export), `AuditService` (log, query), `ImportService` (PEM/CSV upload)
- **Frontend**: Inventory page, Certificate detail page (with simple revoke/delete), Upload page, Bulk Import page, Audit Log page
- **Shared types**: `Certificate`, `AuditEntry`, `CertStatus`, `Environment`, `AuditAction`
- **Components**: Badge, Button, Modal, Toast, SearchInput, FilterBar, Breadcrumb, Sidebar

---

## 2. Decision Drivers

1. **Incremental over rewrite**: Extend the existing schema/services/components from C1 rather than replace them. Minimize migration effort.
2. **CA abstraction**: The system must integrate with Vault PKI (primary) and a generic REST CA, with a pluggable interface for future CAs (ACM PCA). No CA vendor lock-in.
3. **Security-first**: Private keys generated on-platform must never be exposed in the UI or API responses. Revocation reasons must follow RFC 5280.
4. **Audit completeness**: Every lifecycle action (issue, renew, revoke, key rotation, notification) must produce an immutable audit trail entry.
5. **User experience**: Issue < 60s, Renew < 60s, Revoke < 30s end-to-end including CA round-trip. UI must show progress and handle CA failures gracefully.
6. **Backward compatibility**: Existing imported certificates (from C1) must continue to work — they just won't have `PENDING` or `ISSUED` states since they were imported directly.
7. **MVP scope discipline**: No auto-renewal, no CRL/OCSP hosting, no batch operations, no HSM integration. Manual trigger only.

---

## 3. Chosen Architecture

### 3.1 Status Model Extension

The existing C1 status enum (`VALID`, `EXPIRING_SOON`, `EXPIRED`, `REVOKED`) must be extended to support the full lifecycle:

```
Prisma enum CertStatus:
  PENDING         # CSR submitted to CA, awaiting response
  ISSUED          # Certificate received from CA, not yet deployed
  ACTIVE          # Certificate in use and valid (> 30d to expiry)
  EXPIRING_SOON   # Valid but < 30d to expiry
  RENEWED         # Old cert whose renewal child is ISSUED
  REVOKED         # Revoked via CA
  EXPIRED         # notAfter date passed
```

**State machine transitions**:

```
                ┌──────────┐
   Issue CSR ──►│ PENDING  │
                └────┬─────┘
                     │ CA responds
                     ▼
                ┌──────────┐
                │  ISSUED  │
                └────┬─────┘
                     │ deployment / time
                     ▼
                ┌──────────┐     < 30d     ┌───────────────┐
                │  ACTIVE  │──────────────►│ EXPIRING_SOON │
                └────┬─────┘               └───────┬───────┘
                     │                             │
         Renew ──────┤                    ┌────────┤
                     │                    │        │ notAfter passed
              ┌──────▼──────┐             │   ┌────▼─────┐
              │   RENEWED   │             │   │ EXPIRED  │
              └─────────────┘             │   └──────────┘
                                          │
         Revoke (any active state) ───────┤
                                          │
                                   ┌──────▼─────┐
                                   │  REVOKED   │
                                   └────────────┘
```

**Key design choice**: Status is *computed* at read time (like C1 today) for `ACTIVE` ↔ `EXPIRING_SOON` ↔ `EXPIRED` transitions, but *written explicitly* for `PENDING`, `ISSUED`, `RENEWED`, and `REVOKED`. This hybrid approach avoids cron jobs while keeping explicit states for lifecycle events that require user action.

The existing `computeStatus()` function in `certificateService.ts` will be extended to handle the new states. For backward compatibility, C1-imported certificates (which have `status=VALID`) will be treated as `ACTIVE` by the compute function.

### 3.2 Database Schema Changes

#### 3.2.1 Certificate Model Extensions

New fields added to the existing `Certificate` model:

```prisma
model Certificate {
  // ... existing 30+ fields from C1 ...

  // ── Lifecycle (C2) ────────────────────────────────────────────────────────
  lifecycleStatus  String?  @map("lifecycle_status")   // PENDING, ISSUED, ACTIVE, etc.

  // ── CSR & Issuance ────────────────────────────────────────────────────────
  csrPem           String?  @map("csr_pem") @db.Text   // CSR PEM data
  csrSource        String?  @map("csr_source")         // 'generated' | 'uploaded'
  validityDays     Int?     @map("validity_days")       // requested validity period

  // ── Certificate Family (Renewals) ─────────────────────────────────────────
  renewalParentId  String?  @map("renewal_parent_id")
  renewalChildId   String?  @map("renewal_child_id")

  // ── Revocation (extended from C1) ─────────────────────────────────────────
  revocationReasonCode  String?  @map("revocation_reason_code")  // RFC 5280 code
  revocationJustification String? @map("revocation_justification") @db.Text
  revokedBy             String?  @map("revoked_by")  // actor user ID

  // ── Private Key Reference (on-platform generation) ────────────────────────
  privateKeyRef     String?  @map("private_key_ref")   // vault/KMS key ID (never raw key)
  keyAlgorithm      String?  @map("key_algorithm")     // RSA2048, RSA4096, ECDSA_P256, etc.
}
```

**Design decision — `lifecycleStatus` as optional String vs. extending the enum**:

We extend the existing `CertStatus` enum to add `PENDING`, `ISSUED`, `ACTIVE`, and `RENEWED`. The `VALID` value is kept for backward compatibility with C1-imported certs. The `computeStatus()` function maps `VALID` → `ACTIVE` at the API layer.

```prisma
enum CertStatus {
  PENDING
  ISSUED
  ACTIVE          // replaces VALID at API level
  VALID           // kept for C1 backward compatibility
  EXPIRING_SOON
  RENEWED
  EXPIRED
  REVOKED
}
```

#### 3.2.2 CA Configuration Model (New)

```prisma
model CaConfig {
  id         String   @id @default(uuid())
  name       String   @unique                   // "Vault PKI (bank-prd)"
  type       String                             // VAULT_PKI | REST_CA
  endpoint   String                             // https://vault.internal:8200/v1/pki/...
  authMethod String   @map("auth_method")       // token | mtls | iam
  authConfig Json     @map("auth_config") @db.JsonB  // encrypted credentials reference
  isActive   Boolean  @default(true) @map("is_active")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  @@map("ca_configs")
}
```

**Rationale**: CA configuration is stored in DB (not env vars) to support multiple CAs and admin-managed configuration. Auth credentials point to a vault reference or encrypted config — raw secrets are never stored in plaintext.

#### 3.2.3 AuditAction Enum Extension

```prisma
enum AuditAction {
  CREATE            // existing
  UPDATE            // existing
  DELETE            // existing
  REVOKE            // existing — enhanced with reason code
  IMPORT            // existing
  EXPORT            // existing
  ISSUE             // C2: CSR submitted to CA
  RENEW             // C2: renewal initiated
  KEY_ROTATED       // C2: private key rotated during renewal
  NOTIFICATION_SENT // C2: owner notified of key rotation/revocation
}
```

### 3.3 Backend Architecture — CA Adapter Pattern

The key architectural addition is a **CA adapter interface** that abstracts CA-specific API calls:

```
┌──────────────────────────────────────────────────┐
│  LifecycleService                                │
│  ─────────────────                               │
│  issue(params) → Certificate                     │
│  renew(id, rotateKey) → {old, new}              │
│  revoke(id, reason, justification) → Certificate │
│                                                  │
│  Uses: CertificateRepo, AuditService, CaAdapter │
└───────────────────┬──────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────┐
│  CaAdapter (interface)                │
│  ─────────────────────                │
│  submitCsr(csr, caConfig) → CertPEM  │
│  revokeCert(serial, reason, ca) → ok │
│  healthCheck(caConfig) → boolean     │
└─────────┬─────────────────┬──────────┘
          │                 │
          ▼                 ▼
┌─────────────────┐ ┌──────────────────┐
│ VaultPkiAdapter │ │ RestCaAdapter    │
│  (Vault HTTP)   │ │  (generic POST)  │
└─────────────────┘ └──────────────────┘
```

**Rationale**: The adapter pattern isolates CA integration from business logic. Adding a new CA (e.g., AWS ACM PCA) requires only implementing the `CaAdapter` interface — no changes to the lifecycle service or UI.

#### CA Adapter Interface

```typescript
interface CaAdapter {
  /** Submit a CSR and receive the issued certificate PEM + chain */
  submitCsr(csrPem: string, config: CaConfig): Promise<CaIssuanceResult>;
  
  /** Revoke a certificate by serial number with RFC 5280 reason */
  revokeCertificate(serial: string, reasonCode: string, config: CaConfig): Promise<void>;
  
  /** Health check — is the CA endpoint reachable? */
  healthCheck(config: CaConfig): Promise<boolean>;
}

interface CaIssuanceResult {
  certificatePem: string;    // issued cert
  chainPem?: string;         // CA chain
  serial: string;            // serial from CA
  notBefore: Date;
  notAfter: Date;
}
```

#### Vault PKI Adapter

Vault PKI integration uses the Vault HTTP API v1:

- **Issue**: `POST {vault_addr}/v1/{pki_mount}/sign/{role}` with CSR PEM in body
- **Revoke**: `POST {vault_addr}/v1/{pki_mount}/revoke` with serial number
- **Health**: `GET {vault_addr}/v1/sys/health`

Auth: Vault token from `CaConfig.authConfig.token` (or AppRole for production).

#### Generic REST CA Adapter

A generic adapter for any CA that exposes a REST API:

- **Issue**: `POST {endpoint}/issue` with `{ csr: "<PEM>", validity_days: N }`
- **Revoke**: `POST {endpoint}/revoke` with `{ serial: "...", reason: "..." }`
- **Health**: `GET {endpoint}/health`

This adapter is configurable via `CaConfig.authConfig` for headers, mTLS, etc.

### 3.4 CSR Generation — Server-Side with node-forge

CSR generation happens **server-side only** using `node-forge`. This ensures:

1. Private keys are generated in the backend process and stored as vault references
2. Keys never transit to the browser
3. CSR structure is validated before CA submission

```typescript
// backend/src/services/csrService.ts
interface CsrGenerationParams {
  cn: string;
  sans: string[];
  algorithm: 'RSA2048' | 'RSA4096' | 'ECDSA_P256' | 'ECDSA_P384';
  organization?: string;
}

interface CsrGenerationResult {
  csrPem: string;
  privateKeyRef: string;  // vault/KMS reference (never raw key)
  keyAlgorithm: string;
  fingerprint: string;    // SHA-256 of public key
}
```

**Design decision — MVP key storage**: For the MVP, private keys are encrypted with AES-256-GCM using a server-side secret (`ENCRYPTION_KEY` env var) and stored in the `private_key_ref` field as an encrypted reference. This is NOT production-grade — the infrastructure document will note that a Vault Transit backend or KMS should replace this for production. The important invariant is: **the key is never exposed via API or UI**.

### 3.5 New API Endpoints

| Method | Path | Description | FR |
|--------|------|-------------|-----|
| `POST` | `/api/certificates/issue` | Submit new certificate (generate or upload CSR) | FR1, FR2, FR7 |
| `POST` | `/api/certificates/:id/renew` | Renew certificate with optional key rotation | FR3, FR7 |
| `POST` | `/api/certificates/:id/revoke` | Revoke with RFC 5280 reason code | FR4, FR7 |
| `GET`  | `/api/certificates/:id/timeline` | View lifecycle history (issue → renew → revoke) | FR5, FR6 |
| `GET`  | `/api/certificates/:id/renewal-options` | Check if renewal is possible + current constraints | FR3 |
| `GET`  | `/api/revocation-reasons` | List RFC 5280 reason codes with descriptions | FR4 |
| `GET`  | `/api/cas` | List configured CAs with health status | FR1, FR2 |
| `POST` | `/api/cas/:id/health` | Trigger CA health check | FR2 |

#### Issue Endpoint

```
POST /api/certificates/issue
Body: {
  cn: string,                         // required
  sans: string[],                     // optional
  algorithm: "RSA2048" | "RSA4096" | "ECDSA_P256" | "ECDSA_P384",
  ca_id: string,                      // reference to CaConfig.id
  validity_days: number,              // default: 365
  owner: string,                      // required
  zone: string,                       // required
  environment: "DEV" | "HML" | "PRD",
  csr_source: "generate" | "upload",  // default: "generate"
  csr_pem?: string,                   // required if csr_source = "upload"
  organization?: string,
  tags?: Record<string, string>
}
Response (201): {
  id: string,
  cn: string,
  status: "PENDING",
  created_at: string
}
```

#### Renew Endpoint

```
POST /api/certificates/:id/renew
Body: {
  rotate_key: boolean,      // default: false
  validity_days?: number,   // default: same as original
  notify_owner?: boolean    // default: true (only when rotate_key=true)
}
Response (200): {
  old_id: string,
  new_id: string,
  new_status: "PENDING",
  key_rotated: boolean,
  notification_sent: boolean
}
```

#### Revoke Endpoint (replaces existing simple PATCH)

```
POST /api/certificates/:id/revoke
Body: {
  reason: string,           // RFC 5280 code: keyCompromise, superseded, etc.
  comment?: string,         // justification text for audit
  notify_owner?: boolean    // default: true
}
Response (200): {
  id: string,
  status: "REVOKED",
  revocation_timestamp: string,
  revocation_reason: string,
  revoked_by: string
}
```

### 3.6 Frontend Architecture

#### New Pages

| Route | Page | Description |
|-------|------|-------------|
| `/certificates/issue` | `IssueCertificatePage` | Multi-step form: CSR source → fields → CA selection → submit |
| — | `RenewalModal` | Modal on detail page: strategy selection → confirm → submit |
| — | `RevocationModal` | Modal on detail page: reason code → justification → confirm |

#### Issue Page Design

The issue page is a **multi-step wizard** following the prototype:

1. **Step 1: CSR Source** — Choose "Generate CSR" or "Upload CSR"
2. **Step 2: Certificate Details** — CN, SANs, Algorithm, Organization (or upload PEM + preview)
3. **Step 3: Configuration** — CA, Owner, Zone, Environment, Tags, Validity Period
4. **Step 4: Review & Submit** — Summary with live validation checks (CN format, duplicate, CA health)

The form uses **React Hook Form + Zod** for validation with the same patterns as the existing Upload page. The wizard state is managed via a `useState<step>` in the page component — no need for a global store since the wizard is a single-page flow.

#### Enhanced Detail Page

The existing Certificate Detail page is extended with:

1. **Renew button** — visible when certificate is `ACTIVE` or `EXPIRING_SOON` with < 30 days to expiry (or admin override)
2. **Enhanced Revoke button** — opens the RFC 5280 revocation modal instead of the simple confirm dialog
3. **Timeline section** — chronological view of lifecycle events (issue → renew → revoke)
4. **Renewal links** — "Renewed to: [new cert]" / "Renewal of: [old cert]" navigation links

#### Renewal Modal

The renewal modal presents two strategies with clear UX:

```
┌─────────────────────────────────────────────────┐
│  Renew Certificate                              │
│                                                 │
│  ┌───────────────────────┐ ┌──────────────────┐ │
│  │ ⚡ Keep Same Key      │ │ 🔄 Rotate Key   │ │
│  │   Faster, reuse key  │ │  Recommended,    │ │
│  │                      │ │  generates new   │ │
│  │   No deployment      │ │  key + notifies  │ │
│  │   change needed      │ │  owner           │ │
│  └───────────────────────┘ └──────────────────┘ │
│                                                 │
│  Validity: [365] days                           │
│  [x] Notify owner (for key rotation)            │
│                                                 │
│  [Cancel]                    [Submit Renewal]   │
└─────────────────────────────────────────────────┘
```

#### Revocation Modal

The revocation modal enforces RFC 5280:

```
┌─────────────────────────────────────────────────┐
│  ⚠️ Revoke Certificate                          │
│                                                 │
│  This action is irreversible. The certificate   │
│  will be submitted to the CA for revocation.    │
│                                                 │
│  Reason (RFC 5280): [▾ keyCompromise         ]  │
│                                                 │
│  Justification:                                 │
│  ┌─────────────────────────────────────────────┐│
│  │ Private key exposed in code repo commit     ││
│  └─────────────────────────────────────────────┘│
│                                                 │
│  [x] Notify owner                               │
│                                                 │
│  [Cancel]                    [Confirm Revoke]   │
└─────────────────────────────────────────────────┘
```

#### New Hooks & Services

```
frontend/src/
├── hooks/
│   ├── useIssueCertificate.ts     # mutation: POST /api/certificates/issue
│   ├── useRenewCertificate.ts     # mutation: POST /api/certificates/:id/renew
│   ├── useRevokeCertificate.ts    # enhanced: POST /api/certificates/:id/revoke (with reason)
│   ├── useCaList.ts               # query: GET /api/cas
│   ├── useCertificateTimeline.ts  # query: GET /api/certificates/:id/timeline
│   └── useRevocationReasons.ts    # query: GET /api/revocation-reasons
├── services/
│   └── lifecycleApi.ts            # API client for all C2 endpoints
```

### 3.7 Notification System — MVP (In-App Only)

For MVP, notifications are **in-app only** — no email integration. The system:

1. Creates audit entries with `action: NOTIFICATION_SENT` to record that a notification was triggered
2. Shows toast messages on the UI to the acting user
3. The notification text (recipient, reason, action needed) is stored in the audit detail field

Email notification is documented as a Phase 2 enhancement in the PRD.

**Rationale**: Email requires SMTP configuration, templating, and delivery tracking — all out of scope for MVP. The audit trail provides the compliance record. In-app toasts + audit entries satisfy the notification AC for MVP.

### 3.8 Validation Rules

| Rule | Check Location | AC Reference |
|------|----------------|--------------|
| CN must be valid FQDN | Frontend (Zod) + Backend | AC 1.3 |
| No duplicate active CN in same zone | Backend (DB query) | AC 1.4 |
| CA must be reachable (health check) | Backend (before submission) | AC 1.5, 2.1 |
| Renewal only for certs < 30d to expiry (or admin) | Backend + Frontend | AC 3.3, 3.4 |
| Revocation reason must be RFC 5280 valid | Frontend (dropdown) + Backend (enum) | AC 4.1 |
| CSR PEM must be parseable | Backend (node-forge) | AC 1.2 |

### 3.9 Error Handling

| Scenario | Behavior | AC |
|----------|----------|-----|
| CA timeout (5s) | Show error, cert stays `PENDING`, user can retry | AC 1.5 |
| Invalid CSR format | 400 with field-level error | AC 1.3 |
| Duplicate CN + zone | 409 with suggestion to renew | AC 1.4 |
| Revocation CA failure | Show error, cert stays current status | AC 4.3 |
| Unauthorized user | 403 with message | AC 2.2 |

---

## 4. Alternatives Considered

### 4.1 CSR Generation: Server-Side vs Browser-Side

| | Server-Side (chosen) | Browser-Side (WebCrypto) |
|---|---------|---------|
| Security | Key never leaves server | Key in browser memory |
| Compatibility | node-forge (proven) | WebCrypto API (limited CSR support) |
| UX | One API call | Requires client-side crypto + upload |
| Audit | Full control over key creation | Hard to audit key provenance |

**Decision**: Server-side. Security is the primary concern — private keys must never exist in the browser.

### 4.2 Status Model: Computed vs Stored vs Hybrid

| | Fully Computed | Fully Stored | Hybrid (chosen) |
|---|---------|---------|---------|
| Time-based transitions | Automatic | Requires cron | Automatic for time-based |
| Explicit transitions | Complex | Simple | Simple for explicit events |
| Query performance | Expensive (computed WHERE) | Fast (indexed) | Mixed — DB `status` for lifecycle, computed for time |
| Backward compat | Good | Requires migration | Good |

**Decision**: Hybrid. `PENDING`, `ISSUED`, `RENEWED`, `REVOKED` are written explicitly when the event occurs. `ACTIVE` ↔ `EXPIRING_SOON` ↔ `EXPIRED` are computed at read time from `notAfter` (same as C1). The `computeStatus()` function handles both cases.

### 4.3 CA Integration: Direct HTTP vs Message Queue

| | Direct HTTP (chosen) | Message Queue (SQS/RabbitMQ) |
|---|---------|---------|
| Latency | Synchronous (< 60s) | Asynchronous (variable) |
| Complexity | Low (HTTP client) | High (queue infra + workers) |
| Reliability | Retry on failure | At-least-once delivery |
| MVP fit | Yes | Over-engineered for MVP |

**Decision**: Direct HTTP. The AC requires < 60s end-to-end. A synchronous request-response with a 5s timeout and user-initiated retry is simpler and sufficient for MVP. The adapter pattern allows swapping to async in a future phase.

### 4.4 Key Storage: Encrypted DB vs Vault Transit vs KMS

| | Encrypted DB (MVP) | Vault Transit | AWS KMS |
|---|---------|---------|---------|
| Setup | Env var + AES-256 | Vault infra required | AWS account required |
| Security | Good (at-rest encryption) | Excellent (HSM-backed) | Excellent |
| MVP fit | Yes | Over-provisioned | Over-provisioned |
| Migration path | Replace `privateKeyRef` handler | Swap adapter | Swap adapter |

**Decision**: Encrypted DB for MVP with a clear migration path. The `privateKeyRef` field stores an encrypted blob. The encryption service is injected via the adapter pattern so it can be swapped to Vault Transit or KMS without changing the lifecycle service.

### 4.5 Notification: Email vs In-App vs Webhook

| | Email | In-App (chosen) | Webhook |
|---|---------|---------|---------|
| Infrastructure | SMTP + templates | Toast + audit entry | HTTP endpoint config |
| MVP scope | Heavy | Light | Medium |
| Compliance evidence | Email logs | Audit entries | Delivery logs |

**Decision**: In-app (toast + audit entry) for MVP. Email and webhook are Phase 2.

---

## 5. Consequences

### Positive

- **Incremental build**: All changes extend existing models/services — no breaking changes to C1.
- **CA-agnostic**: Adapter pattern supports multiple CAs with clear extension points.
- **Full audit trail**: Every lifecycle event is logged immutably, satisfying compliance requirements.
- **Type-safe lifecycle**: Status transitions are enforced at the service layer, preventing invalid states.
- **Reuse**: Existing Modal, Button, Badge, Toast, FilterBar components are reused — only new specialized components (IssuePage, RenewalModal, RevocationModal) are created.

### Negative

- **Schema migration**: Adding columns + enum values to the Certificate model requires a Prisma migration. Existing data needs default values.
- **CA dependency**: Issue and Revoke operations depend on CA availability. Offline mode is limited to read-only inventory.
- **MVP key storage**: AES-256-GCM in DB is not production-grade. Must be replaced with Vault/KMS before production deployment.
- **No email notifications**: In-app only for MVP. Teams relying on email alerts need an alternative workflow until Phase 2.

### Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| CA API instability (Vault version changes) | Adapter pattern isolates CA specifics; version-pinned HTTP calls |
| Schema migration breaks existing data | Migration adds columns as nullable with defaults; `computeStatus()` handles both old and new records |
| Private key leak via API | Dedicated `privateKeyRef` field stores vault references only; API serializer explicitly excludes key data; audit log sanitizer strips sensitive fields |
| Long CA response time (> 60s) | 5s HTTP timeout with user-visible retry; `PENDING` status allows polling |
| Concurrent renewals on same cert | Database-level check: reject if `renewalChildId` is already set |

---

## 6. Acceptance Criteria Coverage Matrix

Every AC from `acceptance-criteria.md` is covered by at least one implementation chunk:

| Functional Requirement | Scenarios | Backend Chunk | Frontend Chunk |
|------------------------|-----------|---------------|----------------|
| FR1: Issue — CSR Generation | 1.1, 1.2, 1.3, 1.4, 1.5 | Chunk 2 (CSR Service), Chunk 3 (Issue Endpoint) | Chunk 5 (Issue Page) |
| FR2: Issue — Validation & Checks | 2.1, 2.2 | Chunk 3 (Issue Endpoint validation) | Chunk 5 (Live validation) |
| FR3: Renew — Manual with Key Rotation | 3.1, 3.2, 3.3, 3.4, 3.5 | Chunk 3 (Renew Endpoint) | Chunk 6 (Renewal Modal) |
| FR4: Revoke — RFC 5280 Reason Codes | 4.1, 4.2, 4.3, 4.4, 4.5 | Chunk 3 (Revoke Endpoint) | Chunk 6 (Revocation Modal) |
| FR5: Lifecycle Status & Transitions | 5.1, 5.2, 5.3, 5.4 | Chunk 1 (Schema + Status Logic) | Chunk 6 (Detail Page Enhancements) |
| FR6: Audit Logging | 6.1, 6.2, 6.3, 6.4 | Chunk 3 (Audit integration) | Chunk 7 (Timeline UI) |
| FR7: API Endpoints | 7.1, 7.2, 7.3, 7.4 | Chunk 3 (All API endpoints) | Chunk 5, 6 (API client) |

---

## 7. Implementation Chunks Summary

| # | Skill | Chunk | Dependencies |
|---|-------|-------|-------------|
| 1 | backend | Schema migration: extend CertStatus enum, add lifecycle fields, create CaConfig model | None |
| 2 | backend | CSR generation service + CA adapter interface (Vault PKI + REST CA) | Chunk 1 |
| 3 | backend | Lifecycle API endpoints: issue, renew, revoke, timeline, CA list | Chunk 1, Chunk 2 |
| 4 | frontend | Shared types extension + lifecycle API client (`lifecycleApi.ts`) + new hooks | Chunk 3 |
| 5 | frontend | Issue Certificate page: multi-step wizard form with validation | Chunk 4 |
| 6 | frontend | Detail page enhancements: Renewal modal, Revocation modal, status badges | Chunk 4 |
| 7 | frontend | Certificate timeline UI + audit log extension for lifecycle events | Chunk 4, Chunk 6 |

See `docs/features/ciclo-de-vida/build-order.md` for the recommended implementation sequence with issue references.

---

**ADR Version**: 1.0  
**Last Updated**: 2026-05-28
