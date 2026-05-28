# Build Order: C2 — Certificate Lifecycle Management

**Feature**: ciclo-de-vida  
**Total Chunks**: 7  
**Date**: 2026-05-28

---

## Recommended Implementation Order

### Phase 1: Backend Foundation

#### 1. ✅ Chunk 1 — Schema Migration (#39)
**Skill**: backend  
**Dependencies**: None  
**Why first**: Every other chunk depends on the extended database schema (lifecycle status enum, CaConfig model, new certificate fields, extended audit actions). This is the critical path foundation.

#### 2. ✅ Chunk 2 — CSR Service + CA Adapters (#40)
**Skill**: backend  
**Dependencies**: Chunk 1 (#39)  
**Why second**: The CA adapter pattern and CSR generation are the core domain services. They must exist before the API endpoints can orchestrate lifecycle operations.

#### 3. ✅ Chunk 3 — Lifecycle API Endpoints (#41)
**Skill**: backend  
**Dependencies**: Chunk 1 (#39), Chunk 2 (#40)  
**Why third**: With the schema and services in place, the REST endpoints wire everything together. This unblocks all frontend work.

### Phase 2: Frontend Data Layer

#### 4. ✅ Chunk 4 — Shared Types + API Client + Hooks (#42)
**Skill**: frontend  
**Dependencies**: Chunk 3 (#41) — can start in parallel using the API contract from the ADR  
**Why fourth**: The shared types, API client, and TanStack Query hooks form the data layer consumed by all UI chunks. Building this first avoids duplication across pages.

### Phase 3: Frontend UI (parallelizable)

> Chunks 5, 6, and 7 can be developed **in parallel** once Chunk 4 is complete. They share the hooks/API layer but do not depend on each other.

#### 5a. ✅ Chunk 5 — Issue Certificate Page (#43)
**Skill**: frontend  
**Dependencies**: Chunk 4 (#42)  
**Why here**: The issue page is the most complex new UI (4-step wizard). Starting it early gives time for iteration.

#### 5b. ✅ Chunk 6 — Detail Page Enhancements (#44)
**Skill**: frontend  
**Dependencies**: Chunk 4 (#42)  
**Why here**: Renewal and revocation modals enhance the existing detail page. Can be built in parallel with the issue page.

#### 5c. ✅ Chunk 7 — Timeline UI + Audit Extension (#45)
**Skill**: frontend  
**Dependencies**: Chunk 4 (#42), Chunk 6 (#44) — soft dependency for layout integration  
**Why here**: The timeline component adds lifecycle visibility. Has a soft dependency on Chunk 6 (shares the detail page), but can be developed and tested independently.

---

## Dependency Graph

```
Chunk 1 (#39) ──► Chunk 2 (#40) ──► Chunk 3 (#41) ──► Chunk 4 (#42) ──┬── Chunk 5 (#43)
  Schema            CSR + CA          API endpoints      Types + Hooks  ├── Chunk 6 (#44)
                                                                        └── Chunk 7 (#45)
```

## Parallelization Opportunities

| Phase | Chunks | Can Parallelize? |
|-------|--------|-----------------|
| Phase 1 | #39 → #40 → #41 | Sequential (strict dependencies) |
| Phase 2 | #42 | Sequential (waits for backend API contract) |
| Phase 3 | #43, #44, #45 | **Yes — all three can run in parallel** |

## Risk Notes

- **Chunk 1** is the highest risk: schema migrations on a live system need careful testing. Use `prisma migrate dev` for development, `prisma migrate deploy` for production.
- **Chunk 2** depends on CA availability for integration tests. Use mock adapters for unit tests; integration tests can use a local Vault dev server.
- **Chunk 4** can start before Chunk 3 is complete by coding against the API contract defined in the ADR. This enables overlap between backend and frontend development.
