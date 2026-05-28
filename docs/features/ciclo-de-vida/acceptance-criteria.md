# Acceptance Criteria: C2. Ciclo de Vida Basico (Issue / Renew / Revoke)

**Feature**: C2. Certificate Lifecycle Management  
**Format**: Gherkin (Given/When/Then)  
**Scope**: MVP - Issue, Renew (with key rotation), Revoke (RFC 5280)

---

## Functional Requirement 1: Issue Certificate — CSR Generation

**Requirement**: User can generate a CSR on-platform with private key stored, or upload external CSR.

### Scenario 1.1: Generate CSR on-platform and issue within 60 seconds (Positive)

```gherkin
Given the user is a PKI Administrator
And the user navigates to "Issue Certificate" page
When the user selects "Generate CSR" mode
And enters CN "api-payments.bank.internal"
And enters SANs "payments-v2, payments-canary"
And selects Algorithm "RSA 2048"
And selects CA "Vault PKI (bank-prd)"
And selects Owner "time-pagamentos"
And selects Zone "bank-prd / production"
And clicks "Submit to CA & Issue"
Then the system generates a CSR with a new private key
And the private key is stored securely (encrypted) in the database
And the CSR is submitted to Vault PKI REST API endpoint
And the UI shows a spinner ("Submitting to CA...")
And within 60 seconds, the CA responds with an issued certificate
And the certificate status transitions to "ISSUED"
And the user is redirected to the certificate detail page
And the detail page shows:
  - CN: "api-payments.bank.internal"
  - Status: "ISSUED" (green badge)
  - Serial Number (from CA)
  - Fingerprint (SHA256)
  - Algorithm: "RSA 2048"
  - notBefore and notAfter dates
  - Owner: "time-pagamentos"
  - Zone: "bank-prd / production"
And an audit log entry is created with:
  - Action: "CREATED"
  - Actor: current user ID
  - Timestamp: now
  - Result: "SUCCESS"
  - Details: { ca: "Vault PKI", algorithm: "RSA2048", cn: "api-payments.bank.internal" }
```

### Scenario 1.2: Upload external CSR and issue (Positive)

```gherkin
Given the user is a PKI Administrator
And the user navigates to "Issue Certificate" page
When the user selects "Upload CSR" mode
And uploads a PEM file containing a valid CSR
And the CSR contains CN "gateway.internal" and SANs "gateway-v1, gateway-v2"
Then the system parses the CSR
And extracts and displays:
  - CN: "gateway.internal"
  - SANs: ["gateway-v1", "gateway-v2"]
  - Algorithm: "ECDSA P-256" (detected from CSR)
And the user confirms the extracted fields
And fills Owner "time-infra", Zone "bank-hml"
And clicks "Submit to CA & Issue"
Then the CSR is sent to the selected CA
And within 60 seconds, certificate is issued
And status transitions to "ISSUED"
And an audit log entry shows:
  - Action: "CREATED"
  - Details: { csr_source: "upload", ... }
```

### Scenario 1.3: CSR validation rejects invalid CN format (Negative)

```gherkin
Given the user is generating a CSR
When the user enters CN "not-a-valid-fqdn-!!!"
And the user tries to submit
Then the form shows inline validation error:
  - "CN must be a valid FQDN (e.g. api.internal)"
And the "Submit" button is disabled
And no CSR is generated
```

### Scenario 1.4: Duplicate CN in same zone is rejected (Negative)

```gherkin
Given a certificate with CN "api-payments.bank.internal" already exists in zone "bank-prd"
When a user tries to issue a new certificate with the same CN and zone
Then the system validates and rejects with error:
  - "A certificate with CN 'api-payments.bank.internal' already exists in zone 'bank-prd'. Renew instead of reissuing."
And no CSR is generated
And an audit log entry shows:
  - Action: "CREATED"
  - Result: "FAILURE"
  - Error: "duplicate_cn_in_zone"
```

### Scenario 1.5: CA connectivity failure (Negative)

```gherkin
Given the user submits a CSR to "Vault PKI"
And Vault PKI is unreachable (timeout)
Then after 5 seconds, the system shows error:
  - "Failed to reach CA (Vault PKI). Please try again."
And the certificate status remains "PENDING"
And the user can retry submission
And an audit log entry shows:
  - Action: "CREATED"
  - Result: "FAILURE"
  - Error: "ca_timeout"
```

---

## Functional Requirement 2: Issue Certificate — Validation & Checks

**Requirement**: System performs pre-submission validation (CN format, duplicates, CA health, authorization).

### Scenario 2.1: Live validation feedback on form (Positive)

```gherkin
Given the user is on the "Issue Certificate" form
When the user enters CN "api-payments.bank.internal"
Then within 300ms, a checkmark appears:
  - "CN format: Valid FQDN"
When the system checks for duplicates in selected zone
Then it shows:
  - "Duplicate check: No existing cert found"
When the system performs a health check on selected CA
Then it shows:
  - "CA connectivity: OK (Vault PKI)"
And the "Submit" button is enabled (all checks passed)
```

### Scenario 2.2: Authorization check (Negative)

```gherkin
Given the user is a Platform Engineer (not PKI Admin)
And the user selects Owner "security-team" (different from their team)
When the user tries to submit
Then the system checks authorization
And shows error:
  - "You are not authorized to issue certificates for 'security-team'. Contact PKI Admin."
And the "Submit" button remains disabled
```

---

## Functional Requirement 3: Renew Certificate — Manual Renewal with Key Rotation

**Requirement**: User can manually renew a certificate with option to rotate the private key.

### Scenario 3.1: Renew with key rotation within 60 seconds (Positive)

```gherkin
Given a certificate "api-payments.bank.internal" with:
  - Status: "ACTIVE"
  - Days until expiry: 12 days
And the user is the owner (time-pagamentos)
When the user navigates to the certificate detail page
Then a "Renew" button is visible
When the user clicks "Renew"
Then a modal appears with two options:
  - "Renew with Same Key (Faster)" — reuse existing private key
  - "Renew with New Key (Recommended)" — rotate private key
When the user selects "Renew with New Key"
And clicks "Continue"
Then a renewal form appears with:
  - Current certificate details (read-only)
  - "New Validity Period (days)" field: defaults to 365
  - "Key Rotation Notification" textarea
  - "Notify owner?" checkbox: checked by default
And the user confirms and clicks "Submit Renewal to CA"
Then the system:
  - Generates a new private key
  - Generates a new CSR with the new key
  - Submits CSR to the original CA (Vault PKI)
  - Shows spinner ("Submitting renewal to CA...")
And within 60 seconds, CA responds with new certificate
And the new certificate:
  - Has status "ISSUED"
  - Is linked to old certificate via renewal_parent_id field
  - Is displayed on detail page alongside old cert
And the old certificate:
  - Remains "ACTIVE"
  - Shows "Renewal pending" label
And an email is sent to owner "time-pagamentos" with:
  - Old certificate CN
  - New certificate fingerprint and thumbprint
  - Key rotation advisory
  - Deadline to redeploy
And audit log entries are created:
  - Action: "RENEWED"
  - Details: { rotate_key: true, old_cert_id: "...", new_cert_id: "..." }
  - And: { action: "NOTIFICATION_SENT", recipient: "time-pagamentos" }
```

### Scenario 3.2: Renew with same key (faster option) (Positive)

```gherkin
Given a certificate that needs renewal
When the user selects "Renew with Same Key"
And clicks "Continue"
Then the renewal form shows:
  - "Reusing existing private key — CSR will be generated automatically"
  - No new key is generated
And the user clicks "Submit Renewal to CA"
Then the system:
  - Extracts the existing private key
  - Generates a new CSR with the same key
  - Submits to CA
  - Shows spinner
And within 60 seconds, new certificate is issued
And NO notification email is sent (same key, no deployment needed)
And audit log shows:
  - Action: "RENEWED"
  - Details: { rotate_key: false }
```

### Scenario 3.3: Renewal is rejected if cert not expiring soon enough (Negative)

```gherkin
Given a certificate with:
  - Status: "ACTIVE"
  - Days until expiry: 120 days
When the user navigates to certificate detail
Then the "Renew" button is disabled
And a tooltip explains:
  - "Renewal available when < 30 days until expiry. Current: 120 days."
And no renewal can be initiated
```

### Scenario 3.4: Renewal can be initiated earlier for planning (Positive)

```gherkin
Given a certificate with 45 days until expiry
And the user is a PKI Administrator (elevated permissions)
When the user clicks "Renew" button
Then renewal is allowed (admin override)
And a note appears:
  - "Early renewal — new cert will not be used until old cert expires or is revoked"
And renewal proceeds normally
```

### Scenario 3.5: Old and new certificates are tracked (Positive)

```gherkin
Given a certificate "api-payments.bank.internal" has been renewed
When the user views the old certificate detail page
Then it shows:
  - Status: "ACTIVE" (still valid)
  - Badge: "Renewal pending" (blue)
  - Link: "Renewed to: [new cert ID/CN]"
When the user views the new certificate detail page
Then it shows:
  - Status: "ISSUED" (ready for deployment)
  - Link: "Renewal of: [old cert ID/CN]"
And the audit log for the old cert shows:
  - Renewal action with new cert ID reference
```

---

## Functional Requirement 4: Revoke Certificate — RFC 5280 Reason Codes

**Requirement**: User can revoke a certificate with RFC 5280 reason code and optional justification.

### Scenario 4.1: Revoke with keyCompromise reason within 30 seconds (Positive)

```gherkin
Given a certificate "auth-svc.bank.internal" with:
  - Status: "ACTIVE"
  - Owner: "time-iam"
And the user is a PKI Administrator
When the user navigates to certificate detail
Then a "Revoke" button is visible
When the user clicks "Revoke"
Then a revocation modal appears with:
  - Red warning: "This action is irreversible. The certificate will be added to CRL."
  - "Revocation Reason (RFC 5280)" dropdown with options:
    * keyCompromise
    * cACompromise
    * affiliationChanged
    * superseded
    * cessationOfOperation
    * certificateHold
    * unspecified
  - "Revocation Justification" textarea
  - "Notify owner?" checkbox: checked by default
  - "Confirm Revocation" button (red, disabled initially)
When the user selects "keyCompromise" from dropdown
And enters justification: "Private key exposed in code repo commit"
And checks "Notify owner?" (already checked)
And clicks "Confirm Revocation"
Then the system:
  - Submits revocation request to CA (Vault PKI) with reason code "keyCompromise"
  - Shows spinner ("Submitting revocation to CA...")
And within 30 seconds, CA confirms revocation
And the certificate:
  - Status transitions to "REVOKED"
  - Badge shows "REVOKED" (purple)
  - revocation_timestamp is set to now
  - revocation_reason is set to "keyCompromise"
  - revocation_justification is set to justification text
  - revokedBy is set to current user ID
And the detail page shows:
  - "Revoked on: 2026-05-28 14:32:08 UTC"
  - "Reason: Key Compromise"
  - "Justification: Private key exposed..."
  - "Revoked by: username"
And an email is sent to owner "time-iam" with:
  - Certificate CN
  - Revocation reason
  - Revocation timestamp
  - Justification text
And an audit log entry is created:
  - Action: "REVOKED"
  - Actor: current user ID
  - Details: { reason_code: "keyCompromise", justification: "..." }
  - Result: "SUCCESS"
```

### Scenario 4.2: Revoke with superseded reason (Positive)

```gherkin
Given two certificates:
  - Old: "api-gateway.internal" (ACTIVE, expiring soon)
  - New: "api-gateway.internal" (ISSUED, renewed)
When the user revokes the old certificate
And selects reason "superseded"
And enters justification: "Replaced by renewal [new_cert_id]"
Then revocation is submitted with reason_code "superseded"
And the revocation_justification is stored
And audit log shows:
  - Reason: "superseded"
  - Reference to new cert is captured
```

### Scenario 4.3: Revocation fails if CA unreachable (Negative)

```gherkin
Given a certificate ready to revoke
And Vault PKI is unreachable
When the user submits revocation
Then after 5 seconds, error is shown:
  - "Failed to reach CA. Revocation request could not be submitted. Please try again."
And the certificate status remains "ACTIVE" (revocation not applied locally)
And an audit log entry shows:
  - Action: "REVOKED"
  - Result: "FAILURE"
  - Error: "ca_unreachable"
```

### Scenario 4.4: Revoke notification can be suppressed (Positive)

```gherkin
Given a certificate ready to revoke
When the user initiates revocation
And unchecks "Notify owner?" checkbox
And submits revocation
Then revocation is processed normally
But NO email is sent to owner
And audit log shows:
  - notify_owner: false
```

### Scenario 4.5: Revoked certificate cannot be used (Negative)

```gherkin
Given a certificate that has been revoked
When a service tries to use the certificate in mTLS
Then the CA (via CRL or OCSP) rejects it
And the mTLS connection fails
And the service receives error: "certificate revoked"
```

---

## Functional Requirement 5: Lifecycle Status & Transitions

**Requirement**: Certificate status is accurate and transitions correctly through lifecycle states.

### Scenario 5.1: Status transitions during issue (Positive)

```gherkin
Given the user initiates certificate issuance
When the user submits CSR to CA
Then certificate status is "PENDING"
When the CA responds (within 60s)
Then certificate status transitions to "ISSUED"
And certificate remains in "ISSUED" state until deployed or expiry
```

### Scenario 5.2: Status transitions during renewal (Positive)

```gherkin
Given an active certificate with status "ACTIVE"
When renewal is initiated and CSR submitted
Then new certificate status is "PENDING" (awaiting CA)
And old certificate status remains "ACTIVE" (still in use)
When CA responds with new certificate
Then new certificate status is "ISSUED"
And old certificate is marked with "renewal_pending" flag (visually)
When service team redeploys and switches to new cert
Then old certificate is explicitly revoked by admin
And old cert status becomes "REVOKED"
```

### Scenario 5.3: Expired certificate detection (Positive)

```gherkin
Given a certificate with notAfter date = 2026-05-28T00:00:00Z
And current time = 2026-05-29T10:00:00Z (after expiry)
When the system fetches certificate metadata
Then certificate status is automatically computed as "EXPIRED"
And the detail page shows:
  - Status badge: "EXPIRED" (red)
  - "Expired on: 2026-05-28"
And the certificate appears in "Vencidos" (expired) filter on inventory
```

### Scenario 5.4: Expiring soon warning (Positive)

```gherkin
Given a certificate with:
  - notAfter = 2026-06-07 (12 days from now)
  - Status: "ACTIVE"
When the system computes daysUntilExpiry
And daysUntilExpiry < 30
Then certificate status is set to "EXPIRING_SOON"
And the detail page shows:
  - Status badge: "EXPIRING SOON" (yellow/warn)
  - "Expires in: 12 days"
  - "Renew" button is enabled
And the inventory list filters include "< 30 days until expiry"
```

---

## Functional Requirement 6: Audit Logging

**Requirement**: All lifecycle actions are logged immutably with actor, timestamp, action, result, and reason.

### Scenario 6.1: Audit log entries for issue (Positive)

```gherkin
Given a certificate has been issued
When the user views the audit log
Then the log shows:
  - Timestamp: 2026-05-28T14:32:08Z
  - Actor: username (user who initiated)
  - Action: "CREATED"
  - Result: "SUCCESS"
  - Details (JSON):
    {
      "ca": "Vault PKI",
      "cn": "api-payments.bank.internal",
      "algorithm": "RSA2048",
      "validity_days": 365
    }
And the entry is immutable (cannot be deleted or modified)
```

### Scenario 6.2: Audit log entries for renewal (Positive)

```gherkin
Given a certificate has been renewed
When the user views the audit log
Then the log shows entries:
  - Action: "RENEWED"
    Details: { old_cert_id, new_cert_id, rotate_key: true, ... }
  - Action: "NOTIFICATION_SENT"
    Details: { recipient: "time-pagamentos", subject: "...", timestamp: ... }
And audit log can be filtered by action type
And can be exported as CSV/JSON for compliance
```

### Scenario 6.3: Audit log entries for revocation (Positive)

```gherkin
Given a certificate has been revoked
When the user views the audit log
Then the log shows:
  - Action: "REVOKED"
  - Actor: PKI admin username
  - Result: "SUCCESS"
  - Details:
    {
      "reason_code": "keyCompromise",
      "justification": "Private key exposed...",
      "notify_owner": true
    }
And the revocation timestamp is immutable
```

### Scenario 6.4: Audit log shows failures (Positive)

```gherkin
Given a certificate issuance fails (CA error)
When the user checks audit log
Then the log shows:
  - Action: "CREATED"
  - Result: "FAILURE"
  - Error: "ca_error_invalid_csr"
  - ErrorMessage: "CSR parsing failed at CA: [detail from CA]"
And the user can retry or troubleshoot from the detail
```

---

## Functional Requirement 7: API Endpoints

**Requirement**: All lifecycle operations are available via REST API.

### Scenario 7.1: Issue via API (Positive)

```gherkin
Given a client with valid API authentication
When the client sends:
  POST /api/certificates/issue
  {
    "cn": "service.internal",
    "sans": ["service-v2"],
    "ca_id": "vault-prd",
    "algorithm": "RSA2048",
    "validity_days": 365,
    "owner": "time-infra",
    "zone": "bank-prd"
  }
Then the API responds (status 201):
  {
    "id": "cert_abc123",
    "cn": "service.internal",
    "status": "PENDING",
    "created_at": "2026-05-28T14:32:08Z",
    "ca_id": "vault-prd"
  }
When the client polls:
  GET /api/certificates/cert_abc123
Then status field updates:
  "status": "ISSUED" (within 60s)
And the response includes full certificate metadata
```

### Scenario 7.2: Renew via API (Positive)

```gherkin
Given a certificate ID
When the client sends:
  POST /api/certificates/cert_xyz/renew
  {
    "rotate_key": true,
    "validity_days": 365
  }
Then the API responds (status 200):
  {
    "old_id": "cert_xyz",
    "new_id": "cert_new_123",
    "new_status": "PENDING",
    "notification_sent": true
  }
And polling GET /api/certificates/cert_new_123 shows status "ISSUED" within 60s
```

### Scenario 7.3: Revoke via API (Positive)

```gherkin
Given a certificate ID
When the client sends:
  POST /api/certificates/cert_xyz/revoke
  {
    "reason": "superseded",
    "comment": "Replaced by cert_new_123",
    "notify_owner": true
  }
Then the API responds (status 200):
  {
    "id": "cert_xyz",
    "status": "REVOKED",
    "revocation_timestamp": "2026-05-28T14:32:08Z",
    "revocation_reason": "superseded"
  }
```

### Scenario 7.4: API error handling (Negative)

```gherkin
Given invalid request (missing required field)
When the client sends:
  POST /api/certificates/issue
  { "cn": "test.internal" }  # missing ca_id, owner, zone
Then the API responds (status 400):
  {
    "error": "validation_error",
    "details": [
      { "field": "ca_id", "message": "required" },
      { "field": "owner", "message": "required" },
      { "field": "zone", "message": "required" }
    ]
  }
```

---

## Summary

All scenarios cover:
- **Positive paths**: Happy path with success
- **Negative paths**: Invalid input, missing authorization, CA errors, state violations
- **Edge cases**: Early renewal, same-key renewal, notification suppression
- **Audit & compliance**: Immutable logs, reason codes, actor tracking
- **API & UI parity**: Both UI and API support all lifecycle operations

Acceptance achieved when all scenarios pass and latency requirements are met (< 60s for issue/renew, < 30s for revoke).
