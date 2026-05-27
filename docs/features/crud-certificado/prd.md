# PRD: C1. Inventário Centralizado de Certificados

**Feature ID**: C1  
**Slug**: crud-certificado  
**Status**: Specification  
**Created**: 2026-05-27  
**Target Release**: MVP (Phase 1)  

---

## Problem Statement

Organizations managing mTLS infrastructure across multiple environments (dev, staging, production) lack a **single source of truth** for certificate inventory and metadata. Today:

- Certificates are scattered across multiple CA systems (Vault PKI, AWS ACM PCA, external CAs)
- No unified search or filtering capability
- Manual tracking of expiration dates and ownership
- No audit trail of certificate changes
- Inability to quickly answer questions like: "Which certificates are expiring in 30 days?" or "Who owns this cert?"
- Operational risk: certificates may expire unnoticed

**Impact**: Unplanned outages due to certificate expiration, difficulty onboarding new team members, compliance gaps.

---

## Users & Jobs to Be Done (JTBD)

### User Personas

1. **PKI Administrator**
   - Role: Manages certificate policies, imports, and lifecycle
   - Job: Maintain an accurate, up-to-date registry of all certs; quickly identify expiring certificates
   - Tools used: Vault, ACM, command-line

2. **Platform Engineer**
   - Role: Owns service deployment and infrastructure
   - Job: Know which certificates apply to my services; monitor their health
   - Tools used: CI/CD, monitoring dashboards, Kubernetes

3. **Security Auditor**
   - Role: Ensures compliance and proper governance
   - Job: Audit who owns certificates, when they were issued, who modified them
   - Tools used: Compliance tools, logs, reports

### Jobs to Be Done

| User | JTBD |
|------|------|
| PKI Admin | **Ingest certificates** from multiple sources (manual PEM upload, bulk CSV/API) without manual re-keying |
| PKI Admin | **Find any certificate** by CN, SAN, serial, fingerprint, or owner within seconds |
| PKI Admin | **Filter certificates** by expiration window, environment, CA, status, and custom tags to manage large batches |
| Platform Engineer | **Quickly determine** which environment/service a certificate belongs to and who owns it |
| Platform Engineer | **Be alerted** when certificates owned by my team are expiring within a configurable window (see C3) |
| Security Auditor | **Audit all certificate changes** with immutable logs showing who did what and when |
| Any User | **Export certificate lists** for compliance reporting or external systems |

---

## Functional Scope

### 1. Certificate Data Model

Store the following metadata for each certificate:

- **Core Identity**
  - Common Name (CN)
  - Subject Alternative Names (SANs) - list of DNS/IP names
  - Serial Number (unique within issuer)
  - Fingerprint (SHA-256 recommended)

- **Validity & Lifecycle**
  - notBefore (issued date)
  - notAfter (expiration date)
  - Days until expiration (computed)
  - Status (VALID, EXPIRING_SOON, EXPIRED, REVOKED) - computed from dates

- **Cryptography**
  - Algorithm (RSA, ECDSA, EdDSA, etc.)
  - Key Size (2048, 4096, P-256, P-384, etc.)
  - Signature Algorithm (SHA256withRSA, SHA256withECDSA, etc.)

- **Issuer**
  - Issuer DN (full distinguished name)
  - CA Name (human-readable, e.g., "Vault PKI", "AWS ACM PCA", "GlobalSign")
  - Trust Root (reference to root CA)

- **Organizational Context**
  - Owner (team/person responsible) - free text, searchable
  - Associated Application/Service (e.g., "api-payments", "kafka-broker")
  - Environment (dev, hml, prd) - required, enumerated
  - Zone/Scope (e.g., "bank-prd", "internal", "edge")
  - Custom Tags/Labels (user-defined, e.g., "auto-renewal", "mTLS", "client-cert")
  - Custom Fields (extensible key-value pairs for future use)

- **System**
  - Created At (timestamp)
  - Updated At (timestamp)
  - Imported From (source: manual_upload, csv_import, api_import, etc.)
  - Import Batch ID (for tracking bulk imports)

### 2. Inventory List & Display (Inventory Page)

**Location**: Main navigation > "Certificados" (shown in approved prototype section 02)

**Layout**:
- Header with title, badge showing total count, environment summary
- Toolbar with:
  - Full-text search box (searches CN, SAN, serial, owner, app)
  - Preset filters (expiration window, environment)
  - Add filter button for advanced filters
  - "Emitir certificado" (Issue Certificate) button (for C4)
- Paginated table (default 25 rows per page, adjustable)
- Table columns:
  - CN / SANs (with count badge for SANs)
  - Zone / Environment (e.g., "bank-prd / prd")
  - Status (badge with color: green=OK, yellow=WARNING, red=CRITICAL)
  - CA / Algorithm (e.g., "Vault PKI / RSA 2048")
  - Owner (team or person name)
  - Days Until Expiration (colored: >90d=normal, 30-90d=yellow, <30d=red)
  - Row action (chevron to detail page)

**Behavior**:
- Table is sortable by column (click header)
- Page size dropdown (10, 25, 50, 100 items)
- Pagination controls (prev/next + jump to page)
- Selected rows with checkboxes for bulk actions (TBD: bulk tag, bulk export)

### 3. Search & Filtering

**Full-Text Search**:
- Search input accepts free text
- Searches across: CN, all SANs, serial number, fingerprint, owner, application
- Results updated in real-time (as user types) with debounce (300ms)
- Minimum 2 characters to trigger search
- Exact match or prefix match (TBD based on UX testing)

**Filter Types** (all are optional and composable):

| Filter | Type | Options | Behavior |
|--------|------|---------|----------|
| Expiration | Range | expires: <7d, <30d, <90d, >90d | Excludes expired certs unless explicitly included |
| Environment | Multi-select | dev, hml, prd | OR logic within filter |
| CA | Multi-select | Vault PKI, ACM PCA, GlobalSign, ... | OR logic |
| Status | Multi-select | VALID, EXPIRING_SOON, EXPIRED, REVOKED | OR logic |
| Owner | Text | Free text | Partial match, case-insensitive |
| Algorithm | Multi-select | RSA, ECDSA, EdDSA, ... | OR logic |
| Tags | Multi-select | User-defined | AND logic (cert must have all selected tags) |

**Filter UI**:
- Filters displayed as removable chips (e.g., "expira: <30d ×")
- "Add filter" button opens a modal/dropdown with filter options
- Filtered results count shown (e.g., "47 of 2847 certificates")
- "Clear all filters" button
- Filter state preserved in URL query params (for shareability)

### 4. Manual Upload (Single Certificate)

**Trigger**: "Emitir certificado" button leads to C4, but C1 includes basic manual import

**Upload Dialog**:
- File input for PEM, PKCS#12, or DER formats
- Optional password field (for PKCS#12)
- Owner field (auto-fill from logged-in user)
- Environment dropdown (required)
- Application field (free text, auto-complete from known apps)
- Custom tags field (comma-separated)
- Submit button (uploads and parses)

**Parsing**:
- Extract X.509 certificate metadata automatically
- Validate certificate syntax
- Show extracted metadata before confirming import
- User can edit metadata before save (e.g., override owner)
- On success: show success toast, redirect to certificate detail page

### 5. Bulk Import (CSV)

**Trigger**: Separate "Import bulk" button in toolbar (future, post-MVP)

**CSV Format** (header-based):
```
cn,san,serial,issuer,owner,environment,application,tags,zone
api-payments.internal,payments-v2;payments-canary,1A2B3C,Vault PKI,payments-team,prd,api-payments,"mTLS;auto-renewal",bank-prd
```

**Process**:
- User uploads CSV file
- System validates format and certificate details
- Show preview of rows to import (with validation errors highlighted)
- User confirms and starts import
- Show progress bar + summary (X imported, Y failed)
- Failed rows downloadable as CSV for re-import

### 6. Certificate Detail View

**Trigger**: Click row in inventory table

**Layout** (two-column, from approved prototype section 03):
- Left column: Certificate details grid
  - CN + status badge
  - Serial number
  - Fingerprint (SHA-256, copyable)
  - Validity dates (notBefore, notAfter)
  - Days until expiration (with color coding)
  - Algorithm + Key size
  - Issuer DN
  - Owner + App + Zone + Environment

- Right column: Metadata & actions
  - Created/Updated timestamps
  - Import source
  - Custom tags (editable)
  - Action buttons (edit, revoke, delete, export)

**Behavior**:
- All fields read-only on initial view (editing is C2)
- Copy buttons on text fields (CN, serial, fingerprint)
- Export certificate as PEM or JSON
- Revoke button shows confirmation (soft delete + audit log)

### 7. Performance & Scalability

**Acceptance Criteria**:
- Display 10,000+ certificates with pagination: **Must not crash or hang**
- Filter by "expira em 30 dias" on 10,000+ certs: **Return results in < 2 seconds**

**Implementation Strategy**:
- Backend: Indexed database queries (B-tree on expires_at, status, environment)
- Pagination: Cursor-based or offset-limit with configurable page size
- Frontend: Virtual scrolling (React Window) for large result sets
- Caching: React Query staleTime=60s for list data, invalidate on import
- Search: Full-text search index (if available in DB) or server-side filtering

### 8. Error Handling & Edge Cases

| Scenario | Behavior |
|----------|----------|
| Malformed certificate file | Show error message (invalid format), allow retry |
| Duplicate certificate (same CN + issuer) | Warn user, allow overwrite or skip |
| Search with no results | Show "No certificates found. Try adjusting filters." |
| Large import (10k certs) | Show progress, allow background processing, notify on completion |
| Expired certificate | Marked as EXPIRED, filterable, sortable by days (negative) |
| Revoked certificate | Marked as REVOKED (distinct from EXPIRED), soft-deleted (preserved for audit) |
| Network error during import | Retry with exponential backoff, show error after 3 failures |

### 9. Audit & Compliance

**All Certificate Changes Logged**:
- Import (single/bulk)
- Tag/label edits
- Owner changes
- Metadata updates
- Deletion (soft delete, log preserved)

**Audit Entry Includes**:
- Timestamp
- Actor (username/user ID)
- Action type (IMPORT, UPDATE, DELETE, REVOKE)
- Certificate ID (CN + issuer)
- Changes (before/after values)
- Result (success/failure + error reason)

**Storage**: Immutable append-only log (see C5 for full audit feature)

---

## Out of Scope

The following are explicitly out of scope for C1 (Inventory) but planned for future cards:

1. **Certificate Issuance** (C4): Creating new certificates is not in this card. Users can only import existing certs.

2. **Monitoring & Alerting** (C3): Expiration alerts and dashboard heatmap are separate. This card provides data only.

3. **Detailed Certificate Editing** (C2): Editing metadata (owner, tags) is C2. C1 is import + search + view.

4. **Revocation Workflows** (C5): Revoking certs with CSR/CRL integration is post-MVP.

5. **API & CLI** (Post-MVP): Programmatic access via REST API or CLI tools.

6. **Custom Approval Workflows**: All imports auto-accepted (no approval queue in MVP).

7. **Multi-tenancy**: Single organization assumed.

8. **Certificate Chain Validation**: We store cert data but don't validate full chain.

---

## Risks & Assumptions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Parsing errors on malformed certs | Medium | Data loss or incorrect metadata | Extensive validation, test with real certs, show errors clearly |
| Performance degradation at 10k+ certs | Medium | Slow searches/filters, poor UX | Indexed DB queries, pagination, caching strategy tested early |
| Duplicate certificate imports | High | Stale data, confusion | Deduplication logic (by CN+issuer), warn user before import |
| User confusion about certificate ownership | Medium | Wrong owner assigned | Clear UI labels, editable owner field, audit trail visible |
| CSV import format variation | High | Import failures | Robust parsing, detailed error messages, sample CSV provided |

### Assumptions

1. **Database**: PostgreSQL is available and schema is designed for efficient cert queries
2. **Auth**: User is already authenticated; we know their identity for audit logs
3. **Certificate Formats**: Primary formats are PEM and PKCS#12 (P12/PFX)
4. **Metadata Quality**: Users provide reasonably accurate owner/app/environment info
5. **No Real-Time Changes**: Certificates don't change frequently (bulk import + occasional update)
6. **File Sizes**: Certificates < 10MB (standard X.509 certs are ~2-5KB)
7. **Time Zone**: System uses UTC; all times displayed in user's local TZ (JS does this)

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Inventory Completeness | 95%+ org certs in system | Audit against known CA issueance logs |
| Search Performance | <2s for 10k certs | Performance test suite |
| User Adoption | 80%+ of PKI admins using in first month | Usage analytics |
| Data Accuracy | 99%+ of metadata correct | Spot checks + user feedback |
| Import Success Rate | 98%+ of uploaded certs parse correctly | Monitoring + error tracking |
| Page Load Time | <1s for inventory list | Lighthouse/Web Vitals |

---

## Dependencies

- **Backend API**: REST endpoints for cert CRUD, search, filter
- **Database**: PostgreSQL with X.509 parsing (or crypto library)
- **Frontend**: React 18+, TanStack Table, TanStack Query
- **Auth System**: Session/JWT already in place
- **Storage**: File storage for cert artifacts (optional, may use DB BLOBs)

---

## Deliverables

1. PRD (this document)
2. Acceptance Criteria (Gherkin format)
3. Prototype HTML (approved design)
4. Backend API spec (OpenAPI/Swagger)
5. Database schema migration
6. Frontend component library
7. Automated tests (unit + integration)
8. Performance benchmarks

---

## Timeline

**Phase 1 (MVP)**:
- Weeks 1-2: Backend API + DB schema
- Weeks 2-3: Frontend inventory list + search
- Week 3-4: Upload + parsing + bulk import
- Week 4-5: Testing + performance tuning
- Week 5: QA + documentation

(Actual timeline TBD by team)

---

## Approval

- **Product Owner**: [Pending Approval]
- **Tech Lead**: [Pending Approval]
- **Security Review**: [Pending Approval]

**Approved On**: [TBD]

---

**Document Version**: 1.0  
**Last Updated**: 2026-05-27
