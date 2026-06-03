# C5. Secure Storage of Private Keys — Build Order

Recommended implementation order for the 6 chunks. Chunks at the same level can be worked in parallel.

## Dependency Graph

```
                     ┌──────────────────────────┐
                     │  Chunk 1 (#71)            │
                     │  [infra] DB Schema +      │
                     │  Config + Shared Types     │
                     └────────────┬───────────────┘
                                  │
                     ┌────────────▼───────────────┐
                     │  Chunk 2 (#72)              │
                     │  [backend] Crypto Module    │
                     │  AES-256-GCM + PBKDF2       │
                     └────────────┬───────────────┘
                                  │
                     ┌────────────▼───────────────┐
                     │  Chunk 3 (#73)              │
                     │  [backend] Key Service +    │
                     │  Repository + API Routes    │
                     │  (store, metadata, retrieve)│
                     └────────────┬───────────────┘
                                  │
                ┌─────────────────┼──────────────────┐
                │                 │                   │
     ┌──────────▼──────┐  ┌──────▼────────┐  ┌──────▼────────┐
     │  Chunk 4 (#74)  │  │  Chunk 5 (#75)│  │  Chunk 6 (#76)│
     │  [backend]      │  │  [backend]    │  │  [frontend]   │
     │  Key Rotation   │  │  CSR storeKey │  │  Key Panel UI │
     │  + Deletion     │  │  Integration  │  │  + Modals     │
     └────────────────┘  └───────────────┘  └───────────────┘
```

## Recommended Build Sequence

### Phase 1 — Foundation (no dependencies)

| Order | Issue | Chunk | Skill | Description | Blocked? |
|-------|-------|-------|-------|-------------|----------|
| 1 | #71 | 1 | infra | Database schema migration (PrivateKey model, KeyStatus enum, AuditAction extension), config.ts update, shared types | ⚠️ Awaiting infrastructure.md approval |

> **Blocker**: Chunk 1 requires human approval of 3 infrastructure resources in `infrastructure.md`:
> - `private_keys` table
> - `KeyStatus` enum + `AuditAction` extension
> - `PRIVATE_KEY_ENCRYPTION_SECRET` env var

### Phase 2 — Crypto Module (depends on Phase 1)

| Order | Issue | Chunk | Skill | Description |
|-------|-------|-------|-------|-------------|
| 2 | #72 | 2 | backend | AES-256-GCM encryption module with PBKDF2 key derivation, PEM validation, fingerprint computation |

> Depends on Chunk 1 (needs `config.ts` to have `PRIVATE_KEY_ENCRYPTION_SECRET` defined).
> This chunk is pure utility code with comprehensive unit tests — no DB access needed.

### Phase 3 — Core API (depends on Phase 2)

| Order | Issue | Chunk | Skill | Description |
|-------|-------|-------|-------|-------------|
| 3 | #73 | 3 | backend | Key repository, service, and API routes (store, metadata, retrieve endpoints) |

> Depends on Chunk 1 (Prisma model) and Chunk 2 (crypto module).
> This is the largest chunk — implements 3 API endpoints, repository, service with audit integration.

### Phase 4 — Extensions (depends on Phase 3, can be parallelized)

| Order | Issue | Chunk | Skill | Description |
|-------|-------|-------|-------|-------------|
| 4a | #74 | 4 | backend | Key rotation and deletion (extend service + routes) |
| 4b | #75 | 5 | backend | CSR endpoint enhancement (optional `storeKey` parameter) |
| 4c | #76 | 6 | frontend | Key management panel UI (detail page section + modals + hooks) |

> All three can be worked **in parallel** — they all depend on Chunk 3 (API) but not on each other.
> Chunk 6 (frontend) can start scaffolding UI components with mock data immediately after Chunk 1 (shared types).

## Summary: All Issues

| # | Issue | Title | Skill | Phase |
|---|-------|-------|-------|-------|
| 1 | #71 | [infra] DB Schema + Config + Shared Types | infra | 1 |
| 2 | #72 | [backend] Crypto Module (AES-256-GCM) | backend | 2 |
| 3 | #73 | [backend] Key Service + Routes (Store/Metadata/Retrieve) | backend | 3 |
| 4 | #74 | [backend] Key Rotation + Deletion | backend | 4 |
| 5 | #75 | [backend] CSR storeKey Integration | backend | 4 |
| 6 | #76 | [frontend] Key Management Panel UI | frontend | 4 |

## Infrastructure Blockers

One chunk is **blocked** on human approval of infrastructure resources:

1. **Chunk 1 (#71)**: Requires approval of `private_keys` table, `KeyStatus` enum, `AuditAction` enum extension, and `PRIVATE_KEY_ENCRYPTION_SECRET` env var in `infrastructure.md`

All subsequent chunks are transitively blocked until Chunk 1 is unblocked, but:
- **Chunk 2** (crypto module) can be partially developed with unit tests using hardcoded test KEK (no DB dependency)
- **Chunk 6** (frontend) can scaffold UI components with mock data and MSW handlers without the backend

## Effort Estimates by Skill

| Skill | Chunks | Relative Effort |
|-------|--------|----------------|
| infra | 1 chunk (#71) | Small — schema + config only |
| backend | 4 chunks (#72, #73, #74, #75) | Large — crypto, service, 5 API endpoints, tests |
| frontend | 1 chunk (#76) | Medium — 5 components, 5 hooks, 1 API client, tests |
