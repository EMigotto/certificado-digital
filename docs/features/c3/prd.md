# PRD: C3 - Inventário Centralizado de Certificados

**Feature:** C3 - Inventário Centralizado de Certificados  
**Slug:** c3  
**Status:** Draft  
**Owner:** PKI Platform Team  
**Updated:** 2024

---

## Problem Statement

Currently, certificate management across the organization is fragmented. Certificates are scattered across multiple deployment environments, CA systems (Vault PKI, ACM PCA), and zones with no unified view or governance. Teams lack:

- A single source of truth for all mTLS certificates in use
- Visibility into certificate expiration and renewal schedules
- Ability to search and filter certificates across environments
- Metadata management and custom tagging
- Efficient bulk import mechanisms
- Audit trail for certificate lifecycle events

This fragmentation creates operational risk: missed expirations, duplicate management, unclear ownership, and difficulty enforcing naming conventions or security policies.

---

## Goals & Outcomes

**Primary Goal:** Establish a centralized, searchable certificate inventory system that serves as the authoritative source for all mTLS certificates in the organization.

**Key Outcomes:**
1. All organization mTLS certificates (prod, staging, dev) indexed and queryable in <2 seconds
2. Certificate expiration visibility with alerting
3. Complete audit trail of all certificate operations
4. Support for bulk certificate import (CSV, PEM, PKCS#12)
5. Custom metadata and tagging per certificate

---

## Users & Jobs to be Done (JTBD)

### User 1: PKI Administrator (pki-admin)
**Jobs:**
- Import and register new certificates (manual upload, bulk CSV)
- Search certificates by CN, SAN, owner, CA, environment, status
- View certificate metadata: subject, issuer, serial, fingerprint, key algorithm, validity dates
- Tag/label certificates for custom workflows
- Export certificate lists and metadata for compliance/auditing
- Monitor certificate expiration calendar

### User 2: Platform/DevOps Engineer
**Jobs:**
- Discover certificates for their microservices
- Understand certificate ownership and renewal responsibility
- Track expiration timelines for automated renewal workflows
- Filter certificates by environment (dev/hml/prd)
- Quickly lookup certificate details (CN, serial, issuer) for troubleshooting

### User 3: Security/Compliance Officer
**Jobs:**
- Audit all certificates in the organization
- Filter by expiration status, CA provider, or custom labels
- Generate reports on certificate inventory health
- Monitor for expired or revoked certificates
- Track certificate lifecycle via audit log

### User 4: Automation/API Consumer
**Jobs:**
- Query certificate inventory via REST API
- Filter by metadata (tags, owner, environment, expiration)
- Export certificate details in structured formats
- Integrate certificate data with monitoring/alerting systems

---

## Functional Scope

### 1. Certificate Metadata Model
Users must be able to store and view the following attributes for every certificate:

- **Core PKI Fields:**
  - Common Name (CN)
  - Subject Alternative Names (SANs) - list
  - Issuer
  - Serial Number
  - Validity: notBefore / notAfter (ISO 8601)
  - Fingerprint (SHA-1, SHA-256)
  - Public Key Algorithm (RSA, ECDSA, ED25519, etc.)
  - Key Size (bits)
  
- **Organizational Fields:**
  - Owner (team/user responsible)
  - Associated Application/Service
  - Environment (dev / hml / prd)
  - Zone/Namespace
  - CA Provider (Vault PKI, ACM PCA, etc.)
  
- **Custom Fields:**
  - Tags / Labels (key-value pairs, unlimited)
  - Description / Notes
  - Custom metadata (extensible)

### 2. Certificate Import & Registration
Users must be able to add certificates via:

**Manual Import:**
- Single certificate upload (PEM, PKCS#12 formats)
- Form to input/assign metadata after upload
- Preview parsed certificate details before confirmation

**Bulk Import:**
- CSV format: CN, SANs, owner, environment, CA, tags (one cert per row)
- ZIP/TAR of PEM files with metadata manifest
- API endpoint for programmatic bulk upload

### 3. Search & Filtering
Users must be able to query the inventory with:

- **Free-text search** across CN, SANs, serial, issuer, fingerprint
- **Structured filters:**
  - Owner (team/user)
  - Expiration status (expired, <7 days, <30 days, <90 days, valid)
  - CA provider
  - Environment (dev/hml/prd)
  - SAN presence
  - Zone
  - Custom tag/label
  - Revocation status
- **Filter combinations** (AND logic, e.g., "env:prd AND expira:<30d")
- **Export results** as CSV, JSON

### 4. List View (Dashboard/Inventory)
Users must see a paginated table displaying:

- Common Name with SAN count / preview
- Zone and Environment
- Status badge (Valid, Expiring, Critical, Expired, Revoked)
- CA Provider and Key Algorithm
- Owner
- Days until expiration (color-coded)
- Pagination for 10k+ certificates (load-on-scroll or traditional paging)

**Performance Requirement:** Pagination query + filter parsing must return in <2 seconds for full dataset.

### 5. Certificate Detail View
Users must be able to click a certificate to see:

- Complete metadata grid (CN, SANs, issuer, serial, fingerprint, algorithm, key size)
- Validity timeline (notBefore, notAfter, days remaining)
- Associated tags/labels
- Owner and application
- Full certificate PEM (copyable)
- Certificate chain (if available)
- Actions: download, export, renew (API hook), revoke (API hook)
- Audit log (all lifecycle events for this cert)

### 6. Tags & Custom Fields
Users must be able to:

- Create and assign custom tags (unlimited per cert)
- Use tags in filters
- Edit tags per certificate
- Define custom field schemas (if supporting custom metadata)

### 7. Expiration Monitoring & Alerts
Dashboard must show:

- KPI card: count of certs expiring in <30 days
- KPI card: count of expired/revoked certs
- Heatmap: expiration distribution over 90-day window
- Critical alerts panel: top N certs expiring soonest
- Alert list filtering by severity (critical <7d, warning <30d)

### 8. Audit Log
For every certificate operation (import, update, delete, revoke), system must record:

- Timestamp
- Actor (user/service account)
- Action (CREATE, UPDATE, DELETE, REVOKE)
- Target (certificate CN/serial)
- Result (success/failure)
- Metadata changes (if applicable)

---

## Out of Scope

The following are explicitly NOT part of C3:

- **Certificate Issuance:** Creating new certificates (separate feature, e.g., C2)
- **Automation/Renewal:** Automatic renewal workflows (separate feature)
- **Distribution:** Pushing certificates to endpoints (separate feature)
- **Revocation Management:** Detailed CRL/OCSP handling (separate feature, may involve external APIs)
- **Multi-tenancy:** Organization-level isolation (deferred to future phase)
- **Fine-grained RBAC:** Role definitions beyond pki-admin, engineer, auditor (deferred)
- **Webhooks/Notifications:** Real-time alerts to Slack, email, etc. (separate feature)
- **Advanced analytics:** Trending, predictive expiration, compliance reports (future feature)

---

## Acceptance Criteria (Summary)

**List view:**
- Display 10k+ certificates with pagination
- Filter "expira em < 30 dias" returns in <2 seconds
- Search by CN, SAN, serial, owner matches records correctly
- Clicking a certificate navigates to detail view

**Detail view:**
- All metadata fields render correctly from certificate data
- Users can copy certificate PEM
- Audit log shows all prior events for that certificate
- Action buttons (download, delete) are functional

**Import:**
- Single PEM/PKCS#12 upload succeeds with metadata form
- CSV bulk import with 100+ rows succeeds
- Parsing errors are reported clearly

**Search & Filtering:**
- Filter combinations (e.g., env:prd + expira:<30d) work correctly
- Export to CSV includes selected filters

**Audit:**
- Every CREATE/UPDATE/DELETE is logged with actor, timestamp, result
- Audit entries are visible in certificate detail view and audit log page

---

## Risks & Assumptions

### Risks

1. **Performance at Scale:** Querying 10k+ certificates may exceed <2s target if DB indexes are missing.
   - Mitigation: Implement database indexes on owner, environment, expiration, status; use pagination (cursor-based preferred over offset).

2. **Data Import Quality:** Bulk CSV imports may have malformed data (invalid PEM, missing fields).
   - Mitigation: Validate all inputs before persistence; provide detailed error reporting per row.

3. **Certificate Parsing:** Non-standard certificate formats (self-signed, embedded in containers) may be difficult to parse.
   - Mitigation: Support PEM and PKCS#12 initially; reject others with clear error message.

4. **Metadata Completeness:** Teams may not provide accurate owner/application metadata during import.
   - Mitigation: Make owner a required field; provide UI hints and templates.

5. **Audit Log Storage:** Audit trail for 10k+ certificates can grow large quickly.
   - Mitigation: Use efficient storage (database with retention policy); consider archival for old entries.

### Assumptions

1. All certificates in scope are in PEM or PKCS#12 format.
2. Owners are identifiable as team names or email addresses (not arbitrary strings).
3. Environment values are strictly one of: dev, hml, prd.
4. CA providers (Vault PKI, ACM PCA, etc.) are known in advance; we maintain a controlled list.
5. Search queries should match substring (case-insensitive); not full-text search.
6. Pagination limit: 50-100 certificates per page default.
7. Authentication/authorization (who can see which certs) is handled upstream; C3 assumes authenticated user.
8. Certificate revocation status is read from upstream CA APIs (out of scope for initial release).

---

## Success Metrics

1. **List Performance:** "Filter by expira:<30d" query returns in <2 seconds with full dataset (10k+).
2. **Search Accuracy:** Free-text search returns relevant matches for CN, SAN, serial, owner.
3. **Import Success Rate:** 95%+ of bulk CSV rows imported without manual intervention.
4. **Adoption:** 80%+ of teams with mTLS services using the inventory within 3 months.
5. **Audit Completeness:** 100% of certificate modifications logged with actor and timestamp.

---

## UI Screens (From Approved Prototype)

The approved prototype defines the following MVP screens:

### Screen 1: Dashboard (Monitoring & Alerts)
Shows KPI cards (total, valid, expiring <30d, expired/revoked) and two-column layout:
- Left: 90-day expiration heatmap (30x3 grid, color-coded intensity)
- Right: Top 5 critical alerts (nearest expiration) with days remaining

### Screen 2: Inventory (Certificate List)
Shows paginated table with toolbar for search and filters:
- Search input (CN, SAN, serial, owner)
- Active filters displayed as removable chips
- "+ filtro" button to add more filters
- "Emitir certificado" button (out of scope, but shown in UI)
- Table columns: CN/SANs, Zone/Env, Status, CA/Algorithm, Owner, Days until expiration
- Pagination controls (Previous/Next, page numbers)

### Screen 3: Certificate Detail
Shows complete metadata in grid format:
- CN and SAN list
- Issuer, Serial, Fingerprint
- Algorithm, Key Size
- Validity dates (notBefore, notAfter)
- Owner, Application, Environment, Zone
- Tags/Labels
- Actions: Download, Edit, Delete
- Full certificate PEM (read-only, copyable)
- Audit log section (chronological)

### Screen 4: Import/Upload Dialog
(Not shown in prototype, but inferred from requirements)
- Upload form for single PEM/PKCS#12 file
- Metadata fields: Owner, Environment, CA, Tags, Description
- Preview of parsed certificate details
- Confirm button

### Screen 5: Audit Log Page
(Not shown in prototype detail, but referenced)
- Table of all certificate operations across the system
- Columns: Timestamp, Actor, Event, Target (CN/Serial), Result
- Filters by certificate CN, actor, action type, date range

---

## Technical Notes

- **Database:** Schema must support flexible custom metadata (JSON or key-value table).
- **Indexing:** Priority indexes: owner, environment, expiration_date, status, tags.
- **API Design:** RESTful endpoints for CRUD operations, search, bulk import, export.
- **Storage:** PEM/PKCS#12 file storage (filesystem or object storage); metadata in relational DB.
- **Caching:** Consider caching frequently-accessed cert lists (e.g., by environment) with short TTL (5-10 min).

---

## Approval & Sign-Off

- **Product Manager:** [To be filled]
- **Engineering Lead:** [To be filled]
- **Security:** [To be filled]

**Approved:** [Date]
