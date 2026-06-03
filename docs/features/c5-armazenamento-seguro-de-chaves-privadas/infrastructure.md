# Infrastructure Requirements — C5 Secure Private Key Storage

> **Feature**: c5-armazenamento-seguro-de-chaves-privadas
> **Issue**: #71 — [infra] C5 Chunk 1: Database schema

---

## Table: private_keys
- Status: NEEDS_HUMAN_CONFIRMATION
- Reason: Stores AES-256-GCM encrypted private keys linked to certificates. Core table for the C5 secure key storage feature. Columns include encrypted_data (BYTEA), iv, auth_tag, salt for cryptographic material, plus algorithm, fingerprint, status, and a self-referential FK for rotation chains.
- Proposed: PostgreSQL 16, new table `private_keys` in default schema with columns: `id` (UUID PK), `certificate_id` (FK → certificates.id), `algorithm` (VARCHAR), `fingerprint` (VARCHAR, unique), `status` (KeyStatus enum), `encrypted_data` (BYTEA), `iv` (BYTEA), `auth_tag` (BYTEA), `salt` (BYTEA), `enc_algorithm` (VARCHAR), `previous_key_id` (self-FK, nullable), `created_at`, `updated_at` timestamps.
- Alternative-existing: No similar table exists. The `certificates` table stores PEM data but not encrypted private keys.
- Migration script (planned): `backend/prisma/migrations/20260603100000_add_private_keys/migration.sql`

## Enum: KeyStatus
- Status: NEEDS_HUMAN_CONFIRMATION
- Reason: Tracks the lifecycle state of a stored private key. Values: ACTIVE (current key in use), ROTATED (superseded by a newer key), DELETED (soft-deleted / destroyed).
- Proposed: PostgreSQL enum type `"KeyStatus"` with values (`ACTIVE`, `ROTATED`, `DELETED`)
- Alternative-existing: No existing enum covers key lifecycle states. `CertStatus` is for certificate validity, not key status.
- Migration script (planned): `backend/prisma/migrations/20260603100000_add_private_keys/migration.sql` (same migration)

## Enum Extension: AuditAction
- Status: NEEDS_HUMAN_CONFIRMATION
- Reason: The existing `AuditAction` enum needs four new values to audit private key operations: `KEY_STORE` (key encrypted and saved), `KEY_RETRIEVE` (key decrypted and returned), `KEY_ROTATE` (old key superseded by new one), `KEY_DELETE` (key soft-deleted).
- Proposed: ALTER TYPE "AuditAction" ADD VALUE for each: `KEY_STORE`, `KEY_RETRIEVE`, `KEY_ROTATE`, `KEY_DELETE`
- Alternative-existing: The existing `AuditAction` already has `KEY_ROTATED` for certificate-level key rotation during renewal. The new values are for discrete private-key-storage operations and are intentionally distinct.
- Migration script (planned): `backend/prisma/migrations/20260603100000_add_private_keys/migration.sql` (same migration)

## Secret: PRIVATE_KEY_ENCRYPTION_SECRET
- Status: NEEDS_HUMAN_CONFIRMATION
- Reason: Dedicated secret for encrypting private keys at rest with AES-256-GCM. Separate from the existing `ENCRYPTION_KEY` to allow independent rotation and access control for private key material. Must be at least 32 characters.
- Proposed: Environment variable `PRIVATE_KEY_ENCRYPTION_SECRET`, string, min 32 chars. Dev default provided for local development; MUST be overridden in production.
- Alternative-existing: `ENCRYPTION_KEY` exists (64-char hex for AES-256-GCM) and could potentially be reused. However, the PRD specifies a separate secret for defense-in-depth (key compromise isolation). Human to confirm whether to reuse `ENCRYPTION_KEY` or create a dedicated secret.
- Migration script (planned): N/A (environment variable, configured in `docker-compose.yml` and `backend/src/config.ts`)
