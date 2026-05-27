# Acceptance Criteria: C1. Inventário Centralizado de Certificados

**Feature**: C1. Inventory & Certificate Management  
**Format**: Gherkin (Given/When/Then)  
**Scope**: MVP - List, Search, Filter, Manual Upload, Bulk Import

---

## Functional Requirement 1: Display Certificate Inventory List

**Requirement**: Users can view a paginated list of all imported certificates with metadata.

### Scenario 1.1: Display inventory list with 10k+ certificates (Positive)

```gherkin
Given the system contains 10,847 imported certificates
And the user is a PKI Administrator
When the user navigates to "Certificados" page
Then the page loads in less than 1 second
And the certificate list is displayed with a default page size of 25 items
And the total count badge shows "10,847 certificados"
And columns are visible: CN/SANs, Zona/Env, Status, CA/Algoritmo, Owner, Expira em, Action
And pagination controls show "1 of 434 pages"
And first 25 certificates are correctly displayed
```

### Scenario 1.2: Pagination works correctly (Positive)

```gherkin
Given the inventory list is displayed with 25 certs per page
And there are 100 total certificates
When the user clicks "Next page"
Then certificates 26-50 are loaded and displayed
And the page indicator updates to "2 of 4 pages"
And "Previous page" button is enabled

When the user clicks the page dropdown and selects "50"
Then the page size changes to 50 items per page
And page count updates to "2 of 2 pages"
And the view refreshes with 50 items (certificates 1-50)
```

### Scenario 1.3: Table is empty (Negative)

```gherkin
Given the system has no imported certificates
When the user navigates to "Certificados" page
Then an empty state is displayed
And message shows "Nenhum certificado encontrado. Comece importando."
And an "Import" button is prominently shown
And no table is rendered
```

### Scenario 1.4: Certificate details are accurate (Positive)

```gherkin
Given a certificate with these attributes exists:
| CN                  | api-payments.internal      |
| SAN                 | payments-v2, payments-canary |
| Status              | VALID                      |
| CA                  | Vault PKI                  |
| Algorithm           | RSA 2048                   |
| Owner               | time-pagamentos            |
| Environment         | prd                        |
| Days until expiry   | 45                         |
| Zone                | bank-prd                   |

When the user views the inventory list
Then the table displays the certificate row with:
  - CN cell shows "api-payments.internal" in monospace font
  - SAN cell shows badge "+ 2 SANs: payments-v2, payments-canary"
  - Status shows green "VALID" badge
  - CA column shows "Vault PKI" and "RSA 2048"
  - Owner shows "time-pagamentos"
  - Environment shows "bank-prd / prd" badge
  - Days column shows "45 dias" in neutral color
  - Row is clickable and navigates to detail page
```

---

## Functional Requirement 2: Search Certificates by Multiple Fields

**Requirement**: Users can search certificates by CN, SAN, serial, fingerprint, or owner using a single search box.

### Scenario 2.1: Search by Common Name (Positive)

```gherkin
Given the inventory contains these certificates:
| CN                        |
| api-payments.internal     |
| api-gateway.internal      |
| auth-service.internal     |

When the user types "api-pay" in the search box
Then after 300ms debounce, results are filtered to 1 certificate
And "api-payments.internal" row is displayed
And total count shows "1 of 2,847 certificados"
And filter indicator shows "search: api-pay" chip
```

### Scenario 2.2: Search by SAN (Positive)

```gherkin
Given a certificate exists with:
| CN   | api.internal        |
| SAN  | api-v1, api-v2      |

When the user searches for "api-v2"
Then the certificate is returned in results
And the SAN value "api-v2" is highlighted in the result
```

### Scenario 2.3: Search by Serial Number (Positive)

```gherkin
Given a certificate with serial number "1A2B3C4D5E6F" exists
When the user searches for "1A2B3C"
Then the certificate is returned
```

### Scenario 2.4: Search by Owner (Positive)

```gherkin
Given 5 certificates owned by "platform-team" and 3 owned by "payments-team"
When the user searches for "payments"
Then exactly 3 certificates are displayed
And all have owner "payments-team"
```

### Scenario 2.5: Search returns no results (Negative)

```gherkin
Given the inventory contains 2,847 certificates
When the user searches for "nonexistent-cert-xyz"
Then the table shows empty state
And message displays "Nenhum certificado encontrado para 'nonexistent-cert-xyz'"
And a "Limpar busca" button is shown to reset
```

### Scenario 2.6: Search with less than 2 characters (Negative)

```gherkin
Given the search box is focused
When the user types "a" (single character)
Then no search is triggered
And the full inventory is still displayed
And a hint shows "Digite pelo menos 2 caracteres"
```

### Scenario 2.7: Case-insensitive search (Positive)

```gherkin
Given a certificate with CN "API-Payments.Internal"
When the user searches for "api-payments"
Then the certificate is returned (case insensitive match)
```

---

## Functional Requirement 3: Filter Certificates by Expiration Window

**Requirement**: Users can filter certificates by expiration window (e.g., expires in <30 days).

### Scenario 3.1: Filter "expires < 30 days" (Positive)

```gherkin
Given the inventory contains:
| Status          | Count |
| Expires in 2d   | 5     |
| Expires in 20d  | 18    |
| Expires in 45d  | 100   |
| Expires in >90d | 2724  |

When the user clicks the filter "expira: <30d"
Then results show exactly 23 certificates
And all displayed certs have notAfter <= 30 days from now
And the filter chip shows "expira: <30d ×" with remove button
And total count displays "23 of 2,847"
And page size resets to default (25, showing "1 of 1 page")
```

### Scenario 3.2: Filter "expires < 7 days" (Positive)

```gherkin
Given the inventory with certificates expiring in 2, 5, 10, 15 days
When the user applies filter "expira: <7d"
Then only certificates expiring in 2 and 5 days are shown
And count shows "2"
```

### Scenario 3.3: Multiple filter filters (Positive)

```gherkin
Given inventory with mixed environments (dev, hml, prd) and expirations
When the user applies filters: "expira: <30d" AND "env: prd"
Then results show only PRD certificates expiring in <30 days
And both filter chips are displayed: "expira: <30d ×" and "env: prd ×"
```

### Scenario 3.4: Filter returns zero results (Negative)

```gherkin
Given no certificates expire in the next 7 days
When the user applies filter "expira: <7d"
Then an empty state is shown
And message displays "Nenhum certificado expirando em <7 dias"
And the filter chip remains active for clarity
```

---

## Functional Requirement 4: Filter by Environment, CA, Status, and Custom Tags

**Requirement**: Users can apply multiple filters simultaneously (OR logic within filter, AND across filters).

### Scenario 4.1: Filter by environment (Positive)

```gherkin
Given inventory with certificates in dev, hml, prd environments
When the user adds filter "env: prd"
Then only PRD certificates are displayed
And the count updates accordingly
```

### Scenario 4.2: Multi-select filter (OR logic) (Positive)

```gherkin
Given the "Environment" filter allows multi-select
When the user selects "dev" and "hml" (not prd)
Then certificates from EITHER dev OR hml are displayed
And PRD certificates are excluded
And the filter shows "env: dev, hml ×"
```

### Scenario 4.3: Filter by CA (Positive)

```gherkin
Given inventory with certs from "Vault PKI", "AWS ACM PCA", "GlobalSign"
When the user adds filter "CA: Vault PKI"
Then only certs issued by Vault PKI are shown
```

### Scenario 4.4: Filter by Status (Positive)

```gherkin
Given certificates with statuses: VALID, EXPIRING_SOON, EXPIRED, REVOKED
When the user applies filter "status: EXPIRED, REVOKED"
Then only expired and revoked certs are shown
And valid/expiring_soon are excluded
```

### Scenario 4.5: Filter by custom tags (Positive - AND logic)

```gherkin
Given certificates tagged with "mTLS", "auto-renewal", "client-cert"
When the user selects tags "mTLS" AND "auto-renewal"
Then only certificates with BOTH tags are displayed
And certificates with only one tag are excluded
```

### Scenario 4.6: Combine multiple filters (Positive)

```gherkin
Given complex inventory data
When the user applies:
  - "expira: <30d"
  - "env: prd"
  - "CA: Vault PKI"
  - "status: EXPIRING_SOON"
Then results show intersecting set (AND logic across filters)
And all four filter chips are visible
And "Clear all filters" button is enabled
```

### Scenario 4.7: Clear all filters (Positive)

```gherkin
Given the user has applied 3 filters
When the user clicks "Clear all filters"
Then all filters are removed
And the full inventory is displayed again
And the table resets to page 1 with default sorting
```

---

## Functional Requirement 5: Manual Certificate Upload

**Requirement**: Users can upload a single certificate file (PEM, PKCS#12) and metadata.

### Scenario 5.1: Upload valid PEM certificate (Positive)

```gherkin
Given the user is on the "Certificados" page
When the user clicks "Import certificate" button (or equivalent upload trigger)
Then an upload dialog appears with fields:
  - File input (accepts .pem, .crt, .der, .p12, .pfx)
  - Owner field (auto-filled with current user)
  - Environment dropdown (required)
  - Application field (free text)
  - Custom tags field (comma-separated)
  - Cancel and Submit buttons

When the user selects a valid PEM file (api-payments.pem)
And clicks "Preview"
Then the certificate metadata is extracted and displayed:
  - CN: api-payments.internal
  - SANs: payments-v2, payments-canary
  - Issuer: Vault PKI
  - Valid From: 2024-01-15
  - Valid Until: 2025-01-15
  - Algorithm: RSA 2048

When the user confirms and clicks "Submit"
Then:
  - The certificate is imported and stored
  - A success toast shows "Certificado importado com sucesso"
  - The user is redirected to the certificate detail page
  - The new cert appears in the inventory list
  - An audit log entry is created (IMPORT action)
```

### Scenario 5.2: Upload PKCS#12 with password (Positive)

```gherkin
Given the user has a PKCS#12 file (cert.p12) protected by password
When the user uploads the file
Then a password prompt appears
When the user enters the correct password and clicks "Decrypt"
Then the certificate is extracted and parsed successfully
And the import proceeds as normal
```

### Scenario 5.3: Upload fails due to invalid certificate (Negative)

```gherkin
Given the user uploads a file with invalid certificate data
When the system attempts to parse the file
Then an error dialog appears:
  "Certificado inválido ou formato não suportado.
   Por favor, verifique o arquivo e tente novamente."
And the file input is cleared
And the user can re-select another file
```

### Scenario 5.4: Upload fails due to unsupported format (Negative)

```gherkin
Given the user selects a file with unsupported format (e.g., .txt, .jpg)
When the user clicks "Preview"
Then an error shows "Formato de arquivo não suportado"
And supported formats are listed: PEM, PKCS#12, DER
```

### Scenario 5.5: Duplicate certificate upload (Negative)

```gherkin
Given a certificate with CN "api-payments.internal" and serial "ABC123" already exists in inventory
When the user uploads the same certificate
Then the system detects the duplicate (by CN + issuer)
And shows a warning dialog:
  "Este certificado já existe no inventário.
   Deseja sobrescrever ou importar como nova versão?"
   [Sobrescrever] [Importar como nova] [Cancelar]
```

### Scenario 5.6: Owner field is editable (Positive)

```gherkin
Given the upload dialog with pre-filled owner (current user)
When the user modifies the owner field to "payments-team"
Then the change is accepted
And "payments-team" is saved as the certificate owner
```

### Scenario 5.7: Environment is required (Negative)

```gherkin
Given the upload dialog
When the user tries to submit without selecting an environment
Then an error message appears below the field:
  "Ambiente é obrigatório"
And the submit button is disabled
```

---

## Functional Requirement 6: Bulk Import from CSV

**Requirement**: Users can import multiple certificates via CSV file with metadata.

### Scenario 6.1: Successful bulk import (Positive)

```gherkin
Given the user has a CSV file with this format:
cn,san,serial,issuer,owner,environment,application,tags,zone
api-payments.internal,payments-v2;payments-canary,1A2B3C,Vault PKI,payments-team,prd,api-payments,"mTLS;auto-renewal",bank-prd
kafka-broker.internal,,ABC123,Vault PKI,data-team,prd,kafka,"mTLS",bank-prd

When the user clicks "Bulk Import" (or uploads CSV)
Then the CSV is parsed and validated
And a preview dialog shows:
  - Row count: 2 valid, 0 errors
  - Table preview of parsed data
  - [Confirm Import] [Cancel] buttons

When the user clicks "Confirm Import"
Then:
  - The system begins importing (shows progress bar)
  - All rows are successfully imported
  - Success message shows "2 certificados importados com sucesso"
  - An import batch ID is generated and logged
  - All certificates appear in the inventory
```

### Scenario 6.2: Bulk import with validation errors (Negative)

```gherkin
Given a CSV with 5 rows, where row 3 has invalid certificate data
When the user imports
Then the preview shows:
  - Row 1: Valid
  - Row 2: Valid
  - Row 3: Error - "Certificado inválido"
  - Row 4: Valid
  - Row 5: Valid

When the user clicks "Continue with Valid Rows"
Then 4 certificates are imported (rows 1, 2, 4, 5)
And row 3 is available for download/retry
And a summary shows "4 importados, 1 erro"
```

### Scenario 6.3: Bulk import with duplicate detection (Negative)

```gherkin
Given the CSV contains 3 certificates, where one already exists in inventory
When the system validates the CSV
Then the preview shows the duplicate with:
  - Status: "Duplicado"
  - Option: [Sobrescrever] [Pular] [Versão nova]

When the user clicks "Pular" (Skip)
Then the import proceeds with the other 2 certs only
And the skipped cert is reported in summary
```

### Scenario 6.4: Large bulk import (performance) (Positive)

```gherkin
Given the user uploads a CSV with 10,000 certificate rows
When the system begins import
Then:
  - A progress bar appears (shows % complete)
  - Processing happens in background
  - User can continue browsing or leave page
  - On completion, a notification appears: "10,000 certificados importados"
  - All certs are queryable in inventory list
```

---

## Functional Requirement 7: Certificate Detail Page

**Requirement**: Users can view full metadata of a certificate.

### Scenario 7.1: Display certificate detail (Positive)

```gherkin
Given the user is viewing the inventory list
When the user clicks a certificate row (or the detail icon)
Then the detail page loads showing:
  - Breadcrumb: "Certificados / api-payments.internal"
  - CN with status badge (VALID in green)
  - Two-column layout:
    Left: Certificate metadata
      - Serial: 1A2B3C4D5E6F (copyable)
      - Fingerprint SHA-256: [long hex] (copyable)
      - notBefore: 2024-01-15 10:30:00 UTC
      - notAfter: 2025-01-15 10:30:00 UTC
      - Days until expiry: 45 (yellow badge)
      - Algorithm: RSA 2048
      - Issuer: CN=Vault PKI, OU=IT
      - Owner: time-pagamentos (editable in C2)
      - Application: api-payments
      - Zone: bank-prd
      - Environment: prd
      - Custom Tags: mTLS, auto-renewal
      
    Right: Actions & Metadata
      - Created: 2024-01-15 by system
      - Updated: 2024-05-20 by system
      - Import Source: manual_upload
      - [Export PEM] [Export JSON] [Edit] [Revoke] [Delete] buttons
```

### Scenario 7.2: Copy certificate metadata (Positive)

```gherkin
Given the detail page is displayed
When the user clicks the copy button next to "Serial: 1A2B3C"
Then the serial is copied to clipboard
And a visual feedback (checkmark or toast) confirms the copy
```

### Scenario 7.3: Export certificate in PEM format (Positive)

```gherkin
Given the detail page
When the user clicks "[Export PEM]"
Then a .pem file is downloaded with the certificate data
And the filename is: "api-payments.internal.pem"
```

### Scenario 7.4: Expired certificate detail (Negative)

```gherkin
Given a certificate with notAfter in the past
When the user views its detail page
Then:
  - Status badge shows "EXPIRED" in red
  - Days until expiry shows "-15 days" (red)
  - A warning banner appears: "Este certificado expirou em [date]"
  - A "Revoke" button is available for cleanup
```

---

## Functional Requirement 8: Performance & Scalability

**Requirement**: System handles 10k+ certificates efficiently.

### Scenario 8.1: Load and display 10k certificates (Positive)

```gherkin
Given the system contains 10,847 certificates
When the user navigates to "Certificados"
Then:
  - Page loads in less than 1 second
  - First 25 certificates are visible immediately
  - Scrolling or pagination is smooth (60 FPS)
  - Table doesn't freeze or lag
```

### Scenario 8.2: Filter performance with 10k certificates (Positive)

```gherkin
Given inventory with 10,847 certificates
When the user applies filter "expira: <30d"
Then:
  - Results are returned in less than 2 seconds
  - The count updates (e.g., "47 of 10,847")
  - The table refreshes with filtered results
  - No spinner loops or timeout errors
```

### Scenario 8.3: Search performance (Positive)

```gherkin
Given 10,847 certificates in inventory
When the user searches for "api-pay"
Then:
  - Results appear within 300ms debounce + backend latency
  - Full-text search returns relevant matches
  - No browser lag or slowdown
```

### Scenario 8.4: Sorting large result sets (Positive)

```gherkin
Given the inventory list with 25 rows displayed
When the user clicks column header "Expira em" to sort
Then:
  - The table re-sorts within 100ms
  - Ascending/descending order toggles
  - Re-fetches data if necessary (no client-side sort for large sets)
```

---

## Functional Requirement 9: Audit Logging

**Requirement**: All certificate imports and changes are logged for compliance.

### Scenario 9.1: Import action is logged (Positive)

```gherkin
Given the user imports a certificate successfully
When the import completes
Then an audit log entry is created with:
  - Timestamp: precise to millisecond
  - Actor: current user ID/username
  - Action: IMPORT
  - Certificate: CN + issuer
  - Source: manual_upload / csv_import / api_import
  - Result: SUCCESS
  - Details: cert metadata (CN, serial, issuer)

And the entry is immutable (cannot be edited or deleted)
```

### Scenario 9.2: Failed import is logged (Positive)

```gherkin
Given a user attempts to import an invalid certificate
When the import fails
Then an audit log entry is created with:
  - Action: IMPORT
  - Result: FAILURE
  - Error Reason: "Certificado inválido"
  - File: attempted filename
```

### Scenario 9.3: Bulk import batch is tracked (Positive)

```gherkin
Given the user uploads a CSV with 100 certificates
When the import completes
Then all 100 entries share the same Batch ID
And the batch ID is stored in each audit entry
And the batch can be audited as a unit
```

---

## Functional Requirement 10: Error Handling & Edge Cases

**Requirement**: System handles errors gracefully.

### Scenario 10.1: Network error during import (Negative)

```gherkin
Given the user is uploading a large certificate file
When the network connection drops midway
Then:
  - Upload is paused (not failed)
  - An error message shows "Falha na conexão. Tente novamente."
  - A retry button is available
  - User can resume the upload from checkpoint (if implemented)
```

### Scenario 10.2: Malformed CSV (Negative)

```gherkin
Given a CSV with missing required columns
When the user attempts bulk import
Then the validation fails
And an error message shows:
  "Coluna 'cn' não encontrada.
   Colunas obrigatórias: cn, issuer, owner, environment"
And the user can download a template CSV
```

### Scenario 10.3: Very long certificate CN (Edge Case - Positive)

```gherkin
Given a certificate with CN longer than 255 characters
When the certificate is imported and displayed
Then:
  - The CN is stored in full
  - The UI truncates with ellipsis: "api-payments-very-long-name-..." (copyable full text on hover)
  - Detail page shows full CN
```

### Scenario 10.4: Certificate with 100+ SANs (Edge Case - Positive)

```gherkin
Given a certificate with 150 Subject Alternative Names
When the certificate is imported
Then:
  - All SANs are stored
  - Inventory list shows badge: "+ 150 SANs"
  - Detail page shows all SANs in a scrollable list
  - Search works across all SANs
```

### Scenario 10.5: Concurrent imports (Negative)

```gherkin
Given the user has initiated a bulk import (10k certs, ~30s)
When the user (or another user) starts another import simultaneously
Then:
  - Both imports proceed (no locking)
  - A warning shows "Uma importação já está em andamento"
  - User can proceed or cancel
  - Audit logs distinguish both imports by separate batch IDs
```

---

## Non-Functional Requirements

### Scenario NF.1: Data Validation (Positive)

```gherkin
Given any certificate import
When the system parses the certificate
Then it validates:
  - X.509 v3 format compliance
  - CN is not empty
  - Serial is unique (per issuer)
  - Dates are parseable
  - Algorithm is known
  - Key size is acceptable (>= 2048 for RSA)
  
And rejects any that don't meet criteria
```

### Scenario NF.2: Security - Access Control (Positive)

```gherkin
Given a user without pki-admin role
When the user attempts to access "Certificados"
Then:
  - View access is denied (viewer role can only see read-only)
  - Import button is hidden
  - Filter/export options are limited (or hidden)
  - An error "Acesso negado" is displayed (or redirect to login)
```

### Scenario NF.3: Data Privacy (Positive)

```gherkin
Given sensitive certificate metadata (private keys should NOT be stored)
When certificates are imported and stored
Then:
  - Only public certificate data is stored (X.509 cert, no private key)
  - Certificate blob is encrypted at rest (if PII in CN)
  - No passwords are logged
  - Audit logs don't expose cert content beyond metadata
```

---

## Test Coverage Summary

| Requirement | Positive Scenarios | Negative Scenarios | Edge Cases |
|-------------|-------------------:|-------------------:|----------:|
| 1. Display List | 4 | 1 | 0 |
| 2. Search | 7 | 2 | 0 |
| 3. Filter Expiration | 4 | 2 | 0 |
| 4. Filter Other | 7 | 1 | 0 |
| 5. Manual Upload | 7 | 3 | 0 |
| 6. Bulk Import | 4 | 2 | 1 |
| 7. Detail Page | 4 | 1 | 0 |
| 8. Performance | 4 | 0 | 0 |
| 9. Audit Logging | 3 | 0 | 0 |
| 10. Error Handling | 0 | 4 | 4 |
| Non-Functional | 3 | 0 | 0 |
| **TOTAL** | **47** | **16** | **5** |

**Total Scenarios**: **68**

---

**Acceptance Criteria Version**: 1.0  
**Last Updated**: 2026-05-27
