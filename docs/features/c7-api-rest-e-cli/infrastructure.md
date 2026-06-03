# Infrastructure — C7 API REST & CLI

## Table: service_tokens
- Status: NEEDS_HUMAN_CONFIRMATION
- Reason: Required to store hashed service tokens for API authentication (F2: Service Token Auth). Stores token hash, preview, scopes, expiry, and revocation metadata.
- Proposed: PostgreSQL 16, table `service_tokens` in existing database (same `DATABASE_URL`)
- Alternative-existing: None — no existing auth token storage in the schema
- Migration script (planned): `backend/prisma/migrations/20260603000000_c7_service_tokens_policies_zones/migration.sql`

## Table: policies
- Status: NEEDS_HUMAN_CONFIRMATION
- Reason: Required to store certificate validation/compliance policies per environment (F7: Policies). Defines min key size, max validity, allowed key types, org names, and custom rules.
- Proposed: PostgreSQL 16, table `policies` in existing database (same `DATABASE_URL`)
- Alternative-existing: `expiration_policies` table exists but serves a different purpose (alert thresholds and notification config, not certificate issuance/validation rules)
- Migration script (planned): `backend/prisma/migrations/20260603000000_c7_service_tokens_policies_zones/migration.sql`

## Table: zones
- Status: NEEDS_HUMAN_CONFIRMATION
- Reason: Required to define named network/infrastructure zones for certificate organization (F8: Zones). Replaces the free-text `zone` field on certificates with a structured entity.
- Proposed: PostgreSQL 16, table `zones` in existing database (same `DATABASE_URL`)
- Alternative-existing: The `Certificate` model has a `zone` text field, but no dedicated table for zone definitions
- Migration script (planned): `backend/prisma/migrations/20260603000000_c7_service_tokens_policies_zones/migration.sql`
