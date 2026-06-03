-- C7 API REST & CLI — Foundation tables
-- ServiceToken, CertificatePolicy (policies), Zone

-- CreateTable: service_tokens
CREATE TABLE "service_tokens" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_preview" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revocation_reason" TEXT,
    "last_used_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,

    CONSTRAINT "service_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable: policies (certificate validation / compliance policies)
CREATE TABLE "policies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "environment" "Environment" NOT NULL,
    "min_key_size" INTEGER NOT NULL,
    "max_validity_days" INTEGER NOT NULL,
    "allowed_key_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowed_org_names" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "required_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rules" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable: zones
CREATE TABLE "zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "region" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: ServiceToken
CREATE UNIQUE INDEX "service_tokens_token_hash_key" ON "service_tokens"("token_hash");

CREATE INDEX "idx_service_token_expires_at" ON "service_tokens"("expires_at");

CREATE INDEX "idx_service_token_name" ON "service_tokens"("name");

-- CreateIndex: CertificatePolicy
CREATE UNIQUE INDEX "policies_name_key" ON "policies"("name");

CREATE INDEX "idx_policy_environment" ON "policies"("environment");

-- CreateIndex: Zone
CREATE UNIQUE INDEX "zones_name_key" ON "zones"("name");
