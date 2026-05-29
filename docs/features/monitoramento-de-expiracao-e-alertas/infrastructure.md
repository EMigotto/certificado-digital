# Infrastructure Requirements — Expiration Monitoring and Alerts

All resources below are managed via Prisma ORM migrations committed to the repository.
Actual table creation happens when `prisma migrate deploy` is executed against the target database.

## Table: expiration_alerts
- Status: NEEDS_HUMAN_CONFIRMATION
- Reason: Stores one record per certificate × threshold combination. Required for alert deduplication (AC 5.1, 5.2) and tracking alert lifecycle (PENDING → NOTIFIED → ACKNOWLEDGED).
- Proposed: PostgreSQL table `expiration_alerts` in the existing `certdigital` database. Columns: `id` (UUID PK), `certificate_id` (FK → certificates), `threshold` (INT), `triggered_at` (TIMESTAMP), `status` (enum AlertStatus), snapshot fields (`certificate_cn`, `certificate_sans`, `days_until_expiry_at_alert`, `ca_name`, `owner`, `zone`, `environment`), `acknowledged_at`, `acknowledged_by`, `created_at`, `updated_at`. Unique constraint on `(certificate_id, threshold)`.
- Alternative-existing: No similar table exists.
- Migration script (planned): `backend/prisma/migrations/20250529000000_add_expiration_monitoring/migration.sql`

## Table: notification_records
- Status: NEEDS_HUMAN_CONFIRMATION
- Reason: Immutable log of each delivery attempt (email or webhook) for a given alert. Supports audit trail and retry tracking.
- Proposed: PostgreSQL table `notification_records` in the existing `certdigital` database. Columns: `id` (UUID PK), `alert_id` (FK → expiration_alerts), `channel` (enum NotificationChannel), `sent_at` (TIMESTAMP), `status` (enum NotificationStatus), `error_message` (TEXT nullable), `webhook_id` (FK → expiration_webhooks nullable), `attempt_number` (INT).
- Alternative-existing: No similar table exists.
- Migration script (planned): `backend/prisma/migrations/20250529000000_add_expiration_monitoring/migration.sql`

## Table: expiration_policies
- Status: NEEDS_HUMAN_CONFIRMATION
- Reason: Stores configurable alert threshold policies per zone. Supports per-zone customization of alert thresholds and notification preferences.
- Proposed: PostgreSQL table `expiration_policies` in the existing `certdigital` database. Columns: `id` (UUID PK), `name` (TEXT), `description` (TEXT nullable), `zone_id` (TEXT nullable), `is_default` (BOOLEAN), `thresholds` (TEXT, JSON-encoded), `email_enabled` (BOOLEAN), `email_recipients_additional` (TEXT nullable), `email_subject_prefix` (TEXT nullable), `created_by` (TEXT), `updated_by` (TEXT nullable), `created_at`, `updated_at`. Partial unique index on `zone_id` WHERE `is_default = true`.
- Alternative-existing: No similar table exists.
- Migration script (planned): `backend/prisma/migrations/20250529000000_add_expiration_monitoring/migration.sql`

## Table: expiration_webhooks
- Status: NEEDS_HUMAN_CONFIRMATION
- Reason: Stores webhook endpoint configurations per expiration policy. Required for webhook notification delivery.
- Proposed: PostgreSQL table `expiration_webhooks` in the existing `certdigital` database. Columns: `id` (UUID PK), `policy_id` (FK → expiration_policies), `url` (TEXT), `headers` (JSONB), `retry_strategy` (TEXT nullable), `max_retries` (INT), `timeout_seconds` (INT), `is_active` (BOOLEAN), `test_result` (TEXT nullable), `last_test_at` (TIMESTAMP nullable), `created_at`, `updated_at`.
- Alternative-existing: No similar table exists.
- Migration script (planned): `backend/prisma/migrations/20250529000000_add_expiration_monitoring/migration.sql`

## Table: expiration_snapshots
- Status: NEEDS_HUMAN_CONFIRMATION
- Reason: Daily cached KPI and heatmap data for the expiration monitoring dashboard. Avoids expensive real-time aggregations.
- Proposed: PostgreSQL table `expiration_snapshots` in the existing `certdigital` database. Columns: `id` (UUID PK), `snapshot_date` (DATE, unique), `total_managed` (INT), `valid_count` (INT), `expiring_less_than_30d` (INT), `expired_or_revoked` (INT), `expirations_by_day` (TEXT, JSON-encoded), `created_at`.
- Alternative-existing: No similar table exists.
- Migration script (planned): `backend/prisma/migrations/20250529000000_add_expiration_monitoring/migration.sql`

## Enum: AlertStatus
- Status: NEEDS_HUMAN_CONFIRMATION
- Reason: Used by `expiration_alerts.status` column to track alert lifecycle.
- Proposed: PostgreSQL enum `AlertStatus` with values: `PENDING`, `NOTIFIED`, `FAILED`, `ACKNOWLEDGED`.
- Alternative-existing: No similar enum exists.
- Migration script (planned): `backend/prisma/migrations/20250529000000_add_expiration_monitoring/migration.sql`

## Enum: NotificationChannel
- Status: NEEDS_HUMAN_CONFIRMATION
- Reason: Used by `notification_records.channel` column to distinguish delivery method.
- Proposed: PostgreSQL enum `NotificationChannel` with values: `EMAIL`, `WEBHOOK`.
- Alternative-existing: No similar enum exists.
- Migration script (planned): `backend/prisma/migrations/20250529000000_add_expiration_monitoring/migration.sql`

## Enum: NotificationStatus
- Status: NEEDS_HUMAN_CONFIRMATION
- Reason: Used by `notification_records.status` column to track delivery outcome.
- Proposed: PostgreSQL enum `NotificationStatus` with values: `SUCCESS`, `FAILED`, `SKIPPED`.
- Alternative-existing: No similar enum exists.
- Migration script (planned): `backend/prisma/migrations/20250529000000_add_expiration_monitoring/migration.sql`
