# ADR: C3 — Centralized Certificate Inventory

| Field       | Value                                                      |
|-------------|------------------------------------------------------------|
| **Feature** | C3 — Inventário Centralizado de Certificados               |
| **Status**  | Proposed                                                   |
| **Date**    | 2025-05-21                                                 |
| **Parent**  | PRD `docs/features/c3/prd.md`                              |

---

## 1. Context

The organization manages ~10 000 mTLS certificates across multiple CAs (Vault PKI, ACM PCA), environments (dev / hml / prd), and zones. Today there is **no single source of truth**: teams track certs in spreadsheets, wikis, or not at all. This leads to missed expirations, duplicated work, and compliance gaps.

Feature C3 delivers the **MVP certificate inventory**: a full-stack application that lets PKI administrators and platform engineers import, search, filter, view details, tag, export, and monitor certificate metadata — plus an expiration-focused dashboard with KPIs, heatmap, and critical alerts.

### What already exists

The repo contains:

* **Domain models** (`src/models/`) — `Certificate`, status computation, filter/search logic, pagination, import validation, tags/custom-fields.
* **Comprehensive unit tests** (`tests/unit/`) covering status, filters, pagination, import, tags, metadata, actions, search, and performance.
* **E2E tests & visual-regression snapshots** (`tests/e2e/`).
* **Approved prototype** (`docs/features/c3/prototype.html`) — six screens: Dashboard, Inventory, Detail, Emit (out of scope for C3), Audit Log, API & CLI reference.
* **CI pipeline** (GitHub Actions): unit tests + coverage (80 % threshold), Playwright E2E.
* **C2 chunks (#3–#8)** planned but not yet merged; C3 can be built independently on the same model layer.

### Decision drivers

| # | Driver | Priority |
|---|--------|----------|
| D1 | Must handle 10 000+ certs with <2 s query time (AC 35–36) | P0 |
| D2 | Must support PEM/PKCS#12 import, CSV bulk import (AC 1–4, 42, 46–48) | P0 |
| D3 | Must provide Dashboard with KPIs, heatmap, alerts (AC 24–28) | P0 |
| D4 | Must record audit log for every mutation (AC 21, 32–34) | P0 |
| D5 | Must be deployable with minimal infra (single-process, easy containerization) | P1 |
| D6 | Must follow existing codebase patterns (TypeScript, Vitest, Playwright) | P1 |
| D7 | Must be UI-faithful to approved prototype (dark theme, design tokens) | P1 |

---

## 2. Decision — Chosen Architecture

### 2.1 High-level stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Database** | SQLite via `better-sqlite3` | Zero-ops, single-file, handles 10 k rows trivially with proper indexes; easy to swap to PostgreSQL later. |
| **Backend** | Node.js + Express (TypeScript) | Matches existing TS codebase; rich ecosystem for cert parsing (`node-forge`). |
| **Frontend** | Vanilla TypeScript SPA (no framework) | Prototype is already self-contained HTML/CSS/JS; keeps bundle minimal; no React/Vue overhead for MVP. |
| **Build / Dev** | `esbuild` (bundler), `tsx` (dev server) | Fast, zero-config, aligns with existing `tsconfig`. |
| **Cert parsing** | `node-forge` | Parses PEM & PKCS#12, extracts CN, SANs, serial, fingerprint, algorithm, issuer, validity. |
| **CSV parsing** | `csv-parse` | Streaming parser; handles large files; validates row-by-row. |
| **Testing** | Vitest (unit), Playwright (E2E) | Already configured in repo. |

### 2.2 Database schema

```sql
-- Core certificate table
CREATE TABLE certificates (
  id            TEXT PRIMARY KEY,          -- UUID v4
  common_name   TEXT NOT NULL,
  sans          TEXT NOT NULL DEFAULT '[]', -- JSON array of strings
  serial        TEXT NOT NULL,
  issuer        TEXT NOT NULL,
  not_before    TEXT NOT NULL,             -- ISO-8601
  not_after     TEXT NOT NULL,             -- ISO-8601
  algorithm     TEXT NOT NULL,
  fingerprint_sha256 TEXT NOT NULL,
  owner         TEXT NOT NULL,
  application   TEXT NOT NULL DEFAULT '',
  environment   TEXT NOT NULL CHECK(environment IN ('dev','hml','prd')),
  zone          TEXT NOT NULL DEFAULT '',
  ca_provider   TEXT NOT NULL DEFAULT '',
  revoked       INTEGER NOT NULL DEFAULT 0,
  pem_content   TEXT,                      -- full PEM for download
  tags          TEXT NOT NULL DEFAULT '{}', -- JSON object { key: value }
  custom_fields TEXT NOT NULL DEFAULT '{}', -- JSON object
  description   TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Performance indexes (D1: <2 s for 10 k+ rows)
CREATE INDEX idx_cert_owner ON certificates(owner);
CREATE INDEX idx_cert_env   ON certificates(environment);
CREATE INDEX idx_cert_not_after ON certificates(not_after);
CREATE INDEX idx_cert_cn    ON certificates(common_name COLLATE NOCASE);
CREATE INDEX idx_cert_serial ON certificates(serial);
CREATE INDEX idx_cert_ca    ON certificates(ca_provider);

-- Audit log
CREATE TABLE audit_log (
  id         TEXT PRIMARY KEY,
  cert_id    TEXT,                       -- nullable (cert may be deleted)
  cert_cn    TEXT NOT NULL,
  action     TEXT NOT NULL CHECK(action IN ('CREATE','UPDATE','DELETE','REVOKE')),
  actor      TEXT NOT NULL DEFAULT 'system',
  result     TEXT NOT NULL CHECK(result IN ('SUCCESS','FAILURE')),
  details    TEXT NOT NULL DEFAULT '{}', -- JSON diff for UPDATE
  timestamp  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_audit_cert ON audit_log(cert_id);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_ts ON audit_log(timestamp);
```

### 2.3 REST API design

All endpoints under `/api/v1`.

| Method | Path | Purpose | AC |
|--------|------|---------|-----|
| `GET` | `/certificates` | List + search + filter + paginate | 5–18, 30, 35–37, 41, 45 |
| `GET` | `/certificates/:id` | Detail view | 19, 20, 43, 44 |
| `POST` | `/certificates` | Create (JSON body, metadata only) | 1, 38, 39 |
| `POST` | `/certificates/import/pem` | Upload single PEM | 1, 2, 48 |
| `POST` | `/certificates/import/pkcs12` | Upload single PKCS#12 | 1, 2 |
| `POST` | `/certificates/import/csv` | Bulk CSV import | 3, 4, 42, 46, 47 |
| `PATCH` | `/certificates/:id` | Update org fields / tags | 29, 33, 43 |
| `DELETE` | `/certificates/:id` | Soft-delete or hard-delete | 23, 34 |
| `GET` | `/certificates/:id/download` | Download PEM file | 22 |
| `GET` | `/certificates/export` | Export filtered list as CSV or JSON | 31, 40 |
| `GET` | `/dashboard/stats` | KPI counts (total, valid, expiring, expired/revoked) | 24, 25 |
| `GET` | `/dashboard/heatmap` | 90-day expiration distribution (array of 90 ints) | 27, 28 |
| `GET` | `/dashboard/alerts` | Top-N soonest-expiring certs | 26 |
| `GET` | `/audit` | Global audit log with filters | 21, 32–34 |
| `GET` | `/certificates/:id/audit` | Audit log for single cert | 21 |

**Query parameters for `GET /certificates`:**

| Param | Example | Notes |
|-------|---------|-------|
| `q` | `api-payments` | Free-text search (CN, SANs, serial, owner) — case-insensitive substring |
| `environment` | `prd` | Enum filter |
| `owner` | `team-payments` | Exact match |
| `ca` | `Vault PKI` | Substring match |
| `status` | `expired` | Computed status filter |
| `tag` | `critical-app` | Tag key existence |
| `expires_before` | `30` | Max days until expiry |
| `page` | `2` | 1-based page number |
| `page_size` | `50` | Default 50, max 100 |
| `sort` | `not_after` | Sort field |
| `order` | `asc` | Sort direction |

### 2.4 Frontend architecture

```
src/
  frontend/
    index.html          # SPA shell (sidebar, main container)
    styles/
      tokens.css        # Design tokens from prototype (--bg, --accent, etc.)
      components.css    # Component styles (kpi, table, badges, etc.)
    scripts/
      app.ts            # Router, init
      api.ts            # fetch wrapper for /api/v1/*
      router.ts         # Hash-based SPA router
      pages/
        dashboard.ts    # KPIs + heatmap + alerts (AC 24–28)
        inventory.ts    # Table + search + filters + pagination (AC 5–18)
        detail.ts       # Metadata grid + PEM + audit + actions (AC 19–23, 29, 43–44)
        audit-log.ts    # Global audit log page (AC 32–34)
        import.ts       # Import dialog/page (AC 1–4, 38–39, 42, 46–48)
      components/
        kpi-card.ts
        heatmap.ts
        alert-list.ts
        cert-table.ts
        filter-bar.ts
        pagination.ts
        badge.ts
        audit-table.ts
```

The frontend uses:
* **Hash-based routing** (`#/dashboard`, `#/certificates`, `#/certificates/:id`, `#/audit`, `#/import`).
* **`fetch()` API client** talking to Express backend on same origin.
* **CSS variables** extracted from the approved prototype to `tokens.css`.
* **No framework** — plain DOM manipulation with typed helper functions.

### 2.5 Certificate parsing pipeline

```
User uploads PEM/PKCS#12
  → multer middleware (temp file)
  → node-forge: parse cert → extract fields
  → validate required org-metadata (owner, env)
  → insert into SQLite
  → create audit log entry (CREATE / SUCCESS)
  → return parsed cert JSON
```

For CSV bulk import:
```
User uploads CSV file
  → csv-parse: stream rows
  → validate each row (required fields, env enum)
  → for each valid row: insert cert + audit entry
  → stop-on-error: commit rows up to first failure, report row number
  → return ImportResult { imported, failed, errors[] }
```

### 2.6 Dashboard aggregation queries

All dashboard data is computed via SQLite aggregate queries (not in-memory):

```sql
-- KPI: total
SELECT COUNT(*) FROM certificates;

-- KPI: valid (not expired, not revoked)
SELECT COUNT(*) FROM certificates
WHERE not_after > datetime('now') AND revoked = 0;

-- KPI: expiring <30d
SELECT COUNT(*) FROM certificates
WHERE not_after > datetime('now')
  AND not_after <= datetime('now', '+30 days')
  AND revoked = 0;

-- KPI: expired + revoked
SELECT
  SUM(CASE WHEN not_after <= datetime('now') AND revoked = 0 THEN 1 ELSE 0 END) as expired,
  SUM(CASE WHEN revoked = 1 THEN 1 ELSE 0 END) as revoked
FROM certificates;

-- Heatmap: group by day offset (0–89)
SELECT
  CAST(julianday(date(not_after)) - julianday(date('now')) AS INTEGER) as day_offset,
  COUNT(*) as count
FROM certificates
WHERE not_after >= datetime('now')
  AND not_after < datetime('now', '+90 days')
  AND revoked = 0
GROUP BY day_offset;

-- Alerts: top-5 soonest
SELECT * FROM certificates
WHERE not_after > datetime('now') AND revoked = 0
ORDER BY not_after ASC
LIMIT 5;
```

### 2.7 Project structure (final)

```
├── src/
│   ├── models/           # Existing domain models (unchanged)
│   ├── server/
│   │   ├── index.ts      # Express app entry
│   │   ├── db.ts         # SQLite init + migrations
│   │   ├── routes/
│   │   │   ├── certificates.ts
│   │   │   ├── dashboard.ts
│   │   │   └── audit.ts
│   │   ├── services/
│   │   │   ├── certificate-service.ts
│   │   │   ├── dashboard-service.ts
│   │   │   ├── audit-service.ts
│   │   │   ├── import-service.ts
│   │   │   └── export-service.ts
│   │   └── middleware/
│   │       └── upload.ts    # multer config
│   └── frontend/
│       ├── index.html
│       ├── styles/
│       └── scripts/
├── tests/
│   ├── unit/             # Existing + new service tests
│   └── e2e/              # Existing + new flow tests
├── docs/features/c3/
└── data/                 # SQLite DB file (gitignored)
```

---

## 3. Alternatives Considered

### 3.1 PostgreSQL instead of SQLite

| Pros | Cons |
|------|------|
| Full-text search, JSONB, concurrent writes | Requires separate process / Docker Compose |
| Better for multi-instance deployment | Overkill for MVP with 10 k rows |
| Production-proven at scale | Adds ops burden |

**Decision:** SQLite for MVP. Schema is designed for easy migration to PostgreSQL (standard SQL types, no SQLite-specific features beyond `julianday`).

### 3.2 React / Next.js for frontend

| Pros | Cons |
|------|------|
| Component model, state management | Heavy dependency; prototype is already vanilla HTML/CSS |
| Ecosystem (libraries, tooling) | Build complexity; learning curve for contributors |
| SSR for SEO (not needed here) | Bundle size for internal tool |

**Decision:** Vanilla TS SPA. The prototype already defines all UI components as static HTML/CSS. Converting to React adds overhead without benefit for this internal tool. Migration to React is possible later by wrapping the same API client.

### 3.3 Fastify instead of Express

| Pros | Cons |
|------|------|
| Faster, schema validation built-in | Smaller ecosystem for middleware |
| Plugin architecture | Team familiarity is lower |

**Decision:** Express. Widely known, abundant middleware (multer for uploads), minimal setup.

### 3.4 In-memory store (no database)

| Pros | Cons |
|------|------|
| Simplest implementation | Data lost on restart |
| No dependencies | Cannot handle 10 k+ certs efficiently for aggregations |

**Decision:** Rejected. Persistence is a core requirement; audit log must survive restarts.

---

## 4. Consequences

### Positive

* **Zero external infrastructure** — single `npm start` runs everything (SQLite file auto-created).
* **Type-safe end-to-end** — TypeScript on both client and server; domain models shared.
* **Faithful to prototype** — CSS variables extracted directly from approved HTML; pixel-accurate.
* **Performance guaranteed** — SQLite with indexes handles 10 k row queries in <50 ms; well within <2 s SLA even with network overhead.
* **Incremental** — builds on existing models; C2 chunks can merge independently.

### Negative / Risks

* **SQLite concurrency** — single-writer lock; acceptable for MVP but will need migration for high-write workloads.
* **No auth** — C3 assumes authenticated user per PRD; auth is out of scope. All endpoints are open. Needs middleware before production.
* **No real certificate chain validation** — `node-forge` parses certs but doesn't verify trust chains. Acceptable per PRD scope.
* **Vanilla SPA complexity** — if UI grows significantly, lack of component framework may slow development. Mitigated by keeping pages modular.

### Migration path

* SQLite → PostgreSQL: change `db.ts` connection + update `julianday()` calls to `EXTRACT(EPOCH ...)`.
* Vanilla SPA → React: wrap existing API client; migrate page-by-page.
* Single-process → microservices: extract `services/` into separate packages behind same REST contract.

---

## 5. Acceptance Criteria Coverage Map

| AC Scenario(s) | Chunk | Description |
|-----------------|-------|-------------|
| — | 1 | Project scaffolding, database, server skeleton |
| 1, 2, 38, 39, 46–48 | 2 | Certificate import (PEM, PKCS#12, validation) |
| 3, 4, 42, 47 | 3 | Bulk CSV import |
| 5–18, 30, 35–37, 41, 45 | 4 | Certificate CRUD API + search + filter + pagination |
| 19–23, 29, 43, 44, 49 | 4 | Certificate detail & actions (covered by CRUD API) |
| 32–34 | 5 | Audit log recording & querying |
| 31, 40 | 4 | Export (CSV, JSON) |
| 24–28 | 6 | Dashboard KPIs, heatmap, alerts |
| All UI scenarios | 7 | Frontend SPA (all screens) |
| 50 | 4 | Pagination boundary test |

---

## 6. Chunk Decomposition

See `docs/features/c3/build-order.md` for implementation sequence and GitHub issue numbers.
