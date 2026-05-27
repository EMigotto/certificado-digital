# ADR: C1 — Inventário Centralizado de Certificados

**Feature ID**: C1  
**Slug**: `crud-certificado`  
**Status**: Accepted  
**Date**: 2026-05-27  
**Deciders**: Tech Lead  

---

## 1. Context

The organization manages mTLS certificates scattered across multiple CA systems (Vault PKI, AWS ACM PCA, external CAs) with no centralized visibility. The **crud-certificado** feature (C1) is the foundational MVP module that provides:

- A **single-source-of-truth inventory** for all imported certificates
- **Full-text search** across CN, SANs, serial, fingerprint, and owner
- **Composable filters** (expiration window, environment, CA, status, tags)
- **Manual single-cert upload** (PEM, PKCS#12, DER) with X.509 auto-parsing
- **Bulk CSV import** with row-level validation and progress tracking
- **Certificate detail page** with metadata display, clipboard copy, and PEM/JSON export
- **Audit logging** (immutable, append-only) for all import and change operations
- **Performance** handling 10k+ certificates with <1s page loads and <2s filtered queries

The codebase is **greenfield** — the repository currently contains only documentation (PRD, acceptance criteria, approved prototype). A prior vanilla-TS prototype was removed; this plan starts from scratch with a proper React stack as defined in `CLAUDE.md`.

### Constraints & Inputs

| Input | Detail |
|-------|--------|
| PRD | `docs/features/crud-certificado/prd.md` — 10 functional requirements |
| Acceptance Criteria | `docs/features/crud-certificado/acceptance-criteria.md` — 68 Gherkin scenarios |
| Approved Prototype | `docs/features/crud-certificado/prototypes/prototipo-clm-mvp.html` — dark-theme UI |
| CLAUDE.md | Established stack: React 18+, Vite, TanStack Query/Table, Zustand, Fastify, PostgreSQL |
| Target Scale | 10,000+ certificates per organization |
| Auth | Assumed pre-existing (JWT + RBAC); out of scope for C1 |

---

## 2. Decision Drivers

1. **Performance at scale**: Must support 10k+ certs with pagination, search <2s, page load <1s
2. **Type safety end-to-end**: TypeScript strict mode, shared types between frontend and backend
3. **Developer experience**: Fast feedback loop (Vite HMR, Vitest watch), minimal config
4. **Prototype fidelity**: UI must match the approved dark-theme prototype pixel-closely
5. **Extensibility**: Architecture must support future phases (C2 editing, C3 monitoring, C4 issuance, C5 audit)
6. **Testability**: 80%+ coverage target, all 68 ACs verifiable via automated tests
7. **Operational simplicity**: Single repo, Docker Compose for local dev, clear build pipeline

---

## 3. Chosen Architecture

### 3.1 Repository Structure — Full-Stack Monorepo

```
certificado-digital/
├── frontend/                        # React SPA
│   ├── src/
│   │   ├── components/              # Reusable UI components
│   │   │   ├── Badge/
│   │   │   ├── Button/
│   │   │   ├── FilterChip/
│   │   │   ├── SearchInput/
│   │   │   ├── Sidebar/
│   │   │   ├── Table/
│   │   │   ├── Toast/
│   │   │   ├── Modal/
│   │   │   └── Pagination/
│   │   ├── pages/
│   │   │   ├── Inventory/           # FR1-FR4: List, search, filter
│   │   │   ├── CertificateDetail/   # FR7: Detail view
│   │   │   ├── Upload/              # FR5: Single upload
│   │   │   ├── BulkImport/          # FR6: CSV import
│   │   │   └── AuditLog/            # FR9: Audit trail
│   │   ├── hooks/
│   │   │   ├── useCertificates.ts   # TanStack Query wrapper
│   │   │   ├── useFilters.ts        # Filter state + URL sync
│   │   │   ├── useSearch.ts         # Debounced search
│   │   │   └── useAuditLog.ts       # Audit entries query
│   │   ├── services/
│   │   │   ├── api.ts               # Axios instance + interceptors
│   │   │   └── certificateApi.ts    # Certificate REST client
│   │   ├── store/
│   │   │   ├── uiStore.ts           # Sidebar, modals, toasts
│   │   │   └── filterStore.ts       # Active filter state
│   │   ├── types/                   # Shared with backend via symlink or copy
│   │   │   ├── certificate.ts
│   │   │   ├── audit.ts
│   │   │   └── filters.ts
│   │   ├── utils/
│   │   │   ├── dateUtils.ts
│   │   │   ├── certParser.ts        # Client-side PEM preview parsing
│   │   │   └── formatters.ts
│   │   ├── styles/
│   │   │   ├── tokens.css           # Design system variables
│   │   │   ├── reset.css            # CSS reset
│   │   │   └── global.css           # Base styles
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── router.tsx
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── backend/                         # Fastify REST API
│   ├── src/
│   │   ├── server.ts                # Fastify bootstrap
│   │   ├── config.ts                # Env vars, DB URL, etc.
│   │   ├── routes/
│   │   │   ├── certificates.ts      # /api/certificates CRUD
│   │   │   ├── import.ts            # /api/certificates/import
│   │   │   └── audit.ts             # /api/audit
│   │   ├── services/
│   │   │   ├── certificateService.ts
│   │   │   ├── importService.ts     # PEM/PKCS#12/DER/CSV parsing
│   │   │   └── auditService.ts
│   │   ├── repositories/
│   │   │   ├── certificateRepo.ts
│   │   │   └── auditRepo.ts
│   │   ├── middleware/
│   │   │   ├── errorHandler.ts
│   │   │   └── auth.ts              # JWT stub (validates but doesn't issue)
│   │   └── utils/
│   │       ├── certParser.ts        # node-forge X.509 parsing
│   │       ├── csvParser.ts         # papaparse + validation
│   │       └── pagination.ts        # Cursor/offset helpers
│   ├── prisma/
│   │   ├── schema.prisma            # Database schema
│   │   ├── migrations/              # Prisma migrations
│   │   └── seed.ts                  # Seed data generator
│   ├── tsconfig.json
│   └── package.json
│
├── shared/                          # Shared TypeScript types
│   ├── types/
│   │   ├── certificate.ts
│   │   ├── audit.ts
│   │   ├── filters.ts
│   │   └── api.ts                   # Request/response DTOs
│   ├── tsconfig.json
│   └── package.json
│
├── docker-compose.yml               # PostgreSQL + API + Frontend
├── .github/workflows/ci.yml         # Lint + Test + Build
├── .gitignore
├── CLAUDE.md
├── README.md
└── docs/
    └── features/crud-certificado/
```

**Rationale**: A monorepo with `frontend/`, `backend/`, and `shared/` packages keeps types synchronized. Each package has its own `package.json` and `tsconfig.json`. The `shared/` package is referenced via TypeScript project references, eliminating type drift between layers.

### 3.2 Backend — Fastify + Prisma + PostgreSQL

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | **Fastify 5** | 2× faster than Express, built-in JSON schema validation, TypeScript-first, plugin architecture fits well for future phases (C2–C5) |
| ORM | **Prisma** | Auto-generated TypeScript types, declarative schema, migration tooling, full-text search support via `@@fulltext` |
| Database | **PostgreSQL 16** | Full-text search (`tsvector`/`tsquery`), B-tree indexes on `expires_at`/`status`/`environment`, JSONB for custom tags/fields, proven at scale |
| Cert Parsing | **node-forge** | Pure-JS X.509 parser — handles PEM, PKCS#12, DER; works in both Node.js and browser; no native bindings |
| CSV Parsing | **papaparse** | Streaming parser for large CSVs (10k+ rows), header detection, configurable delimiters |
| Validation | **Zod** | Schema definitions shared with frontend; coercion for query params; `.parse()` throws typed errors |
| Auth | **JWT stub** | Middleware extracts user from `Authorization: Bearer <token>` header. Actual token issuance is out of scope. RBAC roles: `pki-admin`, `pki-user`, `viewer` |

#### Database Schema (Prisma)

```prisma
model Certificate {
  id              String   @id @default(uuid())
  commonName      String   @map("common_name")
  sans            String[] @map("subject_alternative_names")
  serialNumber    String   @map("serial_number")
  fingerprint     String   @unique @map("fingerprint_sha256")

  notBefore       DateTime @map("not_before")
  notAfter        DateTime @map("not_after")
  status          CertStatus @default(VALID)

  algorithm       String                     // RSA, ECDSA, EdDSA
  keySize         String   @map("key_size")  // 2048, P-256, etc.
  signatureAlgo   String   @map("signature_algorithm")

  issuerDn        String   @map("issuer_dn")
  caName          String   @map("ca_name")

  owner           String
  application     String?
  environment     Environment
  zone            String?
  tags            String[]
  customFields    Json?    @map("custom_fields")

  importSource    ImportSource @default(MANUAL_UPLOAD) @map("import_source")
  importBatchId   String?     @map("import_batch_id")

  pemData         String?  @map("pem_data")  // Public cert PEM (no private key)

  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt       @map("updated_at")

  auditEntries    AuditEntry[]

  @@index([notAfter])
  @@index([status])
  @@index([environment])
  @@index([owner])
  @@index([caName])
  @@index([commonName, issuerDn])
  @@map("certificates")
}

model AuditEntry {
  id            String    @id @default(uuid())
  timestamp     DateTime  @default(now())
  actor         String
  action        AuditAction
  certificateId String?   @map("certificate_id")
  certificate   Certificate? @relation(fields: [certificateId], references: [id])
  batchId       String?   @map("batch_id")
  changes       Json?     // { before: {...}, after: {...} }
  result        AuditResult
  errorReason   String?   @map("error_reason")
  metadata      Json?     // Extra context (filename, source, etc.)

  @@index([timestamp])
  @@index([certificateId])
  @@index([action])
  @@index([batchId])
  @@map("audit_entries")
}

enum CertStatus {
  VALID
  EXPIRING_SOON
  EXPIRED
  REVOKED
}

enum Environment {
  dev
  hml
  prd
}

enum ImportSource {
  MANUAL_UPLOAD
  CSV_IMPORT
  API_IMPORT
}

enum AuditAction {
  IMPORT
  UPDATE
  DELETE
  REVOKE
  EXPORT
}

enum AuditResult {
  SUCCESS
  FAILURE
}
```

**Key indexes**: `not_after` (expiration queries), `status` (filter), `environment` (filter), `common_name + issuer_dn` (duplicate detection). PostgreSQL `tsvector` index on `common_name || sans || serial_number || owner || application` for full-text search.

#### API Endpoints

| Method | Path | Description | FR |
|--------|------|-------------|-----|
| `GET` | `/api/certificates` | List with pagination, search, filters | FR1–FR4, FR8 |
| `GET` | `/api/certificates/:id` | Certificate detail | FR7 |
| `POST` | `/api/certificates/import` | Single cert upload (multipart) | FR5 |
| `POST` | `/api/certificates/import/csv` | Bulk CSV import (multipart) | FR6 |
| `GET` | `/api/certificates/:id/export/:format` | Export as PEM or JSON | FR7 |
| `DELETE` | `/api/certificates/:id` | Soft-delete (marks REVOKED) | FR7 |
| `GET` | `/api/audit` | Audit log with filters | FR9 |
| `GET` | `/api/meta/filters` | Available filter values (CAs, envs, tags) | FR4 |

**Pagination**: Offset-based (`?page=1&pageSize=25`) for simplicity with TanStack Table. The API returns `{ data: Certificate[], total: number, page: number, pageSize: number }`.

**Search**: Query param `?q=api-pay` triggers PostgreSQL full-text search with `to_tsquery`. Minimum 2 characters enforced server-side.

**Filters**: Query params `?expiresIn=30d&environment=prd&ca=Vault+PKI&status=VALID,EXPIRING_SOON&tags=mTLS,auto-renewal`. AND logic across filters, OR logic within multi-value filters (except tags = AND).

### 3.3 Frontend — React 18 + Vite + TanStack

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | **React 18** | Component model, hooks, Suspense for loading states |
| Build | **Vite 5** | Fast HMR (<50ms), optimized production bundles, ESM-native |
| Routing | **React Router v6** | Nested routes, URL params, loader patterns |
| Server State | **TanStack Query v5** | Automatic caching (staleTime=60s), refetch on focus, pagination helpers, invalidation on mutations |
| Tables | **TanStack Table v8** | Headless, server-side pagination/sorting/filtering, column visibility, selection |
| UI State | **Zustand** | Lightweight store for sidebar state, modal visibility, toast queue |
| Forms | **React Hook Form + Zod** | Performant forms (no re-renders), Zod schemas shared with backend validation |
| Styling | **CSS Modules** | Zero-runtime overhead, scoped class names, design tokens via CSS custom properties |
| HTTP | **Axios** | Interceptors for auth header injection, retry on 5xx, request cancellation |
| Cert Parsing | **node-forge** (browser build) | Client-side PEM preview before server upload — extracts CN, SANs, dates |
| CSV Parsing | **papaparse** | Client-side CSV preview before server upload |
| Testing | **Vitest + React Testing Library + MSW** | Aligned with Vite, fast, mock server for integration tests |

#### Routing Map

```
/                        → Redirect to /certificates
/certificates            → Inventory page (FR1–FR4)
/certificates/:id        → Certificate detail (FR7)
/certificates/upload     → Single cert upload (FR5)
/certificates/import     → Bulk CSV import (FR6)
/audit                   → Audit log (FR9)
```

#### State Management Strategy

```
┌──────────────────────────────────────────────────┐
│  TanStack Query (Server State)                   │
│  ─────────────────────────────────               │
│  • certificates list (paginated, filtered)       │
│  • certificate detail (by ID)                    │
│  • audit entries (paginated)                     │
│  • filter metadata (CAs, envs, tags)             │
│                                                  │
│  Cache: staleTime=60s, refetchOnWindowFocus      │
│  Invalidation: on import/delete mutations        │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│  URL Search Params (Filter State)                │
│  ─────────────────────────────────               │
│  • q (search query)                              │
│  • expiresIn (7d|30d|90d)                        │
│  • environment (dev|hml|prd)                     │
│  • ca, status, tags, owner                       │
│  • page, pageSize, sort, sortDir                 │
│                                                  │
│  Synced via useSearchParams + custom useFilters   │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│  Zustand (UI State)                              │
│  ─────────────────────────────────               │
│  • sidebar collapsed/expanded                    │
│  • modal stack (upload, confirm, error)          │
│  • toast queue                                   │
│  • theme (reserved for future)                   │
└──────────────────────────────────────────────────┘
```

**Rationale**: Filter/pagination state lives in URL params for shareability (AC requirement: "Filter state preserved in URL query params"). TanStack Query keys include these params, so navigating to a URL with `?q=api-pay&expiresIn=30d` auto-fetches the right data. Zustand handles ephemeral UI state only.

#### Key Component Architecture

```
<App>
  <Sidebar />
  <Routes>
    <Route path="/certificates" element={<InventoryPage />}>
      ┌─ <Toolbar>
      │    <SearchInput />        ← useSearch (300ms debounce)
      │    <FilterChipBar />      ← useFilters (URL sync)
      │    <ActionButtons />
      │  </Toolbar>
      ├─ <CertificateTable>       ← useCertificates (TanStack Query + Table)
      │    <TableHeader />        ← Sortable columns
      │    <TableBody />          ← Rows with Badge, EnvTag, DaysLeft
      │    <EmptyState />
      │  </CertificateTable>
      └─ <Pagination />           ← Page controls, size selector
    </Route>
    <Route path="/certificates/:id" element={<CertificateDetailPage />}>
      ┌─ <Breadcrumb />
      ├─ <DetailHeader />         ← CN + Status badge + Actions
      ├─ <MetadataGrid />         ← Two-column info items with copy
      └─ <ActionPanel />          ← Export, Revoke, Delete buttons
    </Route>
    <Route path="/certificates/upload" element={<UploadPage />}>
      ┌─ <FileInput />            ← PEM/PKCS12/DER file picker
      ├─ <PasswordPrompt />       ← For PKCS#12 files
      ├─ <MetadataPreview />      ← Parsed cert info before confirm
      └─ <UploadForm />           ← Owner, env, app, tags fields
    </Route>
    <Route path="/certificates/import" element={<BulkImportPage />}>
      ┌─ <CsvUpload />            ← File picker + template download
      ├─ <ValidationPreview />    ← Row-level valid/error/duplicate status
      ├─ <ProgressBar />          ← Import progress
      └─ <ImportSummary />        ← Results + failed rows download
    </Route>
    <Route path="/audit" element={<AuditLogPage />}>
      ┌─ <AuditFilters />
      └─ <AuditTable />           ← Timeline view with action badges
    </Route>
  </Routes>
</App>
```

### 3.4 Performance Strategy

| Target | Strategy |
|--------|----------|
| Page load <1s | Server-side pagination (only 25 rows fetched), lazy route splitting via `React.lazy()` |
| Filter <2s on 10k+ certs | PostgreSQL indexes on `not_after`, `status`, `environment`, `ca_name`; full-text search index |
| Search responsiveness | 300ms debounce client-side, server `tsvector` index, cancel previous request on new keystroke |
| Table smoothness (60fps) | TanStack Table headless (no DOM overhead), CSS Modules (no runtime CSS), minimal re-renders via React.memo |
| Large import (10k CSV) | Streaming CSV parse server-side, batch INSERT (chunks of 500), WebSocket/SSE progress events |

### 3.5 Design System

The UI follows the approved prototype exactly. Design tokens are defined as CSS custom properties in `frontend/src/styles/tokens.css`:

- **Colors**: Dark theme palette (`--bg`, `--surface`, `--accent`, `--ok`, `--warn`, `--crit`, `--rev`)
- **Typography**: IBM Plex Sans (body), IBM Plex Mono (data/code), Instrument Serif (headings)
- **Spacing**: 4px grid system
- **Border radius**: 6px (chips), 8px (inputs), 10px (cards)
- **Status badges**: Green=VALID, Yellow=EXPIRING_SOON, Red=EXPIRED/CRITICAL, Purple=REVOKED

Components are built as CSS Modules (`.module.css`) co-located with their TSX files. No global CSS classes beyond reset and tokens.

### 3.6 Error Handling Strategy

| Layer | Strategy |
|-------|----------|
| API errors (4xx/5xx) | Axios interceptor catches, maps to typed `ApiError`. TanStack Query `onError` shows toast. |
| Form validation | Zod schemas validated on submit. Field-level errors displayed inline. |
| File parsing errors | Try/catch in `certParser.ts`. Specific error messages for invalid format, unsupported type, wrong password. |
| Network errors | Axios retry (3 attempts, exponential backoff). Offline banner via `navigator.onLine`. |
| React errors | `ErrorBoundary` at page level catches render crashes. Fallback UI with retry button. |
| Empty states | Dedicated `<EmptyState>` component with contextual message and action button. |

### 3.7 Audit Logging Design

Every certificate mutation (import, update, delete, revoke, export) is logged server-side in the `audit_entries` table. The logging happens **inside a database transaction** alongside the mutation to guarantee consistency.

Bulk imports share a `batch_id` (UUID v4) so the entire batch can be queried as a unit. Failed row attempts are also logged (with `result=FAILURE` and `error_reason`).

The audit log is **immutable**: no UPDATE or DELETE operations are exposed on `audit_entries`. Frontend displays in reverse-chronological order with filters for action type, actor, certificate, and date range.

---

## 4. Alternatives Considered

### 4.1 Backend Framework: Express vs Fastify

| | Express | Fastify (chosen) |
|---|---------|---------|
| Performance | Baseline | ~2× throughput |
| TypeScript | Community types (`@types/express`) | Native TS support |
| Validation | Manual (middleware) | Built-in JSON Schema |
| Plugin system | Middleware chain | Encapsulated plugins |
| Ecosystem | Largest | Growing, compatible with Express middleware via `@fastify/express` |

**Decision**: Fastify. Performance matters for 10k+ cert queries. Native TypeScript and JSON Schema validation reduce boilerplate. Express middleware compatibility via adapter if needed.

### 4.2 ORM: Prisma vs Knex.js vs TypeORM

| | Prisma (chosen) | Knex.js | TypeORM |
|---|-------|---------|---------|
| Type generation | Auto from schema | Manual | Decorators |
| Migrations | Built-in, declarative | Built-in, imperative | Built-in, sync/migration |
| Query builder | Typed, chainable | SQL-like, flexible | Repository pattern |
| Full-text search | `@@fulltext` directive | Raw SQL | Raw SQL |
| Learning curve | Low | Medium | Medium-High |

**Decision**: Prisma. Auto-generated types eliminate drift. Declarative schema is self-documenting. Full-text search support. Migration tooling is production-ready.

### 4.3 Styling: CSS Modules vs Tailwind CSS vs styled-components

| | CSS Modules (chosen) | Tailwind CSS | styled-components |
|---|-----------|-------------|-------------------|
| Runtime cost | Zero | Zero | ~12KB + runtime overhead |
| Design tokens | CSS custom properties | `tailwind.config.js` | Theme provider |
| Prototype match | Direct CSS mapping | Utility classes translation | CSS-in-JS mapping |
| Team familiarity | Standard CSS | Utility-first learning | JS-centric |

**Decision**: CSS Modules. Zero runtime cost, direct mapping from prototype CSS (which uses custom properties), scoped by default. The prototype's CSS is already well-structured with design tokens — CSS Modules let us reuse those patterns directly.

### 4.4 Table: TanStack Table vs AG Grid vs Custom

| | TanStack Table (chosen) | AG Grid | Custom |
|---|-------------|---------|--------|
| Bundle size | ~15KB (headless) | ~250KB | Variable |
| Styling freedom | Complete (headless) | Theme-locked | Complete |
| Server pagination | Built-in | Built-in | Manual |
| License | MIT | Community/Enterprise | N/A |

**Decision**: TanStack Table. Headless approach lets us match the prototype UI exactly. Small bundle. Server-side pagination/sorting/filtering are first-class features.

### 4.5 Monorepo vs Separate Repos

| | Monorepo (chosen) | Separate repos |
|---|---------|----------------|
| Type sharing | Direct imports | npm package / copy |
| CI/CD | Single pipeline | Per-repo pipelines |
| Atomic changes | Single commit | Cross-repo coordination |
| Team scaling | Needs workspace tooling | Natural isolation |

**Decision**: Monorepo with `frontend/`, `backend/`, `shared/` packages. For a greenfield MVP with a small team, atomic commits and direct type sharing outweigh the complexity. Uses npm workspaces (no extra tooling).

---

## 5. Consequences

### Positive

- **End-to-end type safety**: Prisma generates types → shared types → frontend consumes them. A schema change is caught at compile time across the entire stack.
- **Prototype fidelity**: CSS Modules + design tokens map directly to the approved prototype's CSS structure.
- **Performance by design**: Server-side pagination + PostgreSQL indexes + TanStack Query caching ensure <2s response times at 10k+ scale.
- **Extensibility**: The `routes/services/repositories` layered backend supports future features (C2–C5) by adding new route modules and service methods.
- **Developer velocity**: Vite HMR + Vitest watch + Prisma Studio provide instant feedback during development.

### Negative

- **Fastify learning curve**: Team may be more familiar with Express. Mitigated by Fastify's excellent docs and Express-compatible adapter.
- **Prisma limitations**: Complex queries (multi-table aggregations) may require raw SQL escapes. Acceptable for MVP scope.
- **Monorepo overhead**: Requires npm workspaces configuration and careful `tsconfig.json` project references. One-time setup cost.
- **Full-text search accuracy**: PostgreSQL `tsvector` is good but not Elasticsearch-level. Sufficient for MVP; can add dedicated search if needed later.

### Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Prisma schema changes break frontend | Shared types + CI type-check catches mismatches |
| CSS Modules verbose for large pages | Extract common patterns into reusable component modules |
| PKCS#12 password handling in browser | Only preview uses browser-side parsing; actual import sends encrypted file to backend |
| CSV import memory (10k rows) | Server-side streaming parse (papaparse stream mode), batch DB inserts of 500 rows |

---

## 6. Acceptance Criteria Coverage Matrix

Every acceptance criterion from the 68 scenarios is mapped to at least one implementation chunk:

| Functional Requirement | Scenarios | Backend Chunk | Frontend Chunk |
|------------------------|-----------|---------------|----------------|
| FR1: Display inventory list | 1.1–1.4 | Chunk 3 (CRUD API) | Chunk 7 (Inventory page) |
| FR2: Search certificates | 2.1–2.7 | Chunk 3 (CRUD API) | Chunk 7 (Inventory page) |
| FR3: Filter by expiration | 3.1–3.4 | Chunk 3 (CRUD API) | Chunk 7 (Inventory page) |
| FR4: Filter by env/CA/status/tags | 4.1–4.7 | Chunk 3 (CRUD API) | Chunk 7 (Inventory page) |
| FR5: Manual upload | 5.1–5.7 | Chunk 4 (Import service) | Chunk 8 (Upload + Import UI) |
| FR6: Bulk CSV import | 6.1–6.4 | Chunk 4 (Import service) | Chunk 8 (Upload + Import UI) |
| FR7: Certificate detail | 7.1–7.4 | Chunk 3 (CRUD API) | Chunk 9 (Detail page) |
| FR8: Performance | 8.1–8.4 | Chunk 3 (indexes + pagination) | Chunk 10 (Optimization + tests) |
| FR9: Audit logging | 9.1–9.3 | Chunk 5 (Audit service) | Chunk 9 (Detail + Audit UI) |
| FR10: Error handling | 10.1–10.5 | Chunk 4 (validation) | Chunk 10 (Error handling) |
| NF: Validation, security, privacy | NF.1–NF.3 | Chunk 4 + 5 (validation + auth) | Chunk 10 (Error boundaries) |

---

## 7. Implementation Chunks Summary

| # | Skill | Chunk | Dependencies |
|---|-------|-------|-------------|
| 1 | infra | Project scaffolding, monorepo setup & CI | None |
| 2 | backend | Database schema, Prisma model & seed data | Chunk 1 |
| 3 | backend | Certificate CRUD API: list, detail, search, filter, pagination, export | Chunk 2 |
| 4 | backend | Import service: single cert (PEM/PKCS#12/DER) + bulk CSV | Chunk 2 |
| 5 | backend | Audit logging service & API | Chunk 2 |
| 6 | frontend | Design system, app shell, Sidebar & routing | Chunk 1 |
| 7 | frontend | Inventory page: table, search, filters, pagination | Chunk 6, Chunk 3 |
| 8 | frontend | Upload (single) + Bulk CSV import pages | Chunk 6, Chunk 4 |
| 9 | frontend | Certificate detail page + Audit log page | Chunk 6, Chunk 3, Chunk 5 |
| 10 | frontend | Performance optimization, error handling & test suite | Chunks 7–9 |

See `docs/features/crud-certificado/build-order.md` for recommended implementation sequence.

---

**ADR Version**: 1.0  
**Last Updated**: 2026-05-27
