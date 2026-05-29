# Infrastructure Requirements — Certificate Lifecycle (ciclo-de-vida)

## Table: ca_configs
- Status: NEEDS_HUMAN_CONFIRMATION
- Reason: The CSR generation service and CA adapter pattern require a `ca_configs` table to persist Certificate Authority integration settings (Vault PKI, REST CA endpoints, auth tokens, roles). The `caConfigRepo.ts` repository reads/writes to this table.
- Proposed: PostgreSQL table `ca_configs` in the existing `certdigital` database. Columns: `id` (UUID PK), `name` (unique text), `type` (enum VAULT_PKI | REST_CA), `endpoint` (text), `auth_token` (text, nullable), `auth_headers` (JSONB, nullable), `role` (text, nullable), `enabled` (boolean, default true), `created_at` (timestamp), `updated_at` (timestamp).
- Alternative-existing: No similar table exists currently. The Prisma schema has been updated with the `CaConfig` model and `CaType` enum to generate TypeScript types, but no migration has been run.
- Migration script (planned): `backend/prisma/migrations/YYYYMMDD_add_ca_configs/migration.sql`

## Environment Variable: ENCRYPTION_KEY
- Status: NEEDS_HUMAN_CONFIRMATION
- Reason: The CSR service encrypts generated private keys with AES-256-GCM before storing references. The 32-byte (hex-encoded, 64 chars) encryption key must be provided via the `ENCRYPTION_KEY` environment variable.
- Proposed: Add `ENCRYPTION_KEY` to `.env` and deployment configuration. A development-only default is provided in `backend/src/config.ts` so the app starts locally.
- Alternative-existing: No encryption key exists in the current configuration.
- Migration script (planned): N/A (environment variable, not a DB migration)
