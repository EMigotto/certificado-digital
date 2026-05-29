-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('PENDING', 'NOTIFIED', 'FAILED', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('SUCCESS', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "expiration_alerts" (
    "id" TEXT NOT NULL,
    "certificate_id" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "triggered_at" TIMESTAMP(3) NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'PENDING',
    "certificate_cn" TEXT NOT NULL,
    "certificate_sans" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "days_until_expiry_at_alert" INTEGER NOT NULL,
    "ca_name" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "zone" TEXT,
    "environment" TEXT,
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expiration_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_records" (
    "id" TEXT NOT NULL,
    "alert_id" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL,
    "status" "NotificationStatus" NOT NULL,
    "error_message" TEXT,
    "webhook_id" TEXT,
    "attempt_number" INTEGER NOT NULL,

    CONSTRAINT "notification_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expiration_policies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "zone_id" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "thresholds" TEXT NOT NULL,
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "email_recipients_additional" TEXT,
    "email_subject_prefix" TEXT,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expiration_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expiration_webhooks" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "headers" JSONB NOT NULL DEFAULT '{}',
    "retry_strategy" TEXT,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "timeout_seconds" INTEGER NOT NULL DEFAULT 30,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "test_result" TEXT,
    "last_test_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expiration_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expiration_snapshots" (
    "id" TEXT NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "total_managed" INTEGER NOT NULL,
    "valid_count" INTEGER NOT NULL,
    "expiring_less_than_30d" INTEGER NOT NULL,
    "expired_or_revoked" INTEGER NOT NULL,
    "expirations_by_day" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expiration_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: ExpirationAlert
CREATE UNIQUE INDEX "uq_alert_cert_threshold" ON "expiration_alerts"("certificate_id", "threshold");

CREATE INDEX "idx_alert_status" ON "expiration_alerts"("status");

CREATE INDEX "idx_alert_triggered_at" ON "expiration_alerts"("triggered_at");

CREATE INDEX "idx_alert_certificate_id" ON "expiration_alerts"("certificate_id");

-- CreateIndex: NotificationRecord
CREATE INDEX "idx_notification_alert_id" ON "notification_records"("alert_id");

CREATE INDEX "idx_notification_channel" ON "notification_records"("channel");

-- CreateIndex: ExpirationPolicy (partial unique — one default per zone)
CREATE UNIQUE INDEX "uq_policy_zone_default" ON "expiration_policies"("zone_id") WHERE "is_default" = true;

-- CreateIndex: ExpirationWebhook
CREATE INDEX "idx_webhook_policy_id" ON "expiration_webhooks"("policy_id");

-- CreateIndex: ExpirationSnapshot
CREATE UNIQUE INDEX "expiration_snapshots_snapshot_date_key" ON "expiration_snapshots"("snapshot_date");

-- AddForeignKey
ALTER TABLE "expiration_alerts" ADD CONSTRAINT "expiration_alerts_certificate_id_fkey" FOREIGN KEY ("certificate_id") REFERENCES "certificates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_records" ADD CONSTRAINT "notification_records_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "expiration_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_records" ADD CONSTRAINT "notification_records_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "expiration_webhooks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expiration_webhooks" ADD CONSTRAINT "expiration_webhooks_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "expiration_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
