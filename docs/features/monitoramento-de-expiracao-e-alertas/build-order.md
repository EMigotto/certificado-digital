# Build Order: C3. Expiration Monitoring and Alerts

**Feature**: C3 — Monitoramento de Expiração e Alertas  
**Total Chunks**: 12  
**Date**: 2026-05-29

---

## Dependency Graph

```
Phase 1 — Foundation
  #46 [infra]    Schema migration
  #47 [backend]  Shared types
         ↓
Phase 2 — Backend Core (parallelizable)
  ┌─ #48 [backend]  Alert repo/service/routes
  ├─ #49 [backend]  Policy repo/service/routes
  └─ #53 [backend]  Dashboard API
         ↓
Phase 3 — Backend Scheduler + Notifications (sequential)
  #50 [backend]  Scheduler service  (depends on #48, #49)
    ├─► #51 [backend]  Email service   (depends on #50)
    └─► #52 [backend]  Webhook service (depends on #50)
         ↓
Phase 4 — Frontend (sequential, can start with MSW mocks after Phase 1)
  #54 [frontend]  KPI cards
    └─► #55 [frontend]  Heatmap + alerts panel
         └─► #56 [frontend]  Auto-refresh + loading/error
              └─► #57 [frontend]  Sidebar badge + final integration
```

---

## Recommended Build Order

| Order | Issue | Skill | Title | Depends On | Can Parallelize With |
|-------|-------|-------|-------|-----------|---------------------|
| 1 | #46 | infra | Prisma schema migration — expiration monitoring tables | — | — |
| 2 | #47 | backend | Shared domain types — alerts, policies, dashboard | #46 (review only) | — |
| 3a | #48 | backend | Alert repository, service & API routes | #46, #47 | #49, #53 |
| 3b | #49 | backend | Policy repository, service & API routes | #46, #47 | #48, #53 |
| 3c | #53 | backend | Dashboard API — snapshot, heatmap & critical alerts | #46, #47, #48 | #49 |
| 4 | #50 | backend | Expiration scheduler — daily threshold evaluation | #48, #49 | — |
| 5a | #51 | backend | Email notification dispatcher | #48, #50 | #52 |
| 5b | #52 | backend | Webhook notification dispatcher | #48, #50 | #51 |
| 6 | #54 | frontend | Dashboard KPI cards | #47, #53 | — |
| 7 | #55 | frontend | Dashboard heatmap & critical alerts panel | #54 | — |
| 8 | #56 | frontend | Dashboard auto-refresh, loading & error states | #55 | — |
| 9 | #57 | frontend | Sidebar dynamic badge, /expiring route & integration | #56 | — |

---

## Phase Descriptions

### Phase 1 — Foundation (Chunks #46, #47)

**Goal**: Establish the database schema and shared types that all other chunks depend on.

- **#46**: Run `npx prisma migrate dev` to create the 5 new tables. The `(certificateId, threshold)` unique constraint on `ExpirationAlert` is the backbone of deduplication.
- **#47**: Define TypeScript interfaces in `shared/types/` so both frontend and backend have type-safe contracts from the start.

**Gate**: Migration must succeed and types must compile before proceeding.

### Phase 2 — Backend Core (Chunks #48, #49, #53)

**Goal**: Build the three independent backend stacks (alerts, policies, dashboard) that the scheduler and frontend consume.

These three chunks are **parallelizable** — they share the schema and types but don't depend on each other (except #53 queries alerts, so it benefits from #48 existing).

- **#48**: Alert CRUD with deduplication logic. This is the most critical backend chunk — the scheduler (#50) calls it to create alerts.
- **#49**: Policy CRUD enables admin configuration. The scheduler (#50) reads policies to determine which thresholds/channels apply.
- **#53**: Dashboard API provides the data layer for the frontend. Uses snapshot caching for performance.

**Gate**: All three must have passing unit tests before Phase 3.

### Phase 3 — Scheduler + Notifications (Chunks #50, #51, #52)

**Goal**: Implement the core business logic — the daily job that evaluates certificates and dispatches notifications.

- **#50**: The scheduler is the heart of C3. It orchestrates threshold evaluation, alert creation, snapshot computation, and notification dispatch. Must be implemented before email/webhook services because it calls them.
- **#51** and **#52**: Email and webhook services are **parallelizable** — both consume alerts and create NotificationRecords, but don't depend on each other.

**Gate**: Scheduler must create alerts correctly and invoke notification services. Email/webhook services must handle retry logic.

### Phase 4 — Frontend (Chunks #54, #55, #56, #57)

**Goal**: Build the dashboard UI matching the approved prototype.

Frontend chunks are **sequential** because each builds on the previous component hierarchy:

- **#54**: Scaffolds the DashboardPage and KPI cards. Establishes the data fetching pattern.
- **#55**: Adds the heatmap and critical alerts panel below the KPI grid.
- **#56**: Adds auto-refresh (60s polling), loading skeletons, and error handling.
- **#57**: Final polish — dynamic sidebar badge, /expiring route, navigation wiring.

**Note**: Frontend work can begin as early as Phase 1 using MSW mocks for the API. The API contract is defined by shared types (#47).

---

## Infrastructure Prerequisites

Before starting implementation, the following infrastructure resources from `infrastructure.md` need human confirmation:

1. **Database schema extensions** — 5 new PostgreSQL tables (NEEDS_HUMAN_CONFIRMATION)
2. **Node.js node-cron scheduler** — in-process cron job (NEEDS_HUMAN_CONFIRMATION)
3. **SMTP service** — email delivery for notifications (NEEDS_HUMAN_CONFIRMATION)
4. **Webhook HTTP client** — outbound HTTP POST (NEEDS_HUMAN_CONFIRMATION)

Chunks #46, #50, #51 are **blocked** until the corresponding infrastructure is approved.

---

## Acceptance Criteria Coverage Summary

| AC Group | Scenarios | Covered By Chunks |
|----------|-----------|-------------------|
| 1. Scheduler | 1.1–1.5 | #46, #50 |
| 2. Email | 2.1–2.4 | #49, #51 |
| 3. Webhook | 3.1–3.4 | #49, #52 |
| 4. Dashboard | 4.1–4.7 | #53, #54, #55, #56 |
| 5. Deduplication | 5.1–5.2 | #46, #48, #50 |
| 6. Policy | 6.1–6.4 | #49 |
| SLA Test | 7-day → 24h | #50, #51, #52 |

**All 28 acceptance criteria scenarios are covered.**
