# Build Order: C3 — Centralized Certificate Inventory

Recommended implementation order for the 7 chunks. Each chunk has its GitHub issue linked.

---

## Phase 1 — Foundation

### 1. `#12` [backend] Project Scaffolding, Database Schema & Server Skeleton

> **Why first:** Every other chunk depends on the Express server and SQLite database. Sets up the project structure, npm scripts, schema migration, and health-check endpoint.

**Depends on:** nothing  
**Unlocks:** all other chunks

---

## Phase 2 — Core Backend APIs (parallelizable)

### 2. `#13` [backend] Single Certificate Import (PEM & PKCS#12)

> **Why second:** Importing certificates is the primary way data enters the system. Required before CSV import (which builds on the same parsing pipeline).

**Depends on:** #12  
**Unlocks:** #14 (CSV import)

### 3. `#15` [backend] Certificate CRUD, Search, Filter, Pagination & Export API

> **Can run in parallel with #13.** The CRUD layer works with certs already in the DB (seeded via tests). This is the largest backend chunk and covers the most ACs.

**Depends on:** #12  
**Unlocks:** #16 (audit wiring), #17 (dashboard queries), #18 (frontend)

---

## Phase 3 — Extended Backend

### 4. `#14` [backend] Bulk CSV Import with Row-Level Validation

> Extends the import pipeline from chunk 2 with CSV streaming, partial commit, and error reporting.

**Depends on:** #12, #13

### 5. `#16` [backend] Audit Log Service & API

> Wires audit logging into the CRUD and import services. Needs both to exist.

**Depends on:** #12, #15 (for wiring into cert service)

### 6. `#17` [backend] Dashboard API (KPIs, Heatmap, Alerts)

> Pure read-only aggregation queries. Needs the certificates table populated (via tests or prior imports).

**Depends on:** #12

---

## Phase 4 — Frontend

### 7. `#18` [frontend] Frontend SPA (Dashboard, Inventory, Detail, Import, Audit)

> **Last:** requires all API endpoints to be available. Consumes every backend chunk.

**Depends on:** #12, #15, #16, #17

---

## Dependency Graph

```
#12 (scaffolding)
 ├── #13 (PEM/PKCS#12 import)
 │    └── #14 (CSV import)
 ├── #15 (CRUD + search + filter + export)
 │    └── #16 (audit log)
 ├── #17 (dashboard API)
 └── #18 (frontend SPA) ← depends on #15, #16, #17
```

## Parallelism Opportunities

| Step | Chunks | Notes |
|------|--------|-------|
| After #12 completes | #13 + #15 + #17 | Three independent backend chunks |
| After #13 completes | #14 | CSV import extends PEM import |
| After #15 completes | #16 | Audit wires into CRUD |
| After #15 + #16 + #17 | #18 | Frontend needs all APIs |

---

## Acceptance Criteria → Chunk Traceability

| AC | Chunk(s) |
|----|----------|
| 1 (PEM import) | #13, #18 |
| 2 (invalid format) | #13, #18 |
| 3 (CSV bulk import) | #14, #18 |
| 4 (CSV validation errors) | #14, #18 |
| 5 (search by CN) | #15, #18 |
| 6 (search by SAN) | #15, #18 |
| 7 (search by serial) | #15, #18 |
| 8 (search by owner) | #15, #18 |
| 9 (no match) | #15, #18 |
| 10 (filter <30d) | #15, #18 |
| 11 (filter env prd) | #15, #18 |
| 12 (filter CA) | #15, #18 |
| 13 (filter expired) | #15, #18 |
| 14 (combine filters) | #15, #18 |
| 15 (remove filter) | #15, #18 |
| 16 (pagination 10k+) | #15, #18 |
| 17 (navigate pages) | #15, #18 |
| 18 (last page) | #15, #18 |
| 19 (cert detail) | #15, #18 |
| 20 (view PEM) | #15, #18 |
| 21 (cert audit log) | #16, #18 |
| 22 (download PEM) | #15, #18 |
| 23 (delete cert) | #15, #16, #18 |
| 24 (KPI total) | #17, #18 |
| 25 (KPI expiring) | #17, #18 |
| 26 (critical alerts) | #17, #18 |
| 27 (heatmap grid) | #17, #18 |
| 28 (heatmap tooltip) | #17, #18 |
| 29 (add tag) | #15, #16, #18 |
| 30 (filter by tag) | #15, #18 |
| 31 (export CSV) | #15, #18 |
| 32 (audit CREATE) | #16 |
| 33 (audit UPDATE) | #16 |
| 34 (audit DELETE) | #16 |
| 35 (performance filter) | #15 |
| 36 (performance search) | #15 |
| 37 (case-insensitive) | #15, #18 |
| 38 (owner required) | #13, #18 |
| 39 (valid env values) | #13, #18 |
| 40 (export JSON) | #15, #18 |
| 41 (substring search) | #15, #18 |
| 42 (CSV rollback) | #14 |
| 43 (read-only PKI fields) | #15, #18 |
| 44 (validity display) | #15, #18 |
| 45 (status badge colors) | #15, #18 |
| 46 (CSV file type validation) | #14, #18 |
| 47 (empty CSV) | #14, #18 |
| 48 (metadata accuracy) | #13 |
| 49 (revoked display) | #15, #18 |
| 50 (pagination boundary) | #15 |
