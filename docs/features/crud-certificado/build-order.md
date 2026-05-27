# Build Order: C1 — Inventário Centralizado de Certificados

**Feature Slug**: `crud-certificado`  
**Total Chunks**: 10  
**Date**: 2026-05-27  

---

## Dependency Graph

```
                    ┌────────────────────────┐
                    │  #29 [infra] Chunk 1   │
                    │  Scaffolding & CI      │
                    └───────────┬────────────┘
                                │
                 ┌──────────────┼──────────────┐
                 ▼              ▼              ▼
     ┌───────────────┐  ┌─────────────┐  ┌─────────────┐
     │ #30 [backend]  │  │ #30 [back]  │  │ #34 [front] │
     │ Chunk 2: DB    │  │ (same)      │  │ Chunk 6:    │
     │ Schema & Seed  │  │             │  │ Design Sys  │
     └───────┬────────┘  └──────┬──────┘  └──────┬──────┘
             │                  │                 │
    ┌────────┼──────────┐      │         ┌───────┴──────────┐
    ▼        ▼          ▼      │         ▼                  │
┌───────┐ ┌───────┐ ┌───────┐ │   ┌──────────┐             │
│ #31   │ │ #32   │ │ #33   │ │   │ #35      │             │
│Ch3:   │ │Ch4:   │ │Ch5:   │ │   │Ch7:      │             │
│CRUD   │ │Import │ │Audit  │ │   │Inventory │             │
│API    │ │Service│ │Service│ │   │Page      │             │
└───┬───┘ └───┬───┘ └───┬───┘ │   └────┬─────┘             │
    │         │         │     │        │                    │
    │         │         │     │   ┌────┴────┐               │
    │         │         │     │   ▼         ▼               ▼
    │         │         │     │ ┌──────┐  ┌──────┐    ┌──────┐
    │         │         │     │ │ #36  │  │ #37  │    │ #37  │
    │         │         └─────┼─│Ch8:  │  │Ch9:  │────│(same)│
    │         └───────────────┼─│Upload│  │Detail │   │      │
    └─────────────────────────┘ │+CSV  │  │+Audit│   │      │
                                └──┬───┘  └──┬───┘   └──────┘
                                   │         │
                                   ▼         ▼
                              ┌──────────────────┐
                              │ #38 [frontend]    │
                              │ Chunk 10: Perf,   │
                              │ Errors & Tests    │
                              └──────────────────┘
```

---

## Recommended Implementation Order

### Phase 1: Foundation (Chunks 1–2 + 6) — Start here

| Order | Issue | Chunk | Skill | Description | Depends On |
|-------|-------|-------|-------|-------------|------------|
| 1 | #29 | 1/10 | infra | Project scaffolding, monorepo setup & CI | — |
| 2a | #30 | 2/10 | backend | Database schema, Prisma model & seed data | #29 |
| 2b | #34 | 6/10 | frontend | Design system, app shell, Sidebar & routing | #29 |

> **Note**: Chunks 2 (backend schema) and 6 (frontend shell) can be developed **in parallel** after Chunk 1 is complete. They are independent of each other.

---

### Phase 2: Backend Core (Chunks 3–5) — Backend API

| Order | Issue | Chunk | Skill | Description | Depends On |
|-------|-------|-------|-------|-------------|------------|
| 3a | #31 | 3/10 | backend | Certificate CRUD API: list, detail, search, filter, pagination, export | #30 |
| 3b | #32 | 4/10 | backend | Import service: single cert (PEM/PKCS#12/DER) + bulk CSV | #30 |
| 3c | #33 | 5/10 | backend | Audit logging service & API | #30 |

> **Note**: All three backend chunks depend only on Chunk 2 (schema) and can be developed **in parallel**. However, Chunk 4 (import) calls audit logging from Chunk 5 — use a simple stub/inline audit call during development, then integrate when Chunk 5 is ready.

---

### Phase 3: Frontend Pages (Chunks 7–9) — UI Implementation

| Order | Issue | Chunk | Skill | Description | Depends On |
|-------|-------|-------|-------|-------------|------------|
| 4 | #35 | 7/10 | frontend | Inventory page: table, search, filters, pagination | #34, #31 |
| 5 | #36 | 8/10 | frontend | Upload (single cert) + Bulk CSV import pages | #34, #32 |
| 6 | #37 | 9/10 | frontend | Certificate detail page + Audit log page | #34, #31, #33 |

> **Note**: Chunk 7 (inventory) should be built first — it's the main page and validates the core data flow. Chunks 8 and 9 can then proceed in parallel. All frontend chunks can start with MSW mocks before the backend is complete.

---

### Phase 4: Polish & Testing (Chunk 10) — Final integration

| Order | Issue | Chunk | Skill | Description | Depends On |
|-------|-------|-------|-------|-------------|------------|
| 7 | #38 | 10/10 | frontend | Performance optimization, error handling & test suite | #35, #36, #37 |

> **Note**: This is the final chunk. It adds cross-cutting concerns (error boundaries, retry logic, offline handling) and the comprehensive test suite. All other chunks must be complete before this one can be fully validated.

---

## Parallel Work Streams

For maximum velocity with 2+ developers, the work naturally splits into two streams:

```
Stream A (Backend)              Stream B (Frontend)
─────────────────              ──────────────────
#29 Scaffolding (shared)
        │                              │
        ├─► #30 DB Schema     #34 Design System ◄─┤
        │                              │
   ┌────┼────┐                         │
   ▼    ▼    ▼                         ▼
 #31  #32  #33               #35 Inventory (w/ MSW mocks)
 CRUD Import Audit                     │
   │    │    │                    ┌────┴────┐
   │    │    │                    ▼         ▼
   └────┴────┘              #36 Upload  #37 Detail+Audit
        │                         │         │
        │         ◄── integrate ──┘─────────┘
        │                         │
        └────────────────────► #38 Tests & Polish
```

Frontend developers can work with MSW (Mock Service Worker) mocks from the start. Once backend APIs are ready, swap MSW for real endpoints by changing the Axios base URL.

---

## Critical Path

The critical path (longest sequential chain) determines minimum implementation duration:

```
#29 → #30 → #31 → #35 → #38
 │      │      │      │      │
 ▼      ▼      ▼      ▼      ▼
Scaffold → Schema → CRUD API → Inventory Page → Tests
```

All other chunks can be parallelized around this path.

---

## Risk Checkpoints

| After Chunk | Checkpoint |
|-------------|-----------|
| #29 (Scaffolding) | Verify: `npm run dev` starts both frontend + backend, `docker-compose up` starts PostgreSQL |
| #30 (Schema) | Verify: `prisma migrate` runs, seed data generates 100+ certs, shared types compile |
| #31 (CRUD API) | Verify: `GET /api/certificates?q=api-pay&expiresIn=30d` returns correct filtered results in <200ms |
| #35 (Inventory) | Verify: Full search→filter→paginate flow works end-to-end with real API |
| #38 (Tests) | Verify: All 68 ACs pass, coverage ≥ 85%, 10k cert performance benchmark passes |

---

**Build Order Version**: 1.0  
**Last Updated**: 2026-05-27
