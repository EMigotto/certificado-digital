# C7. API REST e CLI — Build Order

Recommended implementation order for the 13 chunks. Chunks at the same level can be worked in parallel.

## Dependency Graph

```
                      ┌──────────────────────┐
                      │  Chunk 1 (#58)       │
                      │  [infra] DB Schema   │
                      │  ServiceToken/Policy │
                      │  /Zone models        │
                      └─────────┬────────────┘
                                │
           ┌────────────────────┼─────────────────────┐
           │                    │                      │
           ▼                    ▼                      ▼
┌─────────────────────┐ ┌─────────────────┐  ┌──────────────────┐
│  Chunk 2 (#59)      │ │  Chunk 3 (#60)  │  │  (Chunk 8 needs  │
│  [backend] OpenAPI  │ │  [backend]      │  │   Chunk 1 + 4)   │
│  (parallel — no     │ │  Token CRUD     │  └──────────────────┘
│   deps on Chunk 1)  │ └────────┬────────┘
└─────────────────────┘          │
                                 ▼
                      ┌──────────────────────┐
                      │  Chunk 4 (#61)       │
                      │  [backend] Auth      │
                      │  Middleware + Scopes  │
                      └─────────┬────────────┘
                                │
           ┌────────────┬───────┼────────┬──────────────┐
           │            │       │        │              │
           ▼            ▼       ▼        ▼              ▼
  ┌──────────────┐ ┌────────┐ ┌──────┐ ┌──────────┐ ┌────────────┐
  │ Chunk 5 (#62)│ │Ch 7    │ │Ch 8  │ │Ch 9 (#66)│ │            │
  │ [backend]    │ │(#64)   │ │(#65) │ │[frontend]│ │            │
  │ Cert POST/   │ │[back]  │ │[back]│ │Token UI  │ │            │
  │ PATCH        │ │CSR     │ │Pol/  │ │(needs #3)│ │            │
  └──────┬───────┘ │endpoint│ │Zone  │ └──────────┘ │            │
         │         └────────┘ └──────┘              │            │
         ▼                                          │            │
  ┌──────────────┐                                  │            │
  │ Chunk 6 (#63)│                                  │            │
  │ [backend]    │                                  │            │
  │ Renew/Revoke │                                  │            │
  └──────┬───────┘                                  │            │
         │            ┌─────────────────────────────┘            │
         ▼            ▼                                          │
  ┌──────────────────────┐                                       │
  │  Chunk 10 (#67)      │                                       │
  │  [backend] CLI       │                                       │
  │  scaffold + certs    │                                       │
  └─────────┬────────────┘                                       │
            │                                                    │
            ▼                                                    │
  ┌──────────────────────┐   ┌────────────────────┐              │
  │  Chunk 11 (#68)      │   │  Chunk 12 (#69)    │              │
  │  [backend] CLI CSR/  │   │  [infra] CLI       │              │
  │  policy/zone/token   │   │  release pipeline  │              │
  └──────────┬───────────┘   └────────┬───────────┘              │
             │                        │                          │
             └────────────┬───────────┘                          │
                          ▼                                      │
               ┌──────────────────────┐                          │
               │  Chunk 13 (#70)      │◄─────────────────────────┘
               │  [backend] E2E       │
               │  Integration Tests   │
               └──────────────────────┘
```

## Recommended Build Sequence

### Phase 1 — Foundation (no dependencies)

| Order | Issue | Chunk | Skill | Description | Blocked? |
|-------|-------|-------|-------|-------------|----------|
| 1 | #58 | 1 | infra | Database schema migration (ServiceToken, Policy, Zone) | ⚠️ Awaiting infrastructure.md approval |
| 1 | #59 | 2 | backend | OpenAPI/Swagger documentation setup | ✅ Ready |

> Chunk 1 and Chunk 2 can be worked **in parallel**. Chunk 2 has no dependency on the database tables.

### Phase 2 — Token Infrastructure (depends on Phase 1)

| Order | Issue | Chunk | Skill | Description |
|-------|-------|-------|-------|-------------|
| 2 | #60 | 3 | backend | Service token CRUD API (issuance, listing, revocation) |

> Depends on Chunk 1 (ServiceToken table).

### Phase 3 — Auth Gate (depends on Phase 2)

| Order | Issue | Chunk | Skill | Description |
|-------|-------|-------|-------|-------------|
| 3 | #61 | 4 | backend | Token authentication middleware with scope enforcement |

> Depends on Chunk 3 (token repository for hash lookup).

### Phase 4 — API Endpoints (depends on Phase 3, can be parallelized)

| Order | Issue | Chunk | Skill | Description |
|-------|-------|-------|-------|-------------|
| 4a | #62 | 5 | backend | Certificate POST (create) and PATCH (update) |
| 4b | #64 | 7 | backend | CSR generation endpoint |
| 4c | #65 | 8 | backend | Policy and Zone read-only endpoints |
| 4d | #66 | 9 | frontend | Token management UI page |

> All four can be worked **in parallel** — they all depend on Chunk 4 (auth) but not on each other. Chunk 9 depends on Chunk 3 (token API), which is done by Phase 3.

### Phase 5 — Lifecycle Endpoints (depends on Phase 4a)

| Order | Issue | Chunk | Skill | Description |
|-------|-------|-------|-------|-------------|
| 5 | #63 | 6 | backend | Certificate lifecycle: renew, revoke, enhanced delete |

> Depends on Chunk 5 (certificate create logic reused for renewal).

### Phase 6 — CLI Tool (depends on Phases 4-5)

| Order | Issue | Chunk | Skill | Description |
|-------|-------|-------|-------|-------------|
| 6 | #67 | 10 | backend | CLI scaffold, config, and certificate commands |

> Depends on Chunks 4-6 (API must accept tokens and provide cert CRUD).

### Phase 7 — CLI Expansion + Release (depends on Phase 6)

| Order | Issue | Chunk | Skill | Description | Blocked? |
|-------|-------|-------|-------|-------------|----------|
| 7a | #68 | 11 | backend | CLI CSR, policy, zone, and token commands | ✅ Ready |
| 7b | #69 | 12 | infra | CLI binary release pipeline (GitHub Actions) | ⚠️ Awaiting infrastructure.md approval |

> Chunks 11 and 12 can be worked **in parallel**.

### Phase 8 — Integration Capstone (depends on all previous)

| Order | Issue | Chunk | Skill | Description |
|-------|-------|-------|-------|-------------|
| 8 | #70 | 13 | backend | E2E CI/CD integration tests |

> Depends on all previous chunks. Validates the < 30s pipeline acceptance criterion.

## Summary: All Issues

| # | Issue | Title | Skill | Phase |
|---|-------|-------|-------|-------|
| 1 | #58 | [infra] DB Schema Migration | infra | 1 |
| 2 | #59 | [backend] OpenAPI/Swagger Setup | backend | 1 |
| 3 | #60 | [backend] Token CRUD API | backend | 2 |
| 4 | #61 | [backend] Auth Middleware | backend | 3 |
| 5 | #62 | [backend] Cert POST/PATCH | backend | 4 |
| 6 | #63 | [backend] Cert Renew/Revoke | backend | 5 |
| 7 | #64 | [backend] CSR Endpoint | backend | 4 |
| 8 | #65 | [backend] Policy/Zone Endpoints | backend | 4 |
| 9 | #66 | [frontend] Token Management UI | frontend | 4 |
| 10 | #67 | [backend] CLI Scaffold + Certs | backend | 6 |
| 11 | #68 | [backend] CLI CSR/Policy/Zone/Token | backend | 7 |
| 12 | #69 | [infra] CLI Release Pipeline | infra | 7 |
| 13 | #70 | [backend] E2E Integration Tests | backend | 8 |

## Infrastructure Blockers

Two chunks are **blocked** on human approval of infrastructure resources:

1. **Chunk 1 (#58)**: Requires approval of ServiceToken, Policy, and Zone tables in `infrastructure.md`
2. **Chunk 12 (#69)**: Requires approval of CLI Release Pipeline in `infrastructure.md`

All other chunks can proceed once their dependency chain is satisfied.
