# ADR: C3. Expiration Monitoring and Alerts

**Feature**: C3 — Monitoramento de Expiração e Alertas  
**Status**: Accepted  
**Date**: 2026-05-29  
**Decision makers**: Tech Lead Agent

---

## 1. Context

The platform already manages a certificate inventory (C1) and lifecycle operations (C2) via a Fastify 5 / React 19 / Prisma / PostgreSQL monorepo. The next capability — **C3 Expiration Monitoring & Alerts** — requires:

1. A **daily scheduler** that evaluates every active certificate against configurable thresholds (90, 30, 7, 1 days) and creates expiration alerts.
2. **Multi-channel notification dispatch** (email + webhooks) with retry, deduplication, and audit logging.
3. A **dashboard** with KPI cards, a 90-day expiration heatmap, and a critical-alerts panel — auto-refreshing every 60 seconds.
4. **Policy management** allowing PKI admins to define threshold/channel configuration per zone.

### Current State

| Layer | What exists | What needs to change |
|-------|-------------|---------------------|
| **Database** | `Certificate` and `AuditEntry` Prisma models; PostgreSQL 16 | Add 5 new models: `ExpirationAlert`, `NotificationRecord`, `ExpirationPolicy`, `ExpirationWebhook`, `ExpirationSnapshot` |
| **Backend** | Fastify 5 server with certificate/import/audit routes; layered architecture (routes → services → repos → Prisma) | Add scheduler job, notification dispatchers, dashboard API, alert/policy CRUD routes |
| **Frontend** | React 19 SPA with Layout, Sidebar, pages (Inventory, Detail, Upload, BulkImport, Audit); `DashboardPage` is a placeholder | Implement Dashboard page (KPIs, heatmap, alerts), add hooks and API services |
| **Shared** | Types for Certificate, AuditEntry, Filters, API envelopes | Add types for ExpirationAlert, Policy, Dashboard, Webhook |
| **Config** | Zod-validated env vars (DATABASE_URL, PORT, HOST, NODE_ENV, CORS_ORIGIN) | Add SMTP_*, WEBHOOK_*, EXPIRATION_SCHEDULER_* env vars |

### Decision Drivers

- **Consistency**: Follow the existing layered architecture (routes → services → repos) and TypeScript-strict conventions.
- **Simplicity**: MVP scope — choose the lightest solution that satisfies acceptance criteria without over-engineering.
- **Testability**: All business logic must be unit-testable with mocked dependencies.
- **Infrastructure caution**: New persistent resources (DB tables, SMTP, scheduler) need human confirmation per infrastructure gate.
- **Performance**: Dashboard queries must complete within 2 seconds for 10,000+ certificates (AC 4.7).
- **Reliability**: Alert deduplication, idempotent scheduler runs, retry with exponential backoff.

---

## 2. Architecture Decisions

### 2.1 Database Schema — Prisma Migration

**Decision**: Extend the Prisma schema with 5 new models and generate a migration.

**Models**:

| Model | Purpose | Key Indexes |
|-------|---------|-------------|
| `ExpirationAlert` | One record per certificate × threshold; stores snapshot at alert time | `(certificateId, threshold)` UNIQUE, `status`, `triggeredAt` |
| `NotificationRecord` | Immutable log of each email/webhook attempt per alert | `alertId`, `channel`, `status` |
| `ExpirationPolicy` | Configurable thresholds + channels per zone or global | `zoneId` UNIQUE (nullable), `isDefault` |
| `ExpirationWebhook` | Webhook endpoint config linked to a policy | `policyId` |
| `ExpirationSnapshot` | Daily cached KPI + heatmap data for dashboard performance | `snapshotDate` UNIQUE |

**Rationale**:
- Prisma gives us type-safe queries and auto-generated migrations.
- The `(certificateId, threshold)` unique constraint enforces deduplication at the DB level (AC 5.1, 5.2).
- `ExpirationSnapshot` pre-computes dashboard data daily, keeping dashboard queries under 100ms (AC 4.7).
- All new models follow existing conventions: `@id @default(uuid())`, `createdAt`/`updatedAt` timestamps, `@map()` for snake_case table/column names.

**Alternatives Considered**:
- *Embed alerts in Certificate model*: Rejected — separate table allows independent querying, pagination, and audit without bloating certificate reads.
- *Store thresholds as individual boolean columns*: Rejected — JSON `thresholds` field on `ExpirationPolicy` is more flexible and matches the PRD model.

### 2.2 Scheduler — `node-cron` In-Process

**Decision**: Use `node-cron` as an in-process scheduler running inside the Fastify backend.

**Configuration**:
```
EXPIRATION_SCHEDULER_ENABLED=true       # toggle on/off
EXPIRATION_SCHEDULER_CRON=0 0 * * *     # daily at 00:00 UTC
```

**Implementation**:
- On server startup (when `EXPIRATION_SCHEDULER_ENABLED=true`), register the cron job.
- The job calls `ExpirationSchedulerService.runCheck()` which:
  1. Queries all certificates with `status IN (VALID, EXPIRING_SOON)` and `notAfter > now()`.
  2. Processes in batches of 500 to stay within the 5-minute SLA (AC 1.5).
  3. For each cert, evaluates thresholds (90, 30, 7, 1) against the applicable policy.
  4. Uses `upsert` with the `(certificateId, threshold)` unique constraint for deduplication (AC 1.2, 5.1).
  5. Creates `ExpirationAlert` records with status `PENDING`.
  6. After alert creation, triggers notification dispatch (email + webhook) asynchronously.
  7. Updates `ExpirationSnapshot` for dashboard caching.
- Manual trigger via `POST /api/internal/scheduler/expiration-check` (AC 5.2).

**Rationale**:
- `node-cron` is lightweight, zero-dependency (no Redis/external queue needed for MVP).
- In-process means no deployment complexity; the scheduler lifecycle is tied to the server.
- Idempotency is guaranteed by the DB unique constraint, not application-level locking.

**Alternatives Considered**:
- *Bull + Redis*: More robust for horizontal scaling, but adds Redis dependency; deferred to Phase 2.
- *Kubernetes CronJob*: No K8s in this environment; deferred to Phase 2.
- *AWS Lambda + EventBridge*: Not available in Homologacao; deferred to Phase 2.

### 2.3 Email Notification — Nodemailer

**Decision**: Use `nodemailer` library for SMTP email delivery.

**Configuration** (env vars validated by Zod in `config.ts`):
```
SMTP_HOST=mail.bank.internal
SMTP_PORT=587
SMTP_USER=noreply-cipher@bank.internal
SMTP_PASSWORD=<secret>
SMTP_FROM_ADDRESS=no-reply@cipher.internal
SMTP_FROM_NAME=Certificate Expiration Alerts
```

**Implementation**:
- `EmailNotificationService` creates a reusable Nodemailer transporter on init.
- Sends both HTML and plain-text MIME parts (AC 2.1).
- TO = certificate owner; CC = policy additional recipients (AC 2.2).
- Retry: up to 3 attempts with exponential backoff (1s, 5s, 30s) (AC 2.3).
- Creates `NotificationRecord` for each attempt with status `SUCCESS`, `FAILED`, or `SKIPPED`.
- Respects policy `emailEnabled` flag (AC 2.4).

**Rationale**:
- Nodemailer is the de-facto Node.js email library; battle-tested, supports connection pooling.
- Plain SMTP gives control over retry logic and error handling vs. SaaS APIs.

**Alternatives Considered**:
- *SendGrid API*: Higher deliverability, but third-party dependency; can be added as a provider option later.
- *AWS SES*: Excellent fit but availability in Homologacao unconfirmed; can be swapped in via provider pattern.

### 2.4 Webhook Notification — Built-in HTTP Client

**Decision**: Use the native `fetch` API (Node 18+) with a custom retry wrapper for webhook delivery.

**Implementation**:
- `WebhookNotificationService` sends HTTP POST with JSON payload (AC 3.1).
- Timeout: configurable per webhook, default 10 seconds (AC 3.3).
- Retry: up to `maxRetries` (default 3) with exponential backoff: 1s, 5s, 30s (AC 3.2).
- Respects webhook `isActive` flag (AC 3.4).
- Creates `NotificationRecord` for each attempt.

**Rationale**:
- Native `fetch` avoids adding another HTTP client dependency (Axios is frontend-only).
- Custom retry wrapper matches the specific backoff strategy in the PRD.

**Alternatives Considered**:
- *Axios server-side*: Works, but `fetch` is built-in since Node 18 and more lightweight.
- *Webhook proxy service*: Over-engineered for MVP; deferred to Phase 2.

### 2.5 Dashboard API — Snapshot + On-Demand

**Decision**: Hybrid approach — serve dashboard data from cached `ExpirationSnapshot` when fresh, fall back to on-demand computation.

**Endpoints**:
| Endpoint | Source | Cache |
|----------|--------|-------|
| `GET /api/dashboard/snapshot` | `ExpirationSnapshot` table (today's row) or compute on-demand | HTTP `Cache-Control: max-age=30` |
| `GET /api/dashboard/heatmap?days=90` | Aggregation query grouped by `DATE(notAfter)` | Included in snapshot |
| `GET /api/dashboard/critical-alerts?limit=5` | `ExpirationAlert` sorted by `daysUntilExpiryAtAlert ASC` | Live query |

**Rationale**:
- The daily scheduler already runs through all certificates; computing and storing the snapshot at that point costs nearly nothing.
- Serving from a single-row read (< 1ms) vs. scanning 10K certificates (1-2s) is a 1000x improvement.
- On-demand fallback ensures the dashboard works even if the scheduler hasn't run yet today.

**Alternatives Considered**:
- *Redis cache*: Faster reads, but adds infrastructure dependency; not needed when PostgreSQL single-row read is < 5ms.
- *Materialized view*: PostgreSQL-native, but harder to manage with Prisma; `ExpirationSnapshot` table is simpler.
- *Real-time only (no cache)*: Would risk exceeding the 2-second SLA on large inventories.

### 2.6 Frontend Dashboard — Component Architecture

**Decision**: Implement the dashboard as a page with three sub-components, using TanStack Query for data fetching and 60-second polling.

**Component tree**:
```
DashboardPage
├── KpiGrid (4 cards)
│   └── KpiCard × 4
├── DashboardGrid (2-column layout)
│   ├── HeatmapPanel
│   │   ├── HeatmapGrid (90 cells)
│   │   ├── HeatmapAxis
│   │   └── HeatmapLegend
│   └── CriticalAlertsPanel
│       └── AlertItem × 5
└── LastUpdatedBanner
```

**Data fetching**:
- `useDashboardSnapshot()` — TanStack Query hook with `refetchInterval: 60_000` (AC 4.6).
- `useCriticalAlerts(limit)` — TanStack Query hook with same interval.
- Both hooks use the `api` Axios instance already configured in `frontend/src/services/api.ts`.

**Styling**:
- CSS Modules following existing conventions (`.module.css` files co-located with components).
- Design tokens from the prototype (CSS custom properties in `:root`).

**Rationale**:
- TanStack Query's `refetchInterval` provides auto-refresh with built-in stale/loading/error states.
- Component decomposition matches the prototype layout and allows independent testing.
- CSS Modules ensure style isolation, consistent with the rest of the codebase.

**Alternatives Considered**:
- *WebSocket for real-time updates*: Over-engineered for 60-second refresh; adds server complexity.
- *Zustand for dashboard state*: TanStack Query already handles server state; Zustand is for UI state only (sidebar toggle, etc.).

### 2.7 Shared Types Extension

**Decision**: Add new type files in `shared/types/` and re-export from `index.ts`.

**New files**:
- `shared/types/alert.ts` — `ExpirationAlert`, `NotificationRecord`, `AlertStatus`, `NotificationChannel`
- `shared/types/policy.ts` — `ExpirationPolicy`, `ExpirationWebhook`, `ThresholdConfig`
- `shared/types/dashboard.ts` — `DashboardSnapshot`, `HeatmapData`, `KpiData`, `CriticalAlert`

**Rationale**: Follows existing pattern where each domain has its own type file, re-exported from `index.ts`.

### 2.8 Backend Config Extension

**Decision**: Extend the Zod env schema in `backend/src/config.ts` with new optional env vars for SMTP, webhook, and scheduler.

All new vars have sensible defaults and are **optional** (the server starts without them; features are disabled):
- `SMTP_*` vars default to empty strings; `EmailNotificationService` checks `SMTP_HOST` presence before sending.
- `EXPIRATION_SCHEDULER_ENABLED` defaults to `false`; scheduler only starts when explicitly enabled.
- `WEBHOOK_*` vars have safe defaults (timeout 10s, retries 3).

**Rationale**: Existing services (inventory, audit) continue working unchanged. New features degrade gracefully when config is missing.

---

## 3. Consequences

### Positive
- **No new infrastructure in code** — all persistent resources (DB tables, SMTP, scheduler toggle) are environment-configurable and gated by `infrastructure.md`.
- **Idempotent by design** — unique DB constraint on `(certificateId, threshold)` prevents duplicate alerts regardless of how many times the scheduler runs.
- **Dashboard performance** — snapshot caching ensures sub-100ms reads even at 10K+ certificates.
- **Testability** — layered architecture with dependency injection (repository pattern) allows mocking at every boundary.
- **Backward compatible** — no changes to existing Certificate or AuditEntry schemas; only additive models.

### Negative / Risks
- **In-process scheduler** — if the Fastify server crashes, the scheduler stops. Mitigation: health check endpoint + ops monitoring.
- **Single-instance only** — `node-cron` runs in one process; if backend is scaled horizontally, multiple instances would run the same job. Mitigation: use the DB unique constraint for deduplication; or add a distributed lock in Phase 2.
- **SMTP dependency** — email delivery depends on external SMTP server availability. Mitigation: retry logic + ops alerting on persistent failures.

### Neutral
- **5 new database tables** — adds schema complexity but is cleanly isolated in its own migration.
- **~15 new files** in backend (routes, services, repos, utils) and ~10 in frontend (components, hooks, services).

---

## 4. File Impact Map

### Backend (new files)

| Path | Purpose |
|------|---------|
| `backend/prisma/migrations/YYYYMMDD_add_expiration_monitoring/migration.sql` | Prisma-generated DDL |
| `backend/src/repositories/alertRepo.ts` | ExpirationAlert + NotificationRecord CRUD |
| `backend/src/repositories/policyRepo.ts` | ExpirationPolicy + ExpirationWebhook CRUD |
| `backend/src/repositories/dashboardRepo.ts` | ExpirationSnapshot + aggregation queries |
| `backend/src/services/alertService.ts` | Alert business logic, dedup, acknowledge |
| `backend/src/services/policyService.ts` | Policy CRUD, webhook test |
| `backend/src/services/schedulerService.ts` | Daily evaluation, batch processing |
| `backend/src/services/emailService.ts` | Nodemailer transporter, templates, retry |
| `backend/src/services/webhookService.ts` | HTTP POST dispatch, retry, circuit breaker |
| `backend/src/services/dashboardService.ts` | Snapshot computation, KPI aggregation |
| `backend/src/routes/alerts.ts` | `/api/alerts/expiration` CRUD routes |
| `backend/src/routes/policies.ts` | `/api/policies/expiration` CRUD routes |
| `backend/src/routes/dashboard.ts` | `/api/dashboard/*` routes |
| `backend/src/routes/scheduler.ts` | `/api/internal/scheduler/*` routes |
| `backend/src/scheduler/cronJob.ts` | `node-cron` setup and lifecycle |

### Backend (modified files)

| Path | Change |
|------|--------|
| `backend/prisma/schema.prisma` | Add 5 new models + enums |
| `backend/src/config.ts` | Add SMTP_*, WEBHOOK_*, SCHEDULER_* env vars |
| `backend/src/server.ts` | Register new route plugins + scheduler init |
| `backend/package.json` | Add `nodemailer`, `node-cron` deps |

### Shared (new files)

| Path | Purpose |
|------|---------|
| `shared/types/alert.ts` | ExpirationAlert, NotificationRecord types |
| `shared/types/policy.ts` | ExpirationPolicy, Webhook types |
| `shared/types/dashboard.ts` | DashboardSnapshot, KPI, Heatmap types |

### Shared (modified files)

| Path | Change |
|------|--------|
| `shared/types/index.ts` | Re-export new type modules |

### Frontend (new files)

| Path | Purpose |
|------|---------|
| `frontend/src/pages/Dashboard/DashboardPage.tsx` | Full dashboard implementation |
| `frontend/src/pages/Dashboard/components/KpiGrid.tsx` | 4 KPI cards |
| `frontend/src/pages/Dashboard/components/KpiCard.tsx` | Single KPI card component |
| `frontend/src/pages/Dashboard/components/HeatmapPanel.tsx` | Heatmap with grid, axis, legend |
| `frontend/src/pages/Dashboard/components/CriticalAlertsPanel.tsx` | Top 5 alerts list |
| `frontend/src/pages/Dashboard/components/AlertItem.tsx` | Single alert row |
| `frontend/src/pages/Dashboard/DashboardPage.module.css` | Dashboard styles |
| `frontend/src/hooks/useDashboardSnapshot.ts` | TanStack Query hook for dashboard data |
| `frontend/src/hooks/useCriticalAlerts.ts` | TanStack Query hook for top alerts |
| `frontend/src/services/dashboardApi.ts` | Dashboard API client functions |

### Frontend (modified files)

| Path | Change |
|------|--------|
| `frontend/src/pages/DashboardPage.tsx` | Re-export from new Dashboard/ module |
| `frontend/src/components/Sidebar/Sidebar.tsx` | Dynamic badge from dashboard data |
| `frontend/src/router.tsx` | Ensure `/dashboard` route uses new page (already exists) |

---

## 5. Acceptance Criteria Coverage Matrix

| AC Scenario | Chunk(s) |
|-------------|----------|
| 1.1 Scheduler triggers thresholds | #5 Scheduler Service |
| 1.2 No duplicate alerts | #5 Scheduler Service, #1 Schema (unique constraint) |
| 1.3 Expired/revoked ignored | #5 Scheduler Service |
| 1.4 Retry on failure | #5 Scheduler Service |
| 1.5 Scale to 10K certs | #5 Scheduler Service |
| 2.1 Email sent to owner | #6 Email Service |
| 2.2 Additional recipients | #6 Email Service |
| 2.3 Email retry on failure | #6 Email Service |
| 2.4 Email suppressed by policy | #6 Email Service, #4 Policy Service |
| 3.1 Webhook dispatched | #7 Webhook Service |
| 3.2 Webhook retries | #7 Webhook Service |
| 3.3 Webhook timeout | #7 Webhook Service |
| 3.4 Webhook disabled | #7 Webhook Service, #4 Policy Service |
| 4.1 KPI Total Managed | #8 Dashboard API, #9 KPI Cards |
| 4.2 KPI Valid | #8 Dashboard API, #9 KPI Cards |
| 4.3 KPI Expiring < 30d | #8 Dashboard API, #9 KPI Cards |
| 4.4 Heatmap colors | #8 Dashboard API, #10 Heatmap + Alerts UI |
| 4.5 Critical alerts panel | #8 Dashboard API, #10 Heatmap + Alerts UI |
| 4.6 Auto-refresh 60s | #11 Auto-refresh & Integration |
| 4.7 Query SLA (< 2s) | #8 Dashboard API |
| 5.1 No duplicate alert (DB) | #1 Schema, #5 Scheduler Service |
| 5.2 Manual scheduler safe | #5 Scheduler Service |
| 6.1 Create policy | #4 Policy Service |
| 6.2 Update policy | #4 Policy Service |
| 6.3 Set default policy | #4 Policy Service |
| 6.4 Delete policy | #4 Policy Service |
| SLA: 7-day alert within 24h | #5 Scheduler + #6 Email + #7 Webhook |

All 28 acceptance criteria scenarios are covered by at least one chunk.

---

## 6. Dependencies & Sequencing

```
[1] Schema Migration
 └─► [2] Shared Types
      ├─► [3] Alert Repo/Service/Routes
      ├─► [4] Policy Repo/Service/Routes
      │    └─► [5] Scheduler Service
      │         ├─► [6] Email Service
      │         └─► [7] Webhook Service
      └─► [8] Dashboard API
           └─► [9] KPI Cards (frontend)
                └─► [10] Heatmap + Alerts (frontend)
                     └─► [11] Auto-refresh & Integration (frontend)
                          └─► [12] Sidebar Badge + Final Polish
```

Critical path: 1 → 2 → 4 → 5 → 6/7 (backend core)  
Parallelizable: Chunks 3, 4, 8 can start in parallel after chunk 2.  
Frontend: Chunks 9-12 can begin once chunk 8 provides API contracts (can use MSW mocks).
