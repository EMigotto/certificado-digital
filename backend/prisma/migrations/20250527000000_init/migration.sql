-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CertStatus" AS ENUM ('VALID', 'EXPIRING_SOON', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "Environment" AS ENUM ('DEV', 'HML', 'PRD');

-- CreateEnum
CREATE TYPE "ImportSource" AS ENUM ('MANUAL', 'CSV_IMPORT', 'API_SYNC', 'CERTIFICATE_FILE');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'REVOKE', 'IMPORT', 'EXPORT');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateTable
CREATE TABLE "certificates" (
    "id" TEXT NOT NULL,
    "common_name" TEXT NOT NULL,
    "subject_dn" TEXT,
    "issuer_dn" TEXT,
    "sans" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "serial_number" TEXT NOT NULL,
    "not_before" TIMESTAMP(3) NOT NULL,
    "not_after" TIMESTAMP(3) NOT NULL,
    "status" "CertStatus" NOT NULL DEFAULT 'VALID',
    "signature_algorithm" TEXT NOT NULL,
    "key_size" INTEGER,
    "fingerprint_sha256" TEXT NOT NULL,
    "fingerprint_sha1" TEXT,
    "owner" TEXT NOT NULL,
    "team" TEXT,
    "application" TEXT NOT NULL,
    "environment" "Environment" NOT NULL DEFAULT 'DEV',
    "zone" TEXT,
    "ca_name" TEXT NOT NULL,
    "ca_provider" TEXT,
    "import_source" "ImportSource" NOT NULL DEFAULT 'MANUAL',
    "source_file" TEXT,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "revoked_at" TIMESTAMP(3),
    "revocation_reason" TEXT,
    "tags" JSONB NOT NULL DEFAULT '{}',
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "description" TEXT,
    "pem_data" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_entries" (
    "id" TEXT NOT NULL,
    "certificate_id" TEXT,
    "cert_cn" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "actor" TEXT NOT NULL,
    "result" "AuditResult" NOT NULL DEFAULT 'SUCCESS',
    "detail" TEXT,
    "changes" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "certificates_fingerprint_sha256_key" ON "certificates"("fingerprint_sha256");

-- CreateIndex
CREATE INDEX "idx_cert_not_after" ON "certificates"("not_after");

-- CreateIndex
CREATE INDEX "idx_cert_status" ON "certificates"("status");

-- CreateIndex
CREATE INDEX "idx_cert_environment" ON "certificates"("environment");

-- CreateIndex
CREATE INDEX "idx_cert_ca_name" ON "certificates"("ca_name");

-- CreateIndex
CREATE INDEX "idx_cert_owner" ON "certificates"("owner");

-- CreateIndex
CREATE INDEX "idx_cert_cn_issuer" ON "certificates"("common_name", "issuer_dn");

-- CreateIndex
CREATE INDEX "idx_audit_cert_id" ON "audit_entries"("certificate_id");

-- CreateIndex
CREATE INDEX "idx_audit_action" ON "audit_entries"("action");

-- CreateIndex
CREATE INDEX "idx_audit_timestamp" ON "audit_entries"("timestamp");

-- CreateIndex
CREATE INDEX "idx_audit_actor" ON "audit_entries"("actor");

-- AddForeignKey
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_certificate_id_fkey" FOREIGN KEY ("certificate_id") REFERENCES "certificates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
