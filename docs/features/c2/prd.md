# C1. Inventário Centralizado de Certificados

**Feature slug:** c2  
**Feature title:** C1. Inventário Centralizado de Certificados  
**Version:** 1.0  
**Date:** 2025-05-19

---

## Problem Statement

Organizations managing mTLS infrastructure lack a unified, queryable source of truth for certificate inventory. Certificates are scattered across multiple systems (Vault PKI, ACM, third-party CAs), making it difficult to:

- Track certificate expiration at scale
- Understand certificate ownership and dependencies
- Enforce compliance and governance policies
- Respond quickly to security incidents involving certificates

This feature establishes the **Cipher** platform as the central certificate inventory, enabling operators to list, search, filter, and manage all mTLS certificates across zones and environments.

---

## Users & Jobs-to-be-Done

### Users

1. **PKI Admin**  
   Job: Maintain complete visibility of all organizational certificates, detect expiration risks, and enforce governance.

2. **DevOps / SRE Team**  
   Job: Quickly locate certificates for their services, understand metadata, and initiate renewal workflows.

3. **Security Operations Center (SOC)**  
   Job: Audit certificate lifecycle events, verify ownership, and respond to certificate-related incidents.

4. **Application Owner**  
   Job: View and manage certificates associated with their applications, understand expiration timelines, and plan rotations.

---

## Functional Scope

### 1. Certificate Inventory List Screen (Inventário centralizado — "02 Inventário")

**Screen:** Displays a paginated table of all certificates in the system.

**Components and data displayed:**

- **Search box** (free-form query)
  - Searches across: CN, Subject Alt Names (SANs), certificate serial, owner, application name
  - Real-time filtering with debounce
  
- **Filter bar** (faceted)
  - Active filters shown as removable badges (e.g., "expira: < 30d ×", "env: prd")
  - Quick filter buttons: "+ filtro" to add new filters
  - Filterable by: owner, CA, environment (dev/hml/prd), expiration window, SAN, status (valid/critical/revoked)

- **Action button** ("Emitir certificado")
  - Opens form to create new certificate (future feature C4)

- **Table columns:**
  - **Common Name / SANs** — monospace font, CN as primary, SANs listed below (e.g., "+ 2 SANs: payments-v2, payments-canary")
  - **Zona / Env** — zone name and environment tag (prd/hml/dev)
  - **Status** — badge showing health (Crítico/Atenção/Válido) with colored dot
  - **CA / Algoritmo** — issuing CA name + key algorithm (RSA 2048, ECDSA P-256, etc.)
  - **Owner** — team/service owner
  - **Expira em** — days remaining, colored (red for <7d, yellow for <30d, green for valid)
  - **Actions** — right arrow indicating detail view

- **Pagination**
  - Shows "Mostrando X de Y" at bottom
  - Links to next/previous page
  - Must support 10,000+ certificates without performance degradation

- **Performance requirement:**
  - Filtering by "expira em < 30 dias" must return results in < 2 seconds

### 2. Certificate Metadata CRUD

**Data model per certificate:**

- **Identification**
  - Common Name (CN)
  - Subject Alternative Names (SANs) — list of domains
  - Serial number
  
- **Validity**
  - notBefore (issued date)
  - notAfter (expiration date)
  - Status (valid/expired/revoked)
  
- **Cryptography**
  - Algorithm (RSA, ECDSA, etc.)
  - Key size (2048, 4096, P-256, P-384, etc.)
  - Fingerprint (SHA256)
  
- **Governance**
  - Issuer / CA
  - Owner (team/service name)
  - Associated application
  - Environment (dev/hml/prd)
  - Zone/domain

- **Operations**
  - Tags/labels (customizable key:value pairs)
  - Custom fields (extensible metadata)

**Create:** via manual upload (PEM/PKCS#12) or batch import (CSV/API)  
**Read:** via inventory list and certificate detail screens  
**Update:** edit tags, custom fields, owner, application association  
**Delete:** revoke or remove from inventory (future feature)

### 3. Certificate Detail Screen ("03 Detalhe do certificado")

**Screen:** Shows complete information for a single certificate.

**Components:**

- **Header**
  - Status badge (Crítico/Atenção/Válido)
  - Common Name as title
  - Serial number
  - Expiration countdown (e.g., "2 dias" in red)
  - Exact notAfter timestamp

- **Metadata panel (left column)**
  - 2-column info grid displaying:
    - Common Name, Serial, SANs, Issuer, notBefore, notAfter, Algorithm, Fingerprint SHA256
  
- **Tags & custom fields panel**
  - Displays applied tags (e.g., "criticidade:alta", "env:prd", "time:pagamentos", "sla:99.99")
  - "+ Adicionar tag" button to add new tags

- **Operational info panel (right column)**
  - Owner, Application, Environment, CA/Zone, Status
  
- **Actions panel (right column)**
  - "Renovar certificado" button
  - "Baixar certificado" button (export PEM/PKCS#12)
  - "Revogar certificado" button (danger action)

### 4. Manual Certificate Import (Upload)

**Supported formats:**
- PEM (X.509 v3 certificate files)
- PKCS#12 (.p12/.pfx with bundled key and cert)

**Flow:**
- File upload dialog
- Extract metadata from certificate (CN, SANs, issuer, serial, dates, algorithm)
- Allow user to set owner, application, environment, zone, and custom tags before confirming
- Store in inventory

### 5. Batch Import (CSV/API)

**CSV format example:**

```
cn,san,owner,application,environment,ca,zone,tag_criticality,tag_team
api-payments.bank.internal,"payments-v2,payments-canary",time-pagamentos,API Payments v2,prd,Vault PKI,bank-prd,alta,payments
mtls-broker.bank.internal,"",time-data,Kafka Broker,prd,ACM PCA,bank-prd,high,data
```

**API endpoint:** `POST /api/v1/certificates/import`  
- Accepts JSON array of certificate objects
- Validates metadata before ingestion
- Returns import summary (success count, errors, warnings)

### 6. Search & Filter System

**Search fields:**
- Common Name (partial match)
- SANs (any domain in list)
- Serial number (exact)
- Owner (exact/partial)
- Application (partial)
- Fingerprint (partial SHA256)

**Filter dimensions:**
- **Expiration:** < 7d, < 30d, < 90d, < 1y, expired
- **Environment:** dev, hml, prd
- **CA / Issuer:** exact match on CA name
- **Zone:** exact match on zone name
- **Status:** valid, critical (expiring soon), expired, revoked
- **Owner:** exact/partial match
- **SAN:** contains domain

**Performance:**
- Search results must return within 2 seconds for 10,000+ records
- Filters must be composable (AND logic between dimensions, OR within dimensions)

### 7. Tags & Custom Fields

**Tags:** User-defined key:value labels (e.g., "criticality:high", "team:payments")
- Searchable and filterable
- Apply to one or many certificates
- Can be added/removed per certificate or in bulk

**Custom fields:** Extensible metadata fields beyond standard certificate properties
- Examples: SLA, cost-center, review-date, compliance-status
- Schema defined per organization/zone
- Editable via detail view or bulk operations

---

## Out of Scope

1. **Certificate Issuance** — will be covered in feature C4 (Emitir certificado)
2. **Monitoring & Alerts** — covered in feature C3 (Dashboard and alert system)
3. **Revocation workflows** — basic revoke action present, full workflow in future feature
4. **Audit logging** — covered separately in feature C5
5. **Multi-organization support** — assumes single organization per deployment
6. **Certificate chain validation** — assumes CA already manages chain integrity
7. **Hardware security module (HSM) integration** — out of scope for MVP
8. **Bulk delete/revoke operations** — single-cert actions only in MVP

---

## Risks & Assumptions

### Risks

1. **Performance at scale (10k+ certs)**
   - Risk: Unoptimized DB queries or indexing could cause slowness
   - Mitigation: Implement proper database indexes on CN, SANs, owner, expiration date; use pagination; cache common filters

2. **Certificate format variations**
   - Risk: Non-standard PEM or PKCS#12 files may fail to parse
   - Mitigation: Use battle-tested cryptography libraries (OpenSSL, Golang crypto); validate format before import; provide clear error messages

3. **Data synchronization with source systems**
   - Risk: Certificates may be issued/revoked in source CA systems without Cipher knowing
   - Mitigation: Implement periodic sync jobs (not in MVP); document manual refresh process; add sync status indicators

4. **Access control**
   - Risk: Users may access certificates for services they don't own
   - Mitigation: Implement RBAC per zone; tie permissions to owner field; audit all access (feature C5)

### Assumptions

1. Certificates are supplied as PEM or PKCS#12 files by source CAs
2. All certificates have valid CN and at least one SAN
3. Organization has already established zone and CA taxonomy
4. Users have basic understanding of mTLS and certificate metadata
5. Database supports full-text search or equivalent (for CN/SAN queries)
6. Organization has < 50,000 certificates at MVP launch
7. All certificates use standard X.509 v3 format (no exotic extensions required)

---

## Out of Scope Features

- [ ] Auto-sync with CA systems (pull certificates from Vault, ACM, etc.)
- [ ] Certificate chain validation
- [ ] CRL/OCSP status checking
- [ ] Multi-tenant support
- [ ] Bulk operations (delete/revoke/tag in one action)
- [ ] Advanced reporting (CSVexport, analytics)
- [ ] Integration with secret management systems for private key storage
- [ ] Notifications / webhooks on expiration
- [ ] Custom certificate fields schema management UI

---

## Success Criteria

1. ✅ Users can list all certificates with pagination (10k+ records performant)
2. ✅ Search across CN, SANs, serial, owner returns results in < 2 seconds
3. ✅ Filtering by "expira em < 30d" completes in < 2 seconds
4. ✅ Users can upload PEM/PKCS#12 files and see them in inventory
5. ✅ Users can bulk import via CSV with validation
6. ✅ Certificate detail view shows all metadata (CN, SANs, issuer, serial, dates, algorithm, fingerprint, tags)
7. ✅ Users can add/remove tags per certificate
8. ✅ Database stores custom fields without schema migration
9. ✅ All acceptance criteria pass (positive and negative scenarios)

