# C1. Inventário Centralizado de Certificados — Acceptance Criteria

**Feature:** C1 Inventário Centralizado de Certificados  
**Slug:** c2  
**Written in:** Gherkin format (BDD)

---

## Scenario Set 1: Certificate Inventory List (Screen "02 Inventário")

### Scenario 1.1: User can view list of certificates with pagination

**Given** the user is on the Inventory screen ("02 Inventário")  
**And** the system contains 2,847 certificates  
**When** the page loads  
**Then** the table displays the first page of certificates (paginated)  
**And** each row shows: CN/SANs, Zone/Env, Status, CA/Algorithm, Owner, Expiration, Actions  
**And** the footer shows "Mostrando X de 2847"  
**And** the page contains a "Próxima página" link  

**Prototype reference:** Screen "02 Inventário" — table with 5 example rows, pagination footer at bottom

---

### Scenario 1.2: User can search for certificates by Common Name

**Given** the user is on the Inventory screen  
**When** they enter "api-payments" in the search box  
**Then** the table refreshes to show only certificates with CN containing "api-payments"  
**And** the search result returns within 2 seconds  
**And** results include "api-payments.bank.internal"  

**Prototype reference:** Screen "02 Inventário" — search box with placeholder "busca: CN, SAN, serial, owner..."

---

### Scenario 1.3: User can search for certificates by SAN

**Given** the user is on the Inventory screen  
**When** they enter "payments-canary" (a SAN) in the search box  
**Then** the table shows certificates that have "payments-canary" as a Subject Alt Name  
**And** the certificate row displays "+ 2 SANs: payments-v2, payments-canary"  

**Prototype reference:** Screen "02 Inventário" — CN/SANs column shows "api-payments.bank.internal + 2 SANs: payments-v2, payments-canary"

---

### Scenario 1.4: User can search for certificates by serial number

**Given** the user is on the Inventory screen  
**When** they enter "0x00d4e82f1a23b5c7" (a serial number) in the search box  
**Then** the table returns the certificate matching that serial  
**And** result returns within 2 seconds  

**Prototype reference:** Screen "02 Inventário" — search box supports serial as per requirements

---

### Scenario 1.5: User can filter by expiration window (< 30 days)

**Given** the user is on the Inventory screen  
**When** they apply the filter "expira: < 30d"  
**Then** the table shows only certificates expiring in less than 30 days  
**And** the active filter is displayed as a badge "expira: < 30d ×"  
**And** results return within 2 seconds  
**And** the table shows 23 certificates matching this criteria  

**Prototype reference:** Screen "02 Inventário" — filter badge "expira: < 30d ×" shown as active; rows show "12 dias", "18 dias", "26 dias" in Expira em column

---

### Scenario 1.6: User can filter by environment (prd/hml/dev)

**Given** the user is on the Inventory screen  
**When** they apply the filter "env: prd"  
**Then** the table shows only certificates with environment = prd  
**And** the filter badge "env: prd" appears in the filter bar  
**And** rows display the environment tag (e.g., "bank-prd / prd")  

**Prototype reference:** Screen "02 Inventário" — filter button "env: prd"; table column "Zona / Env" shows "bank-prd / prd"

---

### Scenario 1.7: User can filter by owner (team)

**Given** the user is on the Inventory screen  
**When** they apply the filter "owner: time-pagamentos"  
**Then** the table shows only certificates with owner = time-pagamentos  
**And** the Owner column confirms all rows belong to that team  

**Prototype reference:** Screen "02 Inventário" — Owner column shows values like "time-pagamentos", "time-data", "time-plataforma"

---

### Scenario 1.8: User can filter by CA

**Given** the user is on the Inventory screen  
**When** they apply the filter "ca: Vault PKI"  
**Then** the table shows only certificates issued by Vault PKI  
**And** the CA/Algoritmo column shows "Vault PKI"  

**Prototype reference:** Screen "02 Inventário" — CA/Algoritmo column shows "Vault PKI" or "ACM PCA"

---

### Scenario 1.9: User can combine multiple filters (AND logic)

**Given** the user is on the Inventory screen  
**When** they apply filters "env: prd" AND "owner: time-pagamentos" AND "expira: < 30d"  
**Then** the table shows certificates matching ALL three conditions  
**And** three filter badges are displayed  
**And** results return within 2 seconds  

**Prototype reference:** Screen "02 Inventário" — multiple filter buttons shown; user can click "+ filtro" to add more

---

### Scenario 1.10: User can clear a single filter

**Given** the user has applied filter "expira: < 30d"  
**When** they click the "×" button on the filter badge  
**Then** the filter is removed  
**And** the table refreshes to show all matching other criteria  

**Prototype reference:** Screen "02 Inventário" — filter badge "expira: < 30d ×" has clickable × to remove

---

### Scenario 1.11: Certificate status is visually indicated in table

**Given** the user views the Inventory table  
**When** a certificate expires in < 7 days  
**Then** the Status column shows a red badge "Crítico" with animated dot  
**When** a certificate expires in 7-30 days  
**Then** the Status column shows a yellow badge "Atenção"  
**When** a certificate is valid (> 30 days)  
**Then** the Status column shows a green badge "Válido"  

**Prototype reference:** Screen "02 Inventário" — Status column shows badges: "Crítico" (red dot), "Atenção" (yellow dot)

---

### Scenario 1.12: Days-to-expiration column color-codes urgency

**Given** the user views the Inventory table  
**When** a certificate expires in 2-5 days  
**Then** the "Expira em" column displays the count in red (critical)  
**When** a certificate expires in 6-30 days  
**Then** the "Expira em" column displays the count in yellow (warning)  
**When** a certificate expires in > 30 days  
**Then** the "Expira em" column displays the count in green (valid)  

**Prototype reference:** Screen "02 Inventário" — Expira em column shows "2 dias" (red), "12 dias" (yellow), "26 dias" (yellow)

---

### Scenario 1.13: User can navigate to certificate detail by clicking row

**Given** the user is on the Inventory screen  
**When** they click on a table row (or the → action arrow)  
**Then** they are navigated to the Certificate Detail screen for that certificate  
**And** the detail page shows the same CN in the title  

**Prototype reference:** Screen "02 Inventário" → Screen "03 Detalhe do certificado" (linked by row click or → button)

---

### Scenario 1.14: Negative: Empty search returns no results

**Given** the user is on the Inventory screen  
**When** they search for "nonexistentcertificate-xyz"  
**Then** the table displays no results  
**And** a message or empty state appears  

**Prototype reference:** Screen "02 Inventário" — search box; implementation should show empty table if no matches

---

### Scenario 1.15: Negative: Invalid filter value shows error or no results

**Given** the user is on the Inventory screen  
**When** they attempt to apply filter "expira: invalid"  
**Then** an error message is shown, OR the filter is ignored  
**And** the table is not broken  

**Prototype reference:** Implicit in filter UI behavior

---

## Scenario Set 2: Certificate Detail View (Screen "03 Detalhe do certificado")

### Scenario 2.1: User can view all certificate metadata

**Given** the user has clicked into a certificate detail (e.g., "api-payments.bank.internal")  
**Then** the detail screen displays:  
- Status badge (e.g., "Crítico")
- Common Name as title
- Serial number (0x00d4e82f1a23b5c7)
- Subject Alt Names (payments-v2, payments-canary, api-payments-dr)
- Issuer (Vault PKI - Bank Root CA)
- notBefore (2024-05-21 14:32:08 UTC)
- notAfter (2025-05-21 14:32:08 UTC)
- Algorithm (RSA 2048)
- Fingerprint SHA256 (a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6)

**Prototype reference:** Screen "03 Detalhe do certificado" — Metadata panel (left column) shows all fields in info-grid

---

### Scenario 2.2: Certificate expiration countdown is prominently displayed

**Given** the user views a critical certificate detail  
**When** the certificate expires in 2 days  
**Then** the expiration date is shown at top-right in large red text  
**And** a countdown "2 dias" is displayed below the timestamp  
**And** the status badge also shows "Crítico"  

**Prototype reference:** Screen "03 Detalhe do certificado" — top-right corner shows "notAfter: 2025-05-21 14:32:08 UTC" and "⚠ 2 dias" in red

---

### Scenario 2.3: User can view and manage tags

**Given** the user views the certificate detail  
**Then** the Tags & custom fields panel displays applied tags:
- "criticidade:alta"
- "env:prd"
- "time:pagamentos"
- "sla:99.99"

**When** the user clicks "+ Adicionar tag"  
**Then** a form appears to add a new tag  

**Prototype reference:** Screen "03 Detalhe do certificado" — Tags & custom fields panel (left column) shows badge list + button

---

### Scenario 2.4: User can view operational information

**Given** the user views the certificate detail  
**Then** the Operational info panel (right column) shows:
- Owner: time-pagamentos
- Application: API Payments v2
- Environment: PRD
- CA / Zona: Vault PKI / bank-prd
- Status: Crítico badge

**Prototype reference:** Screen "03 Detalhe do certificado" — Operational info panel (right column) with 1-column info-grid

---

### Scenario 2.5: User can navigate back to inventory

**Given** the user is on the certificate detail screen  
**When** they click the breadcrumb "Certificados"  
**Then** they return to the Inventory list  

**Prototype reference:** Screen "03 Detalhe do certificado" — breadcrumb at top: "Certificados / api-payments.bank.internal"

---

### Scenario 2.6: User can download certificate (PEM format)

**Given** the user is on the certificate detail screen  
**When** they click "Baixar certificado"  
**Then** the certificate is downloaded as a PEM file  
**And** the filename matches the CN (e.g., "api-payments.bank.internal.pem")  

**Prototype reference:** Screen "03 Detalhe do certificado" — Actions panel (right column) button "Baixar certificado"

---

### Scenario 2.7: User can renew a certificate

**Given** the user is on the certificate detail screen  
**When** they click "Renovar certificado"  
**Then** a renewal workflow is initiated (future feature C4, out of scope for this spec)  
**And** the button is functional/clickable  

**Prototype reference:** Screen "03 Detalhe do certificado" — Actions panel button "Renovar certificado"

---

### Scenario 2.8: User can revoke a certificate

**Given** the user is on the certificate detail screen  
**When** they click "Revogar certificado"  
**Then** a confirmation dialog appears asking for confirmation  
**When** they confirm  
**Then** the certificate is revoked  
**And** the status changes to "Revogado" (revoked)  
**And** an audit log entry is created (feature C5)  

**Prototype reference:** Screen "03 Detalhe do certificado" — Actions panel button "Revogar certificado" (red/danger styling)

---

### Scenario 2.9: Negative: User cannot access detail of certificate they don't own (RBAC)

**Given** the user is logged in as a member of "time-pagamentos"  
**When** they try to access the detail URL of a certificate owned by "time-data"  
**Then** an access denied message is shown (depends on RBAC implementation)  
**Or** the detail is shown but edit actions are disabled  

**Prototype reference:** RBAC enforcement in backend; not visible in prototype but must be enforced

---

## Scenario Set 3: Manual Certificate Import (Upload)

### Scenario 3.1: User can upload a single PEM certificate

**Given** the user is on the Inventory screen  
**When** they click "Emitir certificado" (or a future "Importar" button)  
**Then** a file upload dialog appears  
**When** they select a valid PEM file  
**Then** the certificate is parsed and metadata is extracted  
**And** they proceed to a form to set owner, application, environment, zone, and tags  
**When** they confirm  
**Then** the certificate is added to the inventory  
**And** it appears in the list  

**Prototype reference:** Screen "02 Inventário" — "Emitir certificado" button (future: will support import action)

---

### Scenario 3.2: User can upload a PKCS#12 file

**Given** the user initiates certificate import  
**When** they select a valid PKCS#12 (.p12 or .pfx) file  
**Then** the certificate and key are parsed  
**And** metadata is extracted from the certificate  
**When** they confirm the import  
**Then** the certificate is added to inventory (key storage handled separately)  

**Prototype reference:** Similar to 3.1; file type support implicit

---

### Scenario 3.3: Negative: Invalid PEM file is rejected

**Given** the user initiates certificate import  
**When** they select an invalid or corrupted PEM file  
**Then** an error message is shown: "Invalid certificate format"  
**And** the upload is halted  

**Prototype reference:** Validation on file upload (not shown in prototype but required for robustness)

---

### Scenario 3.4: Negative: User must set required fields before import

**Given** the user has uploaded a valid certificate  
**When** they try to confirm the import without setting Owner, Application, or Environment  
**Then** validation errors are shown for missing fields  
**And** the import is blocked  

**Prototype reference:** Form validation on import form (not shown in prototype)

---

## Scenario Set 4: Batch Import (CSV/API)

### Scenario 4.1: User can bulk import certificates via CSV

**Given** the user is on the Inventory screen  
**When** they click an "Import CSV" action (future feature)  
**Then** a CSV upload dialog appears  
**When** they upload a valid CSV file with headers: `cn,san,owner,application,environment,ca,zone,tag_criticality,tag_team`  
**Then** the system parses each row and creates a certificate record  
**And** an import summary is shown (e.g., "23 imported, 0 failed")  
**And** certificates appear in inventory  

**Prototype reference:** Batch import mechanism not shown in prototype; required for functional scope

---

### Scenario 4.2: Batch import validates all rows before committing

**Given** the user uploads a CSV with 10 rows, where row 5 has missing required field  
**When** the import is processed  
**Then** validation errors are reported for row 5  
**And** NO rows are committed (all-or-nothing, or partial with error report)  
**And** user is given option to fix and retry  

**Prototype reference:** Batch validation (not shown in prototype)

---

### Scenario 4.3: API endpoint accepts JSON certificate array

**Given** an external system calls `POST /api/v1/certificates/import`  
**When** it sends a JSON payload with certificate objects  
**Then** the endpoint validates and imports each certificate  
**And** returns a response with import count and any errors  

**Prototype reference:** API endpoint behavior (not visible in prototype; required by functional scope)

---

## Scenario Set 5: Search and Filter Performance

### Scenario 5.1: Search returns results within 2 seconds for 10k+ certificates

**Given** the system contains 10,000+ certificates  
**When** the user searches for a CN  
**Then** results are returned within 2 seconds  

**Prototype reference:** Performance requirement stated in PRD; tested at scale

---

### Scenario 5.2: Expiration filter completes within 2 seconds for 10k+ certificates

**Given** the system contains 10,000+ certificates  
**When** the user applies filter "expira: < 30d"  
**Then** results are returned within 2 seconds  
**And** the correct count is shown (e.g., 23 matching)  

**Prototype reference:** Performance requirement stated in PRD and acceptance criteria section

---

### Scenario 5.3: Pagination does not load all certificates at once

**Given** the user is on page 1 of the inventory  
**When** the page loads  
**Then** only the records for page 1 are fetched (not all 10k records)  
**And** page navigation fetches only subsequent pages on demand  

**Prototype reference:** Screen "02 Inventário" shows pagination footer with "Próxima página" link

---

## Scenario Set 6: Data Integrity & Metadata

### Scenario 6.1: All X.509 certificate metadata is captured

**Given** a certificate with standard X.509 v3 extensions is uploaded  
**When** the certificate is imported  
**Then** the system captures: CN, SANs, issuer, serial, notBefore, notAfter, algorithm, key size, fingerprint  
**And** all fields are stored and retrievable  

**Prototype reference:** Screen "03 Detalhe do certificado" shows all metadata fields

---

### Scenario 6.2: Custom tags are stored and searched

**Given** the user adds tag "criticality:high" to a certificate  
**When** the certificate is saved  
**Then** the tag is persisted in the database  
**And** when the user searches/filters by "criticality:high", the certificate is found  

**Prototype reference:** Screen "03 Detalhe do certificado" — tags panel shows "criticidade:alta" etc.

---

### Scenario 6.3: Custom fields are extensible without migration

**Given** an organization wants to add custom field "cost-center" to certificates  
**When** they configure this field in the system  
**Then** existing certificates can be updated with the new field  
**And** the schema does not require database migration (uses JSON/flexible storage)  

**Prototype reference:** Implicit in PRD requirement for "custom fields"; not shown in prototype

---

## Scenario Set 7: Negative / Error Cases

### Scenario 7.1: Expired certificate is marked correctly

**Given** a certificate's notAfter date is in the past  
**When** the certificate is displayed in inventory  
**Then** the Status badge shows "Crítico" (or "Expirado")  
**And** the Expira em column shows "0 dias" or negative value in red  

**Prototype reference:** Status badging logic; not shown for expired cert in prototype but must be handled

---

### Scenario 7.2: Revoked certificate is marked correctly

**Given** a certificate has been revoked  
**When** the certificate is displayed in inventory  
**Then** the Status badge shows "Revogado"  
**And** the row is visually distinct (e.g., grayed out or with different badge color)  

**Prototype reference:** Status badging; prototype shows "b-rev" CSS class for revoked status

---

### Scenario 7.3: Database is unavailable during list operation

**Given** the database connection is lost  
**When** the user tries to view the inventory  
**Then** an error message is shown: "Unable to load certificates"  
**And** the page does not crash  

**Prototype reference:** Error handling (not shown in prototype; required for production)

---

## Scenario Set 8: Accessibility & UX

### Scenario 8.1: Search results update in real-time (debounced)

**Given** the user is on the Inventory screen  
**When** they type in the search box  
**Then** results update without requiring a "Search" button press  
**And** requests are debounced (e.g., only search after 300ms of typing)  

**Prototype reference:** Screen "02 Inventário" — search box design implies real-time behavior

---

### Scenario 8.2: Active filters are always visible

**Given** the user has applied multiple filters  
**When** they scroll or navigate within the table  
**Then** the filter bar remains visible (sticky or prominent)  
**And** they can clear filters without scrolling up  

**Prototype reference:** Screen "02 Inventário" — filter bar at top of table

---

### Scenario 8.3: Certificate metadata uses monospace font for technical fields

**Given** the user views a certificate detail  
**When** viewing CN, serial, fingerprint, or algorithm fields  
**Then** these are rendered in monospace font for clarity  
**And** SANs use sans-serif for readability  

**Prototype reference:** Screen "03 Detalhe do certificado" — info-grid uses monospace for technical fields; SANs use `.sans` class

---

## Summary of Test Coverage

- **Positive scenarios:** 30+ (list, search, filter, detail, import, metadata, performance, UX)
- **Negative scenarios:** 8+ (invalid input, missing fields, error handling, access control)
- **Performance scenarios:** 3+ (2s requirement for search/filter, pagination)
- **Data integrity scenarios:** 3+ (metadata capture, custom fields, tagging)

All scenarios map to screens and components visible in the approved prototype or are required by the PRD functional scope.
