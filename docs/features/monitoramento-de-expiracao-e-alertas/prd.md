# PRD: C3. Monitoramento de Expiração e Alertas

**Feature ID**: C3  
**Slug**: monitoramento-de-expiracao-e-alertas  
**Status**: Specification  
**Created**: 2026-05-29  
**Target Release**: MVP (Phase 1)  

---

## Problem Statement

Organizations managing mTLS certificates must **detect and prevent certificate expiration incidents**. Today:

- Certificate expirations are reactive; teams discover expired certs only when services break
- No centralized visibility into expiration timelines across 1000+ certificates
- Expiration notifications (if any) arrive too late or are missed entirely
- No configurable alert thresholds; one-size-fits-all approach
- Multiple communication channels (email, webhooks) not coordinated or tracked
- No historical data on expiration trends or alert effectiveness
- Compliance risk: auditors cannot verify that "no cert expires unannounced"

**Impact**: Operational incidents (service downtime), security gaps (inability to rotate keys before expiration), compliance failures.

---

## Users & Jobs to Be Done (JTBD)

### User Personas

1. **PKI Administrator**
   - Role: Monitors certificate inventory; sets expiration policies and alert thresholds per zone
   - Job: Know at a glance which certificates are at risk; trigger renewals proactively
   - Tools: Dashboard, email alerts, admin console

2. **Platform Engineer / DevOps**
   - Role: Owns service deployments; responsible for certificate renewal coordination
   - Job: Receive timely alerts (30, 7, 1 day before) so they can plan and deploy renewals
   - Tools: Email, Slack, webhook integrations, CI/CD

3. **Security Officer**
   - Role: Ensures compliance and audit trail of certificate lifecycle
   - Job: Verify that alerting system is working; audit which teams were notified and when
   - Tools: Audit logs, reports, compliance dashboards

4. **Team Lead / Service Owner**
   - Role: Owns specific services or zones; delegates certificate renewal to engineers
   - Job: Know which certs in their domain are expiring; coordinate renewal within team
   - Tools: Email, dashboard, alerts

### Jobs to Be Done

| User | JTBD |
|------|------|
| PKI Admin | **Define expiration thresholds** (90, 30, 7, 1 days) per policy/zone, overridable per certificate |
| PKI Admin | **View certificate expiration heatmap** for next 90 days; identify concentration peaks |
| PKI Admin | **Enable/disable notification channels** (email, webhook) per threshold or globally |
| Platform Engineer | **Receive alert notification within 24 hours** when cert is configured for expiration in 7 days |
| Platform Engineer | **Know which team owns** the expiring certificate and contact info |
| Operator | **Trigger renewal** from alert link or API after receiving notification |
| Security Officer | **Audit alert history**: which certs triggered alerts, when, to whom, which channels |
| Service Owner | **Query API** for certificates expiring in next N days; integrate with internal tools |

---

## Functional Scope

### 1. Expiration Monitoring — Daily Scheduler Job

**Requirement**: A recurring job evaluates all certificates in the inventory daily to detect expirations approaching within configurable thresholds.

#### 1.1 Scheduler Configuration

- **Trigger**: Cron job scheduled daily at 00:00 UTC (configurable)
- **Scope**: Query all certificates in the database with `status IN (ACTIVE, ISSUED)` and `notAfter > now`
- **Idempotency**: Safe to run multiple times in the same day; alerts are not duplicated
- **Timeout**: Job must complete within 5 minutes (even for 10,000+ certificates)
- **Error Handling**: If job fails, alert via system channel (Slack/ops); retry hourly until success

#### 1.2 Threshold Evaluation

For each certificate, evaluate against multiple configurable thresholds:

```
daysUntilExpiry = (certificate.notAfter - now).days

Check thresholds (default, per-policy overridable):
- 90 days: ALERT_WINDOW_90D → trigger alert if daysUntilExpiry <= 90 AND not alerted yet
- 30 days: ALERT_WINDOW_30D → trigger alert if daysUntilExpiry <= 30 AND not alerted yet
- 7 days:  ALERT_WINDOW_7D  → trigger alert if daysUntilExpiry <= 7 AND not alerted yet
- 1 day:   ALERT_WINDOW_1D  → trigger alert if daysUntilExpiry <= 1 AND not alerted yet
```

Each threshold triggers **once** per certificate; subsequent days do not re-trigger for the same threshold.

#### 1.3 Alert Record Creation

When a threshold is breached:
- Create an `ExpirationAlert` database record with:
  - `certificateId`, `threshold` (90 | 30 | 7 | 1), `triggeredAt`, `status: PENDING`
  - `notificationsSent: []` (tracks channels and timestamps)
- Link to the certificate's `owner` and `zone`
- Store certificate snapshot at alert time: CN, SANs, daysUntilExpiry, caName

#### 1.4 Alert Deduplication

- If an alert already exists for this certificate + threshold, skip creation
- Alerts are immutable once created; only `status` and `notificationsSent` are mutable

### 2. Alert Notification — Multi-Channel Dispatcher

**Requirement**: Route expiration alerts to multiple channels (email, webhooks) based on policy and certificate owner.

#### 2.1 Email Notification (MVP Mandatory)

**When**: Immediately after alert is created (within job execution) or asynchronously within 5 minutes.

**To**: Certificate owner email(s) and team email(s) from the `owner` field; configurable per policy.

**Email Template** (plain text + HTML):
```
Subject: [ALERT] Certificate expiring in 7 days: api-payments.bank.internal

---

Certificate: api-payments.bank.internal
Owner: time-pagamentos
Expires: 2026-06-05 14:32:00 UTC (in 7 days)
CA: Vault PKI (bank-prd)
Zone: bank-prd / production

ACTION REQUIRED:
Renew this certificate within the next 7 days to avoid service downtime.
Dashboard: https://cipher.internal/certificates/{certId}
API: POST /api/certificates/{certId}/renew

---

This alert was triggered by the automated expiration monitor.
Questions? Contact: pki-ops@bank.internal
```

**Configuration**:
- SMTP host, port, credentials stored securely in env vars
- Email subject prefix customizable per environment
- Sender address: no-reply@cipher.internal (configurable)

#### 2.2 Webhook Notification (MVP Required but Optional per Policy)

**When**: Immediately after alert is created (async, with retry logic).

**Where**: Generic HTTP POST to webhook URL(s) configured per owner/zone/policy.

**Payload** (JSON):
```json
{
  "alert_id": "alert-xxx",
  "timestamp": "2026-05-29T14:32:00Z",
  "event": "certificate.expiration.alert",
  "threshold_days": 7,
  "certificate": {
    "id": "cert-xxx",
    "cn": "api-payments.bank.internal",
    "sans": ["payments-v2", "payments-canary"],
    "owner": "time-pagamentos",
    "zone": "bank-prd",
    "environment": "prd",
    "notAfter": "2026-06-05T14:32:00Z",
    "daysUntilExpiry": 7,
    "ca_name": "Vault PKI",
    "serial": "03:AB:CD:EF"
  },
  "action_url": "https://cipher.internal/certificates/{certId}"
}
```

**Retry Policy**:
- Up to 3 retry attempts on 4xx/5xx responses or timeout
- Exponential backoff: 1s, 5s, 30s
- Log failures; alert ops if all retries fail
- Mark webhook as failed in audit log

#### 2.3 Alert History & Notification Tracking

For each alert, track:
- `ExpirationAlert.notificationsSent[]`: array of { channel: "email"|"webhook", sentAt, status: "SUCCESS"|"FAILED", error }
- Immutable audit log entry for each notification attempt

### 3. Dashboard — Expiration Heatmap & KPIs

**Requirement**: Landing page shows at-a-glance certificate health and expiration timeline.

**Location**: `/` (home) and `/dashboard`; auto-refreshes every 60 seconds (configurable).

#### 3.1 Key Performance Indicators (KPIs)

Four cards (top of dashboard):

| KPI | Metric | Calculation | Color |
|-----|--------|-------------|-------|
| **Total Managed** | Count of all certs with status IN (ACTIVE, ISSUED, PENDING) | `SELECT COUNT(*) FROM certificates WHERE status IN (...)` | Green (ok) |
| **Valid** | Count of certificates not expired and not revoked | `... WHERE status IN (...) AND notAfter > NOW()` | Gray |
| **Expiring < 30 Days** | Count of certificates expiring in next 30 days | `... WHERE notAfter BETWEEN NOW() AND NOW() + 30d` | Yellow (warn) |
| **Expired / Revoked** | Count of certificates with status EXPIRED or REVOKED | `... WHERE status IN (EXPIRED, REVOKED)` | Red (crit) |

Each card shows:
- Value (large serif font)
- Trend: `+X since yesterday` (delta) or `vs. 7d ago`

#### 3.2 Expiration Heatmap

**Visual**: 30x1 grid where each cell represents 1 day in the next 90 days.

**Cell Color Intensity**:
- Empty (gray): 0 expirations
- Light green (l1): 1-5 expirations
- Yellow (l2): 6-15 expirations
- Orange (l3): 16-30 expirations
- Red (l4): 31-60 expirations
- Bright red (l5): 60+ expirations

**Cell Interactivity**:
- Hover: show count of certs expiring that day
- Click: filter certificate list to show only certs expiring on that day
- Tooltip: "15 certs expiring +45d from today"

**Axes**:
- X-axis labels: "Today", "+30d", "+60d", "+90d"
- Right of grid: legend showing intensity scale

#### 3.3 Critical Alerts Panel

**Location**: Right side of heatmap (2-column layout: 2fr left heatmap, 1fr right alerts).

**Content**: Top 5 most urgent alerts (sorted by `daysUntilExpiry` ascending).

**Alert Item**:
```
[RED LINE] api-payments.bank.internal                    2d
           prd · Vault PKI · owner: time-pagamentos
```

Display:
- CN (truncated with ellipsis if long)
- Owner, CA, environment (meta line)
- Days until expiry (bold, right-aligned, colored red/yellow per severity)
- Click to navigate to certificate detail page

**Counts**: If > 5 alerts, show "5 of 23 critical alerts" with link to full list.

#### 3.4 Auto-Refresh

- Every 60 seconds, refresh KPIs, heatmap, and alerts without page reload
- Use WebSocket or polling (Axios GET /api/dashboard/snapshot)
- Show "Last updated: HH:MM:SS" timestamp
- Graceful degradation if API is slow (show spinner, don't block)

### 4. Alert Configuration & Policy Management

**Requirement**: PKI Administrators can define expiration alert policies per zone or globally.

#### 4.1 Policy Model

```
ExpirationPolicy {
  id: string
  name: string                          // "bank-prd standard", "dev permissive"
  zone_id?: string                      // if null, applies globally
  is_default: boolean
  
  thresholds: {
    days_90: { enabled: true, channels: ["email", "webhook"] }
    days_30: { enabled: true, channels: ["email", "webhook"] }
    days_7:  { enabled: true, channels: ["email"] }
    days_1:  { enabled: true, channels: ["email", "webhook"] }
  }
  
  email: {
    enabled: boolean
    recipients_additional: string[]     // in addition to certificate owner
    subject_prefix: string              // "[ALERT]" default
  }
  
  webhooks: ExpirationWebhook[]
  
  created_at: DateTime
  created_by: string
  updated_at: DateTime
  updated_by: string
}

ExpirationWebhook {
  id: string
  url: string                           // https://slack.com/webhook or similar
  headers: Record<string, string>       // optional custom headers
  retry_strategy: "exponential" | "linear"
  max_retries: int
  timeout_seconds: int
  is_active: boolean
}
```

#### 4.2 Policy API

```
GET /api/policies/expiration                  # list all policies
POST /api/policies/expiration                 # create new policy
GET /api/policies/expiration/{id}             # get details
PUT /api/policies/expiration/{id}             # update
DELETE /api/policies/expiration/{id}          # delete (soft delete)
GET /api/zones/{zone_id}/policies/expiration  # get zone-specific policy
```

#### 4.3 Certificate-Level Overrides

A certificate can override the default policy for its zone:

```
Certificate {
  ...
  expiration_policy_id?: string         # null = use zone default
  custom_alert_thresholds?: {
    days_90: boolean
    days_30: boolean
    days_7:  boolean
    days_1:  boolean
  }
}
```

### 5. Acceptance Criterion: Alert Delivery SLA

**Requirement (MVP)**: A certificate configured to expire in 7 days shall trigger an alert to the owner within 24 hours.

**Details**:
- `daysUntilExpiry == 7` at job execution time
- Alert record created within 1 minute of job run
- Email sent within 5 minutes of alert creation
- Webhook delivery attempted within 5 minutes (with retries)
- Delivery confirmed in audit log

**Measurement**:
- Alert creation timestamp vs. job start: < 1 min
- Email sent timestamp vs. alert creation: < 5 min
- First webhook attempt vs. alert creation: < 5 min

---

## Out of Scope

- **Automated renewal scheduling**: Alerts notify but do not automatically renew (user/CI-CD triggers)
- **Smart threshold calculation**: Thresholds are fixed numbers (90, 30, 7, 1); no ML-based prediction
- **Custom alert conditions**: Only expiration-based; not status changes or policy violations
- **SMS/Text alerting**: Email and webhooks only in MVP
- **Alert suppression rules**: No snooze or "ignore for N days"
- **Certificate grouping**: No alert aggregation by application or team (individual certs)
- **Integration with ticketing systems**: Webhooks can POST to Jira/ServiceNow, but no native integration
- **Alert dead-letter queue**: Failed notifications are logged but not manually retried

---

## Acceptance Criteria

See `acceptance-criteria.md` for detailed Gherkin scenarios covering:
- Daily scheduler job execution and threshold evaluation
- Email notification delivery and retry
- Webhook notification dispatch and error handling
- Dashboard KPI accuracy and heatmap generation
- Alert deduplication and idempotency
- Policy configuration and certificate overrides
- Positive and negative scenarios for each

---

## Database Schema (Prisma Model)

```prisma
model ExpirationAlert {
  id String @id @default(cuid())
  
  // Link to certificate
  certificateId String
  certificate Certificate @relation(fields: [certificateId], references: [id], onDelete: Cascade)
  
  // Alert metadata
  threshold Int                         // 90, 30, 7, 1 (days)
  triggeredAt DateTime @default(now())
  status String @default("PENDING")     // PENDING, NOTIFIED, FAILED, ACKNOWLEDGED
  
  // Certificate snapshot at alert time
  certificateCn String
  certificateSans String[]              // JSON array
  daysUntilExpiryAtAlert Int
  caName String
  owner String
  zone String
  environment String
  
  // Notifications sent
  notificationsSent NotificationRecord[]
  
  // Audit
  acknowledgedAt DateTime?
  acknowledgedBy String?
  
  createdAt DateTime @default(now())
  updatedAt DateTime @default(now())
}

model NotificationRecord {
  id String @id @default(cuid())
  
  alertId String
  alert ExpirationAlert @relation(fields: [alertId], references: [id], onDelete: Cascade)
  
  channel String                        // "email", "webhook"
  sentAt DateTime
  status String                         // "SUCCESS", "FAILED"
  errorMessage String?
  
  // For webhooks
  webhookId String?
  webhook ExpirationWebhook? @relation(fields: [webhookId], references: [id])
  attemptNumber Int @default(1)
  
  createdAt DateTime @default(now())
}

model ExpirationPolicy {
  id String @id @default(cuid())
  
  name String
  description String?
  
  // Scope
  zoneId String?
  zone Zone? @relation(fields: [zoneId], references: [id], onDelete: Cascade)
  isDefault Boolean @default(false)
  
  // Thresholds (stored as JSON or separate model)
  thresholds String @db.Text()         // JSON: { "90": { "enabled": true, "channels": [...] }, ... }
  
  // Email config
  emailEnabled Boolean @default(true)
  emailRecipientsAdditional String[]    // JSON array of email addresses
  emailSubjectPrefix String @default("[ALERT]")
  
  // Webhooks
  webhooks ExpirationWebhook[]
  
  // Audit
  createdAt DateTime @default(now())
  createdBy String
  updatedAt DateTime @default(now())
  updatedBy String
}

model ExpirationWebhook {
  id String @id @default(cuid())
  
  policyId String
  policy ExpirationPolicy @relation(fields: [policyId], references: [id], onDelete: Cascade)
  
  url String
  headers String? @db.Text()            // JSON
  retryStrategy String @default("exponential") // exponential, linear, none
  maxRetries Int @default(3)
  timeoutSeconds Int @default(10)
  
  isActive Boolean @default(true)
  testResult String?                    // "SUCCESS", "FAILED", "PENDING"
  lastTestAt DateTime?
  
  createdAt DateTime @default(now())
  updatedAt DateTime @default(now())
}

model ExpirationSnapshot {
  id String @id @default(cuid())
  
  // Daily snapshot for dashboard KPIs
  snapshotDate Date @unique
  
  totalManaged Int
  validCount Int
  expiringLessThan30d Int
  expiredOrRevoked Int
  
  // Heatmap data for next 90 days (stored as JSON)
  expirationsByDay String @db.Text()   // JSON: { "0": 5, "1": 3, ... "89": 12 }
  
  createdAt DateTime @default(now())
}
```

### 6. API Endpoints (REST)

#### Alerts
- `GET /api/alerts/expiration` — List all expiration alerts (paginated, filterable by status, certificate, threshold)
- `GET /api/alerts/expiration/{id}` — Get alert details + notification history
- `PUT /api/alerts/expiration/{id}` — Acknowledge alert (mark as ACKNOWLEDGED)
- `GET /api/certificates/{id}/alerts` — Get all alerts for a certificate

#### Dashboard
- `GET /api/dashboard/snapshot` — KPI counts, heatmap data (returns cached snapshot or computes on-demand)
- `GET /api/dashboard/heatmap?days=90` — Detailed heatmap for next N days
- `GET /api/dashboard/critical-alerts?limit=5` — Top N most urgent alerts

#### Policies
- `GET /api/policies/expiration` — List all policies
- `POST /api/policies/expiration` — Create new policy
- `PUT /api/policies/expiration/{id}` — Update policy
- `DELETE /api/policies/expiration/{id}` — Delete policy (soft delete)
- `GET /api/zones/{zone_id}/policies/expiration` — Get default policy for zone
- `POST /api/policies/expiration/{id}/test-webhook` — Test webhook connectivity

#### Scheduler (Internal/Ops)
- `POST /api/internal/scheduler/expiration-check` — Manually trigger expiration check (admin only)
- `GET /api/internal/scheduler/expiration-check/status` — Get last execution status
- `GET /api/internal/scheduler/logs` — View scheduler execution logs

---

## Risks & Assumptions

### Risks

1. **Scheduler Reliability**: Cron job fails or runs late; expiration not detected until 48+ hours in
   - Mitigation: Job completion monitoring; Slack alert if > 6 hours since last run; health check endpoint

2. **Email Delivery Failures**: Emails marked as spam or bouncing due to wrong recipient
   - Mitigation: Monitor email bounce rates; validate owner emails during certificate import; allow manual resend

3. **Webhook Retries Overwhelming External Systems**: Retry storms if webhook endpoint is flaky
   - Mitigation: Cap retries at 3; use exponential backoff; add circuit breaker pattern

4. **False Positives**: Alert sent for a cert that was renewed yesterday (stale data)
   - Mitigation: Refresh certificate notAfter from CA daily; check status before alerting

5. **Alert Fatigue**: Too many thresholds (90, 30, 7, 1) trigger alert overload
   - Mitigation: Default policy only uses 30, 7, 1; 90-day threshold optional; per-certificate muting

### Assumptions

1. Certificate notAfter dates are accurate and synchronized with CA
2. Owner emails are valid and monitored daily
3. Scheduler has stable database connection and SMTP access
4. Teams read and act on alerts within 24 hours of receipt
5. Webhook endpoints are owned and operated by customer; provider responsible for delivery retry
6. Dashboard queries (KPI, heatmap) must complete within 2 seconds for 10,000+ certificates

---

## Success Criteria (MVP)

1. **Scheduler**: Runs daily, evaluates all certs, triggers alerts per thresholds within 1 minute
2. **Email**: Notifies owner within 5 minutes of alert creation; no bounces or spam filtering
3. **Webhooks**: Dispatches payloads with 3-attempt retry; logs all failures
4. **Dashboard**: KPIs accurate, heatmap renders in < 2s, auto-refreshes every 60s
5. **Policy**: Admins can create/edit/delete policies; per-zone defaults apply
6. **SLA**: 7-day threshold certificate triggers alert to owner within 24 hours (99% of time)

---

## Metrics & Telemetry

Track:
- `expiration_alerts_created_total` (gauge, by threshold)
- `expiration_alerts_notified_total` (gauge, by channel, status)
- `alert_notification_latency_seconds` (histogram, alert creation to email sent)
- `webhook_delivery_latency_seconds` (histogram, success and failure)
- `scheduler_execution_seconds` (histogram, job runtime)
- `scheduler_certificates_evaluated_total` (gauge)
- `dashboard_heatmap_query_seconds` (histogram)
- `alert_delivery_sla_met_percent` (7-day threshold SLA: 99%)

---

## UI Summary

### Dashboard (Landing Page)

**Screens shown** (per approved prototype):

1. **Header**: Title "01 · Dashboard de expiração", tag "Tela inicial — heatmap, KPIs e alertas críticos [C3]", last refresh timestamp
2. **KPI Grid**: 4 cards (Total managed, Valid, Expiring < 30 days, Expired/Revoked)
3. **Main Grid** (2 columns):
   - **Left (2fr)**: 
     - Heatmap title, description "Expirações nos próximos 90 dias"
     - 30x1 grid of color-coded cells, one per day
     - Heatmap legend ("Menos" to "Mais")
   - **Right (1fr)**:
     - "Alertas críticos" panel, Top 5 list
     - Alert items: CN, owner, CA, "X days" badge
4. **Sidebar** (always visible): Navigation with Dashboard (active), Certificates, Expiring (badge: 23), Requests, Zones, CAs, Audit Log, API & CLI, user card

**All shown exactly as in the approved prototype.**

---

## Related Features

- **C1. Inventory**: Certificate data model; filtering by expiration status
- **C2. Lifecycle**: Manual renewal triggered after receiving alerts
- **API & CLI**: All alert/policy endpoints available via REST API
