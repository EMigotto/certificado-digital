# Acceptance Criteria: C3 - Inventário Centralizado de Certificados

## Feature: Centralised Certificate Inventory with Search, Filter and Display

---

## Scenario 1: Import Single Certificate via Upload

**Given** I am a PKI Administrator on the inventory import page  
**When** I upload a valid PEM certificate file with metadata  
**Then** the certificate is parsed and displayed in a preview form  
**And** I can confirm and save it to the inventory  
**And** the certificate appears in the list view with correct metadata  

**Example:** PEM file for "api-payments.bank.internal" with owner="time-pagamentos", env="prd"

---

## Scenario 2: Import Single Certificate with Invalid Format

**Given** I am a PKI Administrator on the inventory import page  
**When** I upload a file that is not valid PEM or PKCS#12  
**Then** an error message is displayed explaining the format issue  
**And** the import fails without creating a record  
**And** I am offered the option to retry or cancel  

**Example:** Uploading a TXT file instead of PEM

---

## Scenario 3: Bulk Import via CSV

**Given** I am a PKI Administrator with a CSV file containing 100 certificates  
**When** I upload the CSV with columns: CN, SANs, Owner, Environment, CA, Tags  
**Then** the system validates all rows  
**And** valid rows are imported successfully  
**And** invalid rows are reported with specific error messages (row number, issue)  
**And** at least 95% of valid rows are persisted  

**Example:** CSV with rows like "api.bank.internal,api-v2.bank.internal,team-payments,prd,Vault PKI,production"

---

## Scenario 4: Bulk Import with Validation Errors

**Given** I am importing a CSV with 50 rows, 5 of which have missing owner field  
**When** the import process runs  
**Then** the system rejects the 5 incomplete rows  
**And** returns a report showing which rows failed and why  
**And** the remaining 45 valid rows are imported  

**Example:** Rows with empty Owner column fail with "Owner is required"

---

## Scenario 5: Search Certificates by Common Name

**Given** I am on the inventory list page  
**When** I enter "api-payments" in the search box  
**Then** the list filters to show only certificates containing "api-payments" in the CN  
**And** results are returned in <2 seconds  
**And** the search is case-insensitive  

**Example:** Search "api-payments" returns "api-payments.bank.internal"

---

## Scenario 6: Search Certificates by SAN

**Given** I am on the inventory list page  
**When** I enter "payments-canary" in the search box  
**Then** the list filters to show only certificates that have "payments-canary" in their SAN list  
**And** results are returned in <2 seconds  

**Example:** Search "payments-canary" returns cert with SANs=[api-payments.bank.internal, payments-canary]

---

## Scenario 7: Search Certificates by Serial Number

**Given** I am on the inventory list page  
**When** I enter a certificate serial number "12345ABCDEF" in the search box  
**Then** the list filters to show only the certificate with that exact serial  
**And** results are returned in <2 seconds  

**Example:** Search "12345ABCDEF" returns one matching cert

---

## Scenario 8: Search Certificates by Owner

**Given** I am on the inventory list page  
**When** I enter "time-payments" in the search box  
**Then** the list filters to show all certificates owned by "time-payments"  
**And** results are returned in <2 seconds  

**Example:** Search "time-payments" returns 5 certs owned by that team

---

## Scenario 9: Search with No Matches

**Given** I am on the inventory list page  
**When** I search for "non-existent-service"  
**Then** the list returns empty  
**And** a message is displayed: "No certificates found"  
**And** the search completes in <2 seconds  

---

## Scenario 10: Filter Certificates Expiring in <30 Days

**Given** I am on the inventory list page with 2847 certificates  
**When** I apply the filter "expira: < 30 dias"  
**Then** the list shows only certificates with expiration date within 30 days  
**And** the count is 23 certificates  
**And** the query returns in <2 seconds  
**And** each certificate shows "X dias" in the Days column  

**Example:** Cert expiring in 5 days shows "5 dias" in red (critical) or orange (warning)

---

## Scenario 11: Filter Certificates by Environment (Production)

**Given** I am on the inventory list page  
**When** I apply the filter "env: prd"  
**Then** the list shows only certificates with environment="prd"  
**And** the query returns in <2 seconds  

**Example:** Filtering shows 500 production certificates

---

## Scenario 12: Filter Certificates by CA Provider

**Given** I am on the inventory list page  
**When** I apply the filter "CA: Vault PKI"  
**Then** the list shows only certificates issued by Vault PKI  
**And** the query returns in <2 seconds  

**Example:** Filtering shows 1800 certs from Vault PKI, excludes 1047 from ACM PCA

---

## Scenario 13: Filter Certificates by Status (Expired)

**Given** I am on the inventory list page  
**When** I apply the filter "status: expired"  
**Then** the list shows only certificates with notAfter < today  
**And** the query returns in <2 seconds  

**Example:** Showing 14 expired certificates

---

## Scenario 14: Combine Multiple Filters

**Given** I am on the inventory list page  
**When** I apply filters: "env: prd" AND "expira: < 30 dias" AND "owner: team-payments"  
**Then** the list shows only certs matching ALL three conditions  
**And** the query returns in <2 seconds  
**And** the active filters are displayed as removable chips  

**Example:** Result shows 2 certificates matching all three criteria

---

## Scenario 15: Remove Filter

**Given** I am on the inventory list page with active filters applied  
**When** I click the "x" button on a filter chip  
**Then** that filter is removed  
**And** the list is updated to reflect the remaining filters  

**Example:** Clicking "x" on "expira: < 30 dias" removes that filter

---

## Scenario 16: Pagination with 10k+ Certificates

**Given** I am on the inventory list page with 10247 certificates  
**When** the page loads  
**Then** the first page displays 50 certificates  
**And** pagination controls show page numbers, "Previous" and "Next" buttons  
**And** the total count "10247" is displayed  

**Example:** Page 1 shows certs 1-50, page 2 shows certs 51-100, etc.

---

## Scenario 17: Navigate Between Pages

**Given** I am viewing page 1 of the certificate list  
**When** I click the "Next" button  
**Then** page 2 is loaded and displayed  
**And** the page counter updates to show "Page 2"  
**And** new certificates are displayed  

---

## Scenario 18: Navigate to Last Page

**Given** I am viewing the certificate list with 10247 total certs  
**When** I click on page number "205" (last page)  
**Then** the last page is loaded (certs 10201-10247)  
**And** the "Next" button is disabled  

---

## Scenario 19: View Certificate Detail

**Given** I am on the inventory list page  
**When** I click on a certificate row (e.g., "api-payments.bank.internal")  
**Then** I am navigated to the certificate detail page  
**And** all metadata fields are displayed: CN, SANs, Issuer, Serial, Fingerprint, Algorithm, Key Size  
**And** the validity dates (notBefore, notAfter) are shown  
**And** the owner and environment are displayed  

**Example:** Detail page shows all fields for api-payments.bank.internal with 2 SANs

---

## Scenario 20: View Certificate PEM

**Given** I am on the certificate detail page  
**When** the detail page loads  
**Then** the full certificate PEM content is displayed in a read-only text block  
**And** the PEM is copy-able (Ctrl+C or copy button)  

---

## Scenario 21: View Certificate Audit Log

**Given** I am on the certificate detail page  
**When** the detail page loads  
**Then** an "Audit Log" section displays all prior events for this certificate  
**And** each entry shows: Timestamp, Actor (user/service), Action (CREATE/UPDATE/DELETE), Result (success/fail)  
**And** entries are sorted chronologically (newest first)  

**Example:** Log shows: "2024-01-15 10:30 - Alice (pki-admin) - CREATE - Success"

---

## Scenario 22: Download Certificate

**Given** I am on the certificate detail page  
**When** I click the "Download" button  
**Then** the certificate PEM file is downloaded to my computer  
**And** the filename is the certificate CN (e.g., "api-payments.bank.internal.pem")  

---

## Scenario 23: Delete Certificate from Inventory

**Given** I am on the certificate detail page for a certificate I own  
**When** I click the "Delete" button  
**Then** a confirmation dialog appears asking "Are you sure?"  
**And** upon confirmation, the certificate is removed from the inventory  
**And** the list view is reloaded, no longer showing this certificate  
**And** an audit entry is created: "DELETE - Success"  

---

## Scenario 24: Dashboard Shows KPI: Total Managed Certificates

**Given** I am on the dashboard  
**When** the page loads  
**Then** the "Total gerenciados" KPI card displays the count of all certificates (2847)  
**And** the meta text shows growth: "+47 nos últimos 7d"  

---

## Scenario 25: Dashboard Shows KPI: Expiring in <30 Days

**Given** I am on the dashboard  
**When** the page loads  
**Then** the "Expiram < 30 dias" KPI card displays the count (23)  
**And** the card is visually highlighted in warning color (orange)  

---

## Scenario 26: Dashboard Shows Critical Alerts

**Given** I am on the dashboard  
**When** the page loads  
**Then** the "Alertas críticos" panel shows the top 5 certificates expiring soonest  
**And** each alert displays: CN, environment, owner, days remaining  
**And** alerts expiring in <7 days are colored red (critical)  
**And** alerts expiring in <30 days are colored orange (warning)  

**Example:** Top alert shows "api-payments.bank.internal" expiring in 2 days (red)

---

## Scenario 27: Dashboard Shows Expiration Heatmap

**Given** I am on the dashboard  
**When** the page loads  
**Then** a 30x3 heatmap grid is displayed  
**And** each cell represents one day over the next 90 days  
**And** cell intensity/color represents the count of certs expiring that day  
**And** the axis labels show: "Hoje", "+30d", "+60d", "+90d"  

---

## Scenario 28: Heatmap Hover Shows Tooltip

**Given** I am on the dashboard viewing the expiration heatmap  
**When** I hover over a cell  
**Then** a tooltip appears showing the number of certificates expiring on that day  

**Example:** Hovering over a red cell shows "8 certificates expire on 2024-02-15"

---

## Scenario 29: Add Tag to Certificate

**Given** I am on the certificate detail page  
**When** I enter a tag (e.g., "critical-app") in the tags field  
**And** I click "Save"  
**Then** the tag is added to the certificate  
**And** the tag appears in the certificate's tag list  
**And** an audit entry is created: "UPDATE - Success"  

---

## Scenario 30: Filter by Tag

**Given** I am on the inventory list page  
**When** I apply the filter "tag: critical-app"  
**Then** the list shows only certificates with the "critical-app" tag  
**And** the query returns in <2 seconds  

---

## Scenario 31: Export Certificate List to CSV

**Given** I am on the inventory list page with applied filters (env:prd, expira:<30d)  
**When** I click "Export to CSV"  
**Then** a CSV file is generated containing all filtered certificates  
**And** the CSV includes columns: CN, SANs, Owner, Environment, CA, Status, Days until expiration, Tags  
**And** the file is downloaded with timestamp in filename (e.g., "certs_export_20240115.csv")  

---

## Scenario 32: Audit Log: CREATE Entry

**Given** I have imported a new certificate  
**When** the import completes successfully  
**Then** an audit log entry is created with:
  - Timestamp (ISO 8601)
  - Actor: "system" or authenticated user
  - Action: "CREATE"
  - Target: certificate CN
  - Result: "SUCCESS"

---

## Scenario 33: Audit Log: UPDATE Entry

**Given** I have edited a certificate's tags/owner  
**When** the save completes successfully  
**Then** an audit log entry is created with:
  - Timestamp (ISO 8601)
  - Actor: authenticated user
  - Action: "UPDATE"
  - Target: certificate CN
  - Result: "SUCCESS"

---

## Scenario 34: Audit Log: DELETE Entry

**Given** I have deleted a certificate from the inventory  
**When** the deletion completes successfully  
**Then** an audit log entry is created with:
  - Timestamp (ISO 8601)
  - Actor: authenticated user
  - Action: "DELETE"
  - Target: certificate CN
  - Result: "SUCCESS"

---

## Scenario 35: Metric: List Performance <2 seconds

**Given** the inventory contains 10k+ certificates  
**When** I apply the filter "expira: < 30 dias"  
**Then** the query executes and results are displayed in <2 seconds (measured server response time)  

---

## Scenario 36: Metric: Search Performance <2 seconds

**Given** the inventory contains 10k+ certificates  
**When** I search for a certificate by CN (e.g., "api-payments")  
**Then** the query executes and results are displayed in <2 seconds (measured server response time)  

---

## Scenario 37: Case-Insensitive Search

**Given** I am on the inventory list page  
**When** I search for "API-PAYMENTS" (all caps)  
**Then** the list returns certificates matching "api-payments.bank.internal" (lowercase CN)  
**And** the search is case-insensitive  

---

## Scenario 38: Required Metadata on Import

**Given** I am importing a certificate  
**When** I omit the "Owner" field  
**Then** the system displays an error: "Owner is required"  
**And** the import is blocked until Owner is provided  

---

## Scenario 39: Valid Environment Values

**Given** I am assigning an environment to a certificate  
**When** I select or enter an environment value  
**Then** only "dev", "hml", "prd" are accepted  
**And** any other value is rejected with an error  

---

## Scenario 40: Export to JSON

**Given** I am on the inventory list page with applied filters  
**When** I click "Export to JSON"  
**Then** a JSON file is generated containing all filtered certificates as an array of objects  
**And** each object includes all metadata fields  
**And** the file is downloaded with timestamp in filename  

---

## Scenario 41: Search Does Not Match Partial Filters

**Given** I am on the inventory list page with search "api"  
**When** the search executes  
**Then** only exact substring matches are returned (not filtered by other active filters automatically)  
**And** results include any certificate with "api" in CN, SAN, serial, owner, etc.  

---

## Scenario 42: Large Import Rollback on Error

**Given** I am importing 200 certificates via CSV  
**And** row 150 contains invalid data  
**When** the import processes  
**Then** the system reports the error on row 150  
**And** the first 149 valid rows are still committed  
**And** row 150 and beyond are not imported  

---

## Scenario 43: Metadata Fields Not Editable Post-Import (Optional)

**Given** I have imported a certificate  
**When** I navigate to the detail page  
**Then** core PKI fields (CN, SAN, Serial, Issuer, Fingerprint) are read-only (parsed from cert)  
**And** organizational fields (Owner, Environment, Tags, Description) are editable  

---

## Scenario 44: Certificate Validity Display

**Given** I am viewing a certificate detail page  
**When** the page loads  
**Then** the notBefore date is displayed  
**And** the notAfter date is displayed  
**And** the "Days until expiration" is calculated and displayed  
**And** the expiration countdown is accurate (e.g., cert expires 2024-02-15 23:59 shows "2 dias" on 2024-02-13)  

---

## Scenario 45: Status Badge Color Coding

**Given** I am viewing the inventory list with multiple certificates  
**When** the list loads  
**Then** certificates with status badges are color-coded:
  - Green "Válido": valid, expiring in >30 days
  - Orange "Atenção": expiring in 7-30 days
  - Red "Crítico": expiring in <7 days or expired
  - Purple "Revogado": revoked status

---

## Scenario 46: Bulk Import File Type Validation

**Given** I am uploading a CSV file for bulk import  
**When** I select a file with extension other than .csv  
**Then** the system displays an error: "Only CSV files are supported"  
**And** the upload is blocked  

---

## Scenario 47: Empty Import File

**Given** I am importing a CSV file that is empty (no rows)  
**When** the import processes  
**Then** the system displays an error: "No valid rows found in file"  
**And** no records are created  

---

## Scenario 48: Certificate Metadata Field Accuracy

**Given** I have imported a PEM certificate  
**When** the import completes  
**Then** the stored CN matches the certificate's Subject CN exactly  
**And** all SANs are extracted correctly  
**And** the Serial Number is stored in hexadecimal format  
**And** the Fingerprint (SHA-256) matches independent verification tools  

---

## Scenario 49: Revoked Certificate Display

**Given** a certificate has been marked as revoked  
**When** I view the inventory list  
**Then** the certificate shows status "Revogado" with purple badge  
**And** it is included in the "Vencidos / Revogados" KPI count  

---

## Scenario 50: Pagination Boundary Test

**Given** the inventory contains exactly 450 certificates and page size is 50  
**When** I navigate to the last page (page 9)  
**Then** the last page displays all remaining 0 certificates (since 450/50 = 9 pages, 9th page has 0)  

---

## Notes

- All scenarios assume a successful authentication state (user is already logged in).
- All scenarios assume the base URL for the application is accessible.
- Date/time comparisons assume UTC or organization-consistent timezone.
- "Days until expiration" calculations must handle leap years and daylight saving time correctly.
- Performance assertions (<2 seconds) are measured as total end-to-end time (network + server processing + rendering).
