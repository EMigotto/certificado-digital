# Acceptance Criteria: C3. Monitoramento de Expiração e Alertas

**Feature**: C3. Certificate Expiration Monitoring and Alerts  
**Format**: Gherkin (Given/When/Then)  
**Scope**: MVP - Daily scheduler, multi-threshold alerts, email and webhook notifications, dashboard heatmap

---

## Functional Requirement 1: Daily Scheduler Job — Threshold Evaluation

**Requirement**: A cron job runs daily and evaluates all certificates to detect expiration within configurable thresholds (90, 30, 7, 1 days).

### Scenario 1.1: Scheduler triggers alerts for certificates expiring within 7 days (Positive)

```gherkin
Given the expiration monitoring scheduler is enabled
And the current time is 2026-05-29 00:00:00 UTC
And a certificate "api-payments.bank.internal" exists with:
  - status: "ACTIVE"
  - notAfter: 2026-06-05 14:32:00 UTC (7 days from now)
  - owner: "time-pagamentos"
  - zone: "bank-prd"
And a default ExpirationPolicy exists with thresholds enabled: [90, 30, 7, 1]
When the scheduler job runs at 2026-05-29 00:00:00 UTC
Then the job queries all certificates with status IN (ACTIVE, ISSUED) and notAfter > now
And for the certificate "api-payments.bank.internal":
  - daysUntilExpiry = 7
  - Evaluates threshold 90d: 7 <= 90 → TRUE, creates ExpirationAlert(threshold=90)
  - Evaluates threshold 30d: 7 <= 30 → TRUE, creates ExpirationAlert(threshold=30)
  - Evaluates threshold 7d: 7 <= 7 → TRUE, creates ExpirationAlert(threshold=7)
  - Evaluates threshold 1d: 7 <= 1 → FALSE, does not create alert
And three ExpirationAlert records are created with:
  - certificateId: cert-xxx
  - threshold: 90, 30, 7
  - triggeredAt: 2026-05-29 00:00:00 UTC
  - status: "PENDING"
  - owner: "time-pagamentos"
  - daysUntilExpiryAtAlert: 7
And the job completes within 60 seconds
```

### Scenario 1.2: Scheduler does not duplicate alerts for the same threshold (Negative)

```gherkin
Given the scheduler has already created an ExpirationAlert for certificate "api-payments.bank.internal" with threshold=7
And the threshold alert exists with:
  - threshold: 7
  - triggeredAt: 2026-05-28 00:00:00 UTC
  - status: "PENDING"
When the scheduler runs again on 2026-05-29 00:00:00 UTC
And the certificate still has daysUntilExpiry = 6 (one day closer)
Then the scheduler evaluates the threshold 7d: 6 <= 7 → TRUE
But the system checks for existing alert(certificateId, threshold=7)
And finds the existing alert from 2026-05-28
And does NOT create a duplicate alert
And the existing alert remains unchanged
```

### Scenario 1.3: Scheduler ignores certificates already expired or revoked (Negative)

```gherkin
Given a certificate "old-cert.internal" exists with:
  - status: "EXPIRED"
  - notAfter: 2026-05-20 00:00:00 UTC (already expired)
And another certificate "revoked-cert.internal" exists with:
  - status: "REVOKED"
  - revocationTimestamp: 2026-05-15 00:00:00 UTC
When the scheduler job runs
Then the query filters: status IN (ACTIVE, ISSUED)
And both "old-cert.internal" and "revoked-cert.internal" are excluded
And no alerts are created for expired or revoked certificates
```

### Scenario 1.4: Scheduler job fails and retries with exponential backoff (Negative)

```gherkin
Given the scheduler job is configured to run at 2026-05-29 00:00:00 UTC
And the database is temporarily unreachable at 00:00:00 UTC
When the scheduler attempts to run
Then it catches the connection error
And logs the error: "Failed to connect to database"
And retries at 00:05:00 UTC (5 minutes later)
And if failure persists, retries at 00:10:00 UTC, 00:20:00 UTC
And sends an alert to ops Slack channel:
  - "ALERT: Expiration scheduler failed to run. Last successful run: 2026-05-28 00:00:00 UTC. Action required."
And the system does not crash or leave alerts in a corrupt state
```

### Scenario 1.5: Scheduler processes 10,000+ certificates within SLA (Positive)

```gherkin
Given 10,000 active certificates exist in the database
And the scheduler job is configured with batch processing (1000 certs per batch)
When the scheduler runs
Then the job iterates through all 10,000 certificates in batches
And evaluates each certificate against all 4 thresholds
And creates alerts for those meeting the criteria
And completes execution within 300 seconds (5 minutes)
And logs: "Processed 10,000 certificates, created 142 alerts, duration: 45 seconds"
```

---

## Functional Requirement 2: Email Notification

**Requirement**: When an expiration alert is created, an email is sent to the certificate owner within 5 minutes.

### Scenario 2.1: Email sent to owner when alert is triggered (Positive)

```gherkin
Given an ExpirationAlert is created with:
  - certificateId: api-payments-cert
  - threshold: 7 days
  - owner: "time-pagamentos"
  - certificateCn: "api-payments.bank.internal"
  - daysUntilExpiryAtAlert: 7
And the certificate owner's email is configured as:
  - owner email: "devops@time-pagamentos.internal"
And the default ExpirationPolicy has emailEnabled=true
When the alert is created and email notification is triggered
Then an email is sent to "devops@time-pagamentos.internal" within 300 seconds
And the email contains:
  - Subject: "[ALERT] Certificate expiring in 7 days: api-payments.bank.internal"
  - Body includes:
    - Certificate CN: "api-payments.bank.internal"
    - Owner: "time-pagamentos"
    - Expires: "2026-06-05 14:32:00 UTC (in 7 days)"
    - CA: "Vault PKI (bank-prd)"
    - Zone: "bank-prd / production"
    - Action link: https://cipher.internal/certificates/{certId}
    - API renewal instruction: "POST /api/certificates/{certId}/renew"
And a NotificationRecord is created with:
  - alertId: alert-xxx
  - channel: "email"
  - sentAt: [current timestamp]
  - status: "SUCCESS"
And the email is valid MIME (both text and HTML parts)
```

### Scenario 2.2: Email includes additional recipients from policy (Positive)

```gherkin
Given an ExpirationAlert for "api-payments.bank.internal" is created
And the ExpirationPolicy for zone "bank-prd" includes:
  - emailEnabled: true
  - emailRecipientsAdditional: ["pki-ops@bank.internal", "ciso@bank.internal"]
And the certificate owner email is: "devops@time-pagamentos.internal"
When the email notification is triggered
Then the email is sent to:
  - TO: "devops@time-pagamentos.internal"
  - CC: "pki-ops@bank.internal", "ciso@bank.internal"
And all recipients receive the same email
```

### Scenario 2.3: Email delivery fails and retries (Negative)

```gherkin
Given SMTP is temporarily unavailable (port 25 connection timeout)
And an email notification is queued for sending
When the system attempts to send the email
Then it catches the SMTP connection error
And retries the send after 60 seconds
And if still failing, retries again at 120 seconds
And logs: "Failed to send email to devops@..., attempt 1/3, retrying in 60s"
And if all retries exhaust:
  - Creates a NotificationRecord with status: "FAILED"
  - error_message: "SMTP timeout after 3 attempts"
  - Alerts ops Slack: "Email notification failed for alert-xxx"
And the ExpirationAlert status remains "PENDING" (not NOTIFIED)
```

### Scenario 2.4: Email suppressed when policy disables email channel (Negative)

```gherkin
Given an ExpirationPolicy exists with emailEnabled: false
And a certificate "test-cert.internal" is in zone with this policy
And the certificate expiration alert is triggered with threshold=7
When the alert notification logic checks the policy
Then it sees emailEnabled: false
And does NOT send an email
And creates a NotificationRecord with channel: "email", status: "SKIPPED"
And logs: "Email notification skipped per policy for alert-xxx"
```

---

## Functional Requirement 3: Webhook Notification

**Requirement**: Expiration alerts are dispatched to configured webhook endpoints with retry logic.

### Scenario 3.1: Webhook payload sent to configured endpoint (Positive)

```gherkin
Given an ExpirationPolicy for zone "bank-prd" includes webhook:
  - url: "https://slack.example.com/webhook/C1234"
  - maxRetries: 3
  - timeout_seconds: 10
And an ExpirationAlert is created for "kafka-broker.bank.internal" with:
  - threshold: 7
  - daysUntilExpiry: 7
  - owner: "time-data"
When the webhook notification is triggered
Then an HTTP POST is sent to "https://slack.example.com/webhook/C1234" within 300 seconds
And the request includes JSON body:
  {
    "alert_id": "alert-xxx",
    "timestamp": "2026-05-29T14:32:00Z",
    "event": "certificate.expiration.alert",
    "threshold_days": 7,
    "certificate": {
      "id": "cert-yyy",
      "cn": "kafka-broker.bank.internal",
      "sans": [],
      "owner": "time-data",
      "zone": "bank-prd",
      "environment": "prd",
      "notAfter": "2026-06-05T14:32:00Z",
      "daysUntilExpiry": 7,
      "ca_name": "Vault PKI"
    },
    "action_url": "https://cipher.internal/certificates/cert-yyy"
  }
And the Content-Type is "application/json"
And the server responds with HTTP 200 within 10 seconds
And a NotificationRecord is created with:
  - channel: "webhook"
  - sentAt: [current timestamp]
  - status: "SUCCESS"
  - webhookId: webhook-xxx
  - attemptNumber: 1
```

### Scenario 3.2: Webhook request fails and retries with exponential backoff (Negative)

```gherkin
Given the webhook endpoint returns HTTP 500 (Server Error)
When the first POST attempt is made
Then the system logs the failure: "Webhook returned 500"
And schedules a retry after 1 second
And the retry attempt is executed at T+1s
And if the endpoint still returns 500:
  - Schedules second retry at T+5s (exponential backoff)
  - Schedules third retry at T+30s
And if all three attempts fail:
  - Creates NotificationRecord with status: "FAILED"
  - error_message: "HTTP 500 after 3 attempts"
  - Alerts ops: "Webhook delivery failed for alert-xxx to slack.example.com"
And the ExpirationAlert status remains "PENDING"
```

### Scenario 3.3: Webhook timeout after configured seconds (Negative)

```gherkin
Given the webhook endpoint is slow (takes 15 seconds to respond)
And the webhook is configured with timeout_seconds: 10
When the POST request is sent
Then the client waits up to 10 seconds
And after 10 seconds with no response, the request times out
And the failure is logged: "Webhook timeout (10s) for slack.example.com"
And the system retries per the retry policy (max 3 attempts)
And if all retries timeout:
  - Creates NotificationRecord with status: "FAILED"
  - error_message: "Timeout after 3 attempts"
```

### Scenario 3.4: Webhook skipped when disabled in policy (Negative)

```gherkin
Given an ExpirationPolicy with webhook configured but isActive: false
When an ExpirationAlert is created
Then the system checks the webhook's isActive flag
And sees it is disabled
And does NOT send the webhook request
And creates a NotificationRecord with status: "SKIPPED"
```

---

## Functional Requirement 4: Dashboard — KPIs and Heatmap

**Requirement**: Dashboard displays real-time certificate health metrics and 90-day expiration visualization.

### Scenario 4.1: KPI "Total Managed" displays accurate count (Positive)

```gherkin
Given the database contains:
  - 2,847 certificates with status IN (ACTIVE, ISSUED, PENDING)
  - 26 certificates with status = EXPIRED
  - 12 certificates with status = REVOKED
When the dashboard loads
And the KPI "Total Managed" is rendered
Then it displays the value "2,847"
And includes the trend: "+47 last 7d" (count increased by 47 in last 7 days)
And the top bar of the card is colored green (ok)
```

### Scenario 4.2: KPI "Valid" shows certificates not expired and not revoked (Positive)

```gherkin
Given 2,847 certificates with status IN (ACTIVE, ISSUED, PENDING)
And 38 certificates that are EXPIRED or REVOKED (not valid)
When the dashboard loads
Then the KPI "Valid" displays: "2,809"
And the calculation is: 2,847 - 38 = 2,809
And the percentage shown: "98.7% of inventory"
```

### Scenario 4.3: KPI "Expiring < 30 days" shows count in next 30-day window (Positive)

```gherkin
Given the current time is 2026-05-29 00:00:00 UTC
And the database contains certificates with these notAfter dates:
  - cert-a: 2026-06-15 (17 days, < 30) ✓
  - cert-b: 2026-06-25 (27 days, < 30) ✓
  - cert-c: 2026-07-05 (37 days, > 30) ✗
  - cert-d: 2026-06-05 (7 days, < 30) ✓
  - cert-e: 2026-05-20 (already expired) ✗
When the dashboard loads
Then the KPI "Expiring < 30 days" displays: "3"
And the condition is: notAfter BETWEEN NOW() AND NOW() + 30 days
And trend: "+5 vs. yesterday" (if 5 more certs entered the 30-day window today)
And the top bar is colored yellow (warn)
```

### Scenario 4.4: Heatmap displays color gradient by expiration count per day (Positive)

```gherkin
Given the current date is 2026-05-29
And certificates expiring in the next 90 days with these daily counts:
  - Day 1 (2026-05-30): 2 expirations → l1 (light green)
  - Day 2 (2026-05-31): 12 expirations → l2 (yellow)
  - Day 3 (2026-06-01): 25 expirations → l3 (orange)
  - Day 45 (2026-07-13): 55 expirations → l4 (light red)
  - Day 67 (2026-08-04): 120 expirations → l5 (bright red, glowing)
When the dashboard loads
Then the heatmap renders a 30x1 grid (actually 90 rows for 90 days, shown as cells)
And cell 0 (today) is empty (gray)
And cell 1 (day +1) is colored light green (l1)
And cell 2 is colored yellow (l2)
And cell 3 is colored orange (l3)
And cell 45 is colored light red (l4)
And cell 67 is colored bright red with glow (l5)
And each cell on hover displays tooltip: "15 certs expiring on June 2"
And the legend at the bottom shows: "Less [gray] [l1] [l2] [l3] [l4] [l5] More"
```

### Scenario 4.5: Critical alerts panel shows top 5 most urgent alerts (Positive)

```gherkin
Given ExpirationAlerts exist for these certificates:
  - cert-1: daysUntilExpiry = 2 (CRITICAL)
  - cert-2: daysUntilExpiry = 5 (CRITICAL)
  - cert-3: daysUntilExpiry = 12 (WARN)
  - cert-4: daysUntilExpiry = 18 (WARN)
  - cert-5: daysUntilExpiry = 26 (WARN)
  - cert-6: daysUntilExpiry = 45 (low)
When the dashboard loads
Then the "Alertas críticos" panel displays the top 5 most urgent (sorted by daysUntilExpiry ASC):
  1. api-payments.bank.internal [2d] (red badge)
  2. mtls-broker-kafka.bank.internal [5d] (red badge)
  3. gateway-edge.bank.internal [12d] (yellow badge)
  4. auth-svc.bank.internal [18d] (yellow badge)
  5. notification-worker.bank.internal [26d] (yellow badge)
And cert-6 is not shown (only top 5)
And if more than 5 alerts exist, a link is shown: "5 of X critical alerts"
And clicking an alert navigates to /certificates/{certId}
```

### Scenario 4.6: Dashboard auto-refreshes every 60 seconds (Positive)

```gherkin
Given the dashboard is open in browser
And the current time is 14:32:00 UTC
When 60 seconds elapse (14:33:00 UTC)
Then the dashboard automatically calls GET /api/dashboard/snapshot
And re-renders the KPIs, heatmap, and alerts without page reload
And shows a small "Last updated: 14:33:00" timestamp
And if the API call is slow (> 2 seconds), a loading spinner is shown
And if the API call fails, an error banner appears but the page does not crash
And the user can still interact with the page while the refresh is in progress
```

### Scenario 4.7: Dashboard query completes within SLA even with 10,000+ certificates (Positive)

```gherkin
Given 10,000 certificates exist in the database
When GET /api/dashboard/snapshot is called
Then the backend:
  - Counts valid certificates
  - Counts expirations in next 30 days
  - Groups expirations by day for heatmap
  - Fetches top 5 critical alerts
And returns the response within 2 seconds
And includes HTTP cache headers: Cache-Control: max-age=30
And the frontend renders the dashboard within 500ms of receiving the response
```

---

## Functional Requirement 5: Alert Deduplication and Idempotency

**Requirement**: The system ensures alerts are created once per certificate+threshold and handles duplicate requests safely.

### Scenario 5.1: Duplicate alert not created if threshold alert already exists (Negative)

```gherkin
Given an ExpirationAlert already exists for:
  - certificateId: cert-api-payments
  - threshold: 7
  - status: PENDING
  - createdAt: 2026-05-28 00:00:00 UTC
When the scheduler runs again on 2026-05-29 00:00:00 UTC
And the certificate still has daysUntilExpiry = 6 (within 7-day threshold)
Then the system queries: SELECT * FROM ExpirationAlert WHERE certificateId = cert-api-payments AND threshold = 7
And finds the existing alert
And does not create a duplicate
And the database maintains referential integrity (no duplicate key errors)
```

### Scenario 5.2: Scheduler can be run manually multiple times without duplicating alerts (Positive)

```gherkin
Given the expiration scheduler is triggered manually twice in quick succession:
  - First call at 14:32:00 UTC
  - Second call at 14:32:15 UTC
When both calls execute concurrently
Then the database uses UPSERT or mutex to prevent duplicates:
  - First call creates alerts for certificates meeting thresholds
  - Second call queries for existing alerts and skips creation if found
  - OR uses a transaction-level lock
And the final state has:
  - Each certificate + threshold combo: exactly 1 alert (not 2)
  - Both calls complete successfully
  - Audit logs show both executions but only one alert per cert+threshold
```

---

## Functional Requirement 6: Policy Configuration

**Requirement**: Administrators can create and manage expiration alert policies per zone.

### Scenario 6.1: Create policy with custom thresholds (Positive)

```gherkin
Given the user is a PKI Administrator
And navigates to /admin/policies/expiration
When they click "Create New Policy"
And fill the form:
  - Name: "bank-prd high-frequency"
  - Zone: "bank-prd"
  - Threshold 90d: enabled, channels: [email, webhook]
  - Threshold 30d: enabled, channels: [email]
  - Threshold 7d: enabled, channels: [email, webhook]
  - Threshold 1d: enabled, channels: [email]
  - Email recipients additional: ["pki-ops@bank.internal"]
  - Webhook URL: "https://slack.com/webhook/C123"
And clicks "Save"
Then the policy is created with status "ACTIVE"
And is stored in the ExpirationPolicy table
And the next alert evaluation uses this policy for zone "bank-prd"
And an audit log entry records: "User: admin-user, Action: CREATE_POLICY, Policy: bank-prd high-frequency"
```

### Scenario 6.2: Update policy and apply to existing pending alerts (Positive)

```gherkin
Given an ExpirationPolicy exists for zone "bank-prd" with emailEnabled: true
And several pending alerts exist from yesterday
When an administrator edits the policy:
  - Changes: emailEnabled from true to false
And clicks "Save"
Then the policy is updated
And the change applies to:
  - NEW alerts created from now on (email not sent)
  - Existing pending alerts: behavior depends on implementation
    - Option A: Respect original policy decision (email already sent or queued)
    - Option B: Re-evaluate and cancel email if not yet sent
And an audit log records the policy change
```

### Scenario 6.3: Set default policy for zone (Positive)

```gherkin
Given a policy "bank-prd standard" exists
When the administrator:
  - Opens policy details
  - Clicks "Set as Default for Zone: bank-prd"
Then the policy's isDefault flag is set to true
And all certificates in zone "bank-prd" without custom policy override use this policy
And if multiple policies claim to be default, the system enforces uniqueness via DB constraint
```

### Scenario 6.4: Delete policy and revert to global default (Negative)

```gherkin
Given a zone-specific policy "bank-prd permissive" exists with isDefault: false
And 50 certificates in zone "bank-prd" reference this policy
When an administrator deletes the policy
Then the policy record is soft-deleted (marked as inactive)
And certificates previously using this policy fall back to:
  - The global default policy (if one exists with zoneId = null)
  - OR no alert thresholds (all alerts suppressed)
And an audit log records: "User: admin-user, Action: DELETE_POLICY, Policy: bank-prd permissive"
```

---

## Acceptance Test: Certificate Expiring in 7 Days Triggers Alert Within 24 Hours (Critical SLA)

**Requirement (MVP)**: A certificate configured to expire in exactly 7 days must trigger an alert to the owner within 24 hours.

### Scenario: SLA Test — Alert delivery within 24 hours

```gherkin
Given a certificate is created with:
  - cn: "sla-test-cert.internal"
  - notAfter: 2026-05-29 00:00:00 UTC + 7 days = 2026-06-05 00:00:00 UTC
  - owner: "test-owner@bank.internal"
  - zone: "bank-prd"
  - status: "ACTIVE"
And the current time is 2026-05-29 14:30:00 UTC (7 days before expiration)
And the default ExpirationPolicy has threshold 7d enabled with channels: [email, webhook]
When the expiration scheduler job runs on 2026-05-29 (at any point during the day, say 00:00 or 15:00)
Then the job detects:
  - daysUntilExpiry = 7 (or 6.4 hours)
  - Evaluates threshold 7d: daysUntilExpiry <= 7 → TRUE
  - Creates ExpirationAlert with threshold=7
And the email notification is dispatched:
  - Email queued at: 2026-05-29 HH:MM:SS (within scheduler execution)
  - Email sent to test-owner@bank.internal within 5 minutes of alert creation
  - NotificationRecord status: "SUCCESS"
And verifies:
  - Alert creation time: 2026-05-29 HH:MM:SS
  - Email sent time: 2026-05-29 HH:MM:SS (< 5 minutes after alert)
  - Total time from scheduler run to email delivery: < 24 hours (actually < 5 minutes)
  - Assertion: PASSED (SLA MET)
```

---

## Summary of Scenarios

| Requirement | Scenario | Type | Coverage |
|---|---|---|---|
| 1. Scheduler | 1.1 Thresholds triggered | Positive | Core flow |
| 1. Scheduler | 1.2 No duplicates | Negative | Idempotency |
| 1. Scheduler | 1.3 Expired certs ignored | Negative | Edge case |
| 1. Scheduler | 1.4 Retry on failure | Negative | Resilience |
| 1. Scheduler | 1.5 Scale to 10k certs | Positive | Performance |
| 2. Email | 2.1 Email sent to owner | Positive | Core flow |
| 2. Email | 2.2 Additional recipients | Positive | Feature |
| 2. Email | 2.3 Retry on failure | Negative | Resilience |
| 2. Email | 2.4 Email suppressed | Negative | Configuration |
| 3. Webhook | 3.1 Webhook dispatched | Positive | Core flow |
| 3. Webhook | 3.2 Webhook retries | Negative | Resilience |
| 3. Webhook | 3.3 Webhook timeout | Negative | Resilience |
| 3. Webhook | 3.4 Webhook disabled | Negative | Configuration |
| 4. Dashboard | 4.1 KPI Total Managed | Positive | Accuracy |
| 4. Dashboard | 4.2 KPI Valid | Positive | Accuracy |
| 4. Dashboard | 4.3 KPI Expiring < 30d | Positive | Accuracy |
| 4. Dashboard | 4.4 Heatmap colors | Positive | Visualization |
| 4. Dashboard | 4.5 Critical alerts panel | Positive | Visualization |
| 4. Dashboard | 4.6 Auto-refresh | Positive | UX |
| 4. Dashboard | 4.7 Query SLA | Positive | Performance |
| 5. Dedup | 5.1 No duplicate alert | Negative | Data integrity |
| 5. Dedup | 5.2 Manual scheduler run safe | Positive | Idempotency |
| 6. Policy | 6.1 Create policy | Positive | Admin |
| 6. Policy | 6.2 Update policy | Positive | Admin |
| 6. Policy | 6.3 Set default policy | Positive | Admin |
| 6. Policy | 6.4 Delete policy | Negative | Admin |
| **SLA** | **7-day certificate alert within 24h** | **Positive** | **Critical** |

**Total**: 28 scenarios (21 positive, 7 negative)

---

## Test Data

For consistent testing across scenarios, use the following seed data:

```sql
-- Certificates for testing
INSERT INTO certificates (id, cn, status, notAfter, owner, zone, ca_id, created_by) VALUES
('cert-001', 'api-payments.bank.internal', 'ACTIVE', '2026-06-05 14:32:00', 'time-pagamentos', 'bank-prd', 'vault-prd', 'test-admin'),
('cert-002', 'kafka-broker.bank.internal', 'ACTIVE', '2026-06-05 14:32:00', 'time-data', 'bank-prd', 'vault-prd', 'test-admin'),
('cert-003', 'gateway-edge.bank.internal', 'ACTIVE', '2026-06-12 00:00:00', 'time-plataforma', 'bank-prd', 'vault-prd', 'test-admin'),
('cert-004', 'old-expired.internal', 'EXPIRED', '2026-05-20 00:00:00', 'time-old', 'bank-prd', 'vault-prd', 'test-admin'),
('cert-005', 'revoked-cert.internal', 'REVOKED', '2026-05-15 00:00:00', 'time-security', 'bank-prd', 'vault-prd', 'test-admin');

-- Default policy
INSERT INTO expiration_policies (id, name, zone_id, is_default, thresholds, email_enabled, created_by) VALUES
('policy-default', 'Global Standard', NULL, true, '{"90":{"enabled":true,"channels":["email","webhook"]},"30":{"enabled":true,"channels":["email","webhook"]},"7":{"enabled":true,"channels":["email"]},"1":{"enabled":true,"channels":["email"]}}', true, 'test-admin');
```
