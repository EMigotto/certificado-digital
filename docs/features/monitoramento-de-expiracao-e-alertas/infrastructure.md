# Infrastructure Requirements: C3. Monitoramento de Expiração e Alertas

**Feature**: C3. Certificate Expiration Monitoring and Alerts  
**Date**: 2026-05-29  
**Status**: PENDING_REVIEW

---

## Overview

This document outlines infrastructure and persistent resources required for the Expiration Monitoring and Alerts feature. All resources listed here must be approved before implementation.

---

## Database Schema Extensions

### Status: NEEDS_HUMAN_CONFIRMATION

**Reason**: Feature requires new database tables to store expiration alerts, notification records, and policies.

**Proposed**:
- PostgreSQL 16 (already deployed)
- New Prisma models:
  - `ExpirationAlert` — tracks certificate expiration thresholds and alert state
  - `NotificationRecord` — immutable log of email/webhook delivery attempts
  - `ExpirationPolicy` — configurable thresholds, channels, recipients per zone
  - `ExpirationWebhook` — webhook endpoints for alerts
  - `ExpirationSnapshot` — daily KPI snapshot for dashboard (optional caching)

**Alternative-existing**:
- Reuse existing `CertificateAuditLog` table? → No, expiration alerts are a separate concern; needs dedicated tables for querying and notification tracking.

**Migration Script (planned)**:
- `db/migrations/2026XXXX_add_expiration_monitoring.sql`
  - Creates tables: `expiration_alerts`, `notification_records`, `expiration_policies`, `expiration_webhooks`, `expiration_snapshots`
  - Adds indexes on `certificate_id`, `threshold`, `status`, `created_at`, `triggered_at`
  - Adds foreign keys to `certificates` and `zones` tables
  - Adds computed column or trigger for `days_until_expiry` on certificates (if not already present)

---

## Scheduler / Job Queue

### Status: NEEDS_HUMAN_CONFIRMATION

**Reason**: Feature requires a recurring cron job to evaluate certificates daily and trigger alerts.

**Proposed**:
- **Option A (Recommended for MVP)**: Node.js `node-cron` library
  - Lightweight, in-process scheduler
  - Runs in the Fastify backend
  - Configured via environment variable: `EXPIRATION_SCHEDULER_ENABLED=true`
  - Cron expression: `0 0 * * *` (daily at 00:00 UTC)
  - SLA: Job must complete within 300 seconds (5 minutes)
  
- **Option B (Future Scaling)**: Bull queue + Redis
  - Decoupled job processing
  - Persistent job history
  - Enables horizontal scaling
  - Requires Redis instance (not proposed for MVP)

**Alternative-existing**:
- AWS Lambda + EventBridge? → Not available in Homologacao environment; defer to Phase 2.
- Kubernetes CronJob? → No Kubernetes in MVP; defer to Phase 2.

**Configuration (planned)**:
- Environment variables in `backend/.env`:
  ```
  EXPIRATION_SCHEDULER_ENABLED=true
  EXPIRATION_SCHEDULER_CRON=0 0 * * *
  EXPIRATION_SCHEDULER_TIMEZONE=UTC
  ```
- Scheduler health check: `GET /api/internal/scheduler/status` returns last execution time and next scheduled run
- Monitoring: Logs to standard backend logger; Slack alert if no successful run in 24 hours

---

## Email Service (SMTP)

### Status: NEEDS_HUMAN_CONFIRMATION

**Reason**: Feature requires SMTP capability to send expiration alert emails.

**Proposed**:
- SMTP relay (existing or new) with credentials:
  - Host: (provided by operations)
  - Port: 587 or 465 (TLS/SSL)
  - Username: (provided by operations)
  - Password: (stored in environment variable `SMTP_PASSWORD`)
  - From address: `no-reply@cipher.internal` (configurable)

**Connection Method**:
- Node.js library: `nodemailer` or `@sendgrid/mail`
- Credentials stored in environment variables (not in code)
- Connection pooling to avoid recreating connections per email
- Timeout: 10 seconds per SMTP operation

**Alternative-existing**:
- AWS SES? → Check if available in Homologacao; if so, preferred for reliability.
- SendGrid? → Third-party service; requires API key; consider for Phase 2.

**Configuration (planned)**:
```
SMTP_HOST=mail.bank.internal
SMTP_PORT=587
SMTP_USER=noreply-cipher@bank.internal
SMTP_PASSWORD=<secret>
SMTP_FROM_ADDRESS=no-reply@cipher.internal
SMTP_FROM_NAME="Certificate Expiration Alerts"
SMTP_TIMEOUT_MS=10000
```

**Testing**:
- Test SMTP connectivity on backend startup; log warning if unreachable
- Manual test endpoint: `POST /api/internal/test-email?to=test@internal` (admin only)
- Retry logic: up to 3 attempts with exponential backoff (1s, 5s, 30s)

---

## Webhook Delivery Service (Optional HTTP Client Enhancements)

### Status: NEEDS_HUMAN_CONFIRMATION

**Reason**: Feature supports outbound webhook delivery to customer-configured endpoints.

**Proposed**:
- No new infrastructure; use standard Node.js `fetch` or `axios` library
- Built-in retry and timeout logic:
  - Timeout: 10 seconds per request
  - Retries: 3 attempts with exponential backoff (1s, 5s, 30s)
  - Circuit breaker: if endpoint fails 5 consecutive times, mark as unhealthy and skip for 1 hour

**Alternative-existing**:
- Webhook proxy service? → Defer to Phase 2 if customer needs batching or transformation.

**Configuration (planned)**:
```
WEBHOOK_TIMEOUT_MS=10000
WEBHOOK_MAX_RETRIES=3
WEBHOOK_RETRY_BACKOFF_STRATEGY=exponential
```

---

## Secrets Management

### Status: NEEDS_HUMAN_CONFIRMATION (Part of existing setup)

**Reason**: SMTP credentials and webhook custom headers may contain secrets.

**Proposed**:
- Existing secrets engine (Vault, AWS Secrets Manager, or environment variables)
- SMTP password stored as secret; rotated per ops schedule
- Webhook headers (if they contain API keys) stored encrypted in database or as secrets

**Alternative-existing**:
- Check current secrets management setup in repo (likely already configured)

---

## Monitoring & Alerting

### Status: NEEDS_HUMAN_CONFIRMATION (Part of existing setup)

**Reason**: Scheduler job failures and email delivery failures must be monitored.

**Proposed**:
- **Logs**: Send scheduler execution logs and errors to standard backend logger (likely ELK or CloudWatch)
- **Metrics**: Export Prometheus metrics (if monitoring already in place):
  - `expiration_scheduler_execution_seconds` (histogram)
  - `expiration_alerts_created_total` (counter)
  - `email_notifications_sent_total` (counter)
  - `email_notifications_failed_total` (counter)
  - `webhook_delivery_attempts_total` (counter)
- **Alerts**: If scheduler fails or no run in 24 hours, send alert to:
  - Slack channel: `#pki-ops-alerts` (or configured channel)
  - PagerDuty (if integrated)

**Alternative-existing**:
- Check current monitoring setup; reuse existing dashboards and alert integrations.

---

## Caching (Optional for Dashboard Performance)

### Status: OPTIONAL_FOR_MVP

**Reason**: Dashboard KPI queries (count valid certs, count expiring, build heatmap) can be expensive with 10,000+ certificates.

**Proposed (Phase 1 Optimization)**:
- **Option A (Simple)**: Cache snapshot in database
  - Create `ExpirationSnapshot` table
  - Store daily KPI counts: `total_managed`, `valid_count`, `expiring_less_30d`, `expired_or_revoked`
  - Store heatmap: `expirations_by_day` (JSON array, 90 elements)
  - Refresh snapshot once daily (via scheduler job after threshold evaluation)
  - Dashboard queries `ExpirationSnapshot` instead of full certificate scan
  - Query time: < 100ms instead of 2 seconds

- **Option B (Redis)**: In-memory cache
  - Store KPI snapshot in Redis with 60-second TTL
  - Refresh on-demand via background job or API call
  - Requires Redis instance; defer to Phase 2 if not available

**Alternative-existing**:
- Materialized view in PostgreSQL? → Yes, viable; can be refreshed daily via trigger or manual command.

**Configuration (planned)** (if approved):
```
DASHBOARD_CACHE_TTL_SECONDS=30
DASHBOARD_CACHE_STRATEGY=database_snapshot  # or "redis"
```

---

## Summary Table

| Resource | Type | Status | MVP Required | Phase |
|----------|------|--------|--------------|-------|
| PostgreSQL tables (alerts, policies, webhooks) | Database | NEEDS_CONFIRMATION | YES | 1 |
| Node.js node-cron scheduler | Job Queue | NEEDS_CONFIRMATION | YES | 1 |
| SMTP service (Email delivery) | Email | NEEDS_CONFIRMATION | YES | 1 |
| Webhook HTTP client (retries) | HTTP | NEEDS_CONFIRMATION | YES | 1 |
| Secrets (SMTP password) | Secrets | NEEDS_CONFIRMATION | YES | 1 (existing) |
| Monitoring (Logs, Metrics, Alerts) | Monitoring | NEEDS_CONFIRMATION | YES | 1 (existing) |
| Database snapshot cache | Database | OPTIONAL | NO | 1.1 |
| Redis cache (future) | Cache | OPTIONAL | NO | 2 |

---

## Next Steps

1. **Human review**: Confirm or modify proposed infrastructure
2. **Update status**: Once approved, update this document with actual resource names/configs
3. **Implementation**: Create Prisma migrations, environment configs, backend code
4. **Testing**: Validate scheduler, email, webhooks in Homologacao environment
5. **Deployment**: Follow standard deployment process for database migrations and config updates

---

## Approval Checklist

- [ ] Database schema approved
- [ ] Scheduler approach (node-cron vs. other) approved
- [ ] SMTP service configured and credentials provided
- [ ] Webhook retry logic approved
- [ ] Monitoring/alerting integration confirmed
- [ ] Optional caching strategy decided
- [ ] All resources marked as "created" with actual identifiers

**Status**: Awaiting human confirmation before proceeding with implementation.
