# C5 — Secure Storage of Private Keys: Infrastructure Requirements

## Database Table: private_keys
- Status: NEEDS_HUMAN_CONFIRMATION
- Reason: Feature C5 requires a new table to store encrypted private key material associated with certificates. This table stores AES-256-GCM ciphertext (not plaintext keys) with per-record IV, auth tag, and salt for envelope encryption.
- Proposed: PostgreSQL 16, new table `private_keys` in the existing `certdigital` database. Columns: id (UUID PK), certificate_id (FK to certificates), algorithm (VARCHAR), fingerprint (VARCHAR), status (ENUM: ACTIVE/ROTATED/DELETED), encrypted_data (BYTEA), iv (BYTEA 12 bytes), auth_tag (BYTEA 16 bytes), salt (BYTEA 16 bytes), enc_algorithm (VARCHAR default 'aes-256-gcm'), previous_key_id (self-FK nullable), created_at, rotated_at, deleted_at. Indexes on certificate_id, status, fingerprint.
- Alternative-existing: The `certificates` table has a `pem_data` column (stores certificate PEM), but it is not suitable for private key storage (no encryption, wrong data type, wrong semantics).
- Migration script (planned): `backend/prisma/migrations/2026XXXX_add_private_keys/migration.sql`

## Database Enum Extension: AuditAction
- Status: NEEDS_HUMAN_CONFIRMATION
- Reason: Four new audit action types are needed for key lifecycle tracking: KEY_STORE, KEY_RETRIEVE, KEY_ROTATE, KEY_DELETE. These are added to the existing `AuditAction` PostgreSQL enum used by the `audit_entries` table.
- Proposed: `ALTER TYPE "AuditAction" ADD VALUE 'KEY_STORE'; ALTER TYPE "AuditAction" ADD VALUE 'KEY_RETRIEVE'; ALTER TYPE "AuditAction" ADD VALUE 'KEY_ROTATE'; ALTER TYPE "AuditAction" ADD VALUE 'KEY_DELETE';`
- Alternative-existing: Could use the existing `detail` JSON column to store key action type, but this breaks enum-based filtering in the audit log UI and loses type safety.
- Migration script (planned): Same migration as the private_keys table above.

## Database Enum: KeyStatus
- Status: NEEDS_HUMAN_CONFIRMATION
- Reason: New enum type for private key lifecycle states: ACTIVE, ROTATED, DELETED. Used by the `private_keys.status` column.
- Proposed: `CREATE TYPE "KeyStatus" AS ENUM ('ACTIVE', 'ROTATED', 'DELETED');`
- Alternative-existing: Could use a VARCHAR column with application-level validation, but an enum provides database-level type safety consistent with existing enums (CertStatus, Environment, etc.).
- Migration script (planned): Same migration as the private_keys table above.

## Environment Variable: PRIVATE_KEY_ENCRYPTION_SECRET
- Status: NEEDS_HUMAN_CONFIRMATION
- Reason: AES-256-GCM encryption of private keys requires a Key Encryption Key (KEK) derived from this secret via PBKDF2. Must be at least 32 characters. The server will refuse to start without it (Zod validation). This is NOT a database resource but is a mandatory runtime configuration that must be provisioned in the Homologacao environment.
- Proposed: Environment variable `PRIVATE_KEY_ENCRYPTION_SECRET` with a minimum 32-character cryptographically random value. Example generation: `openssl rand -base64 48`. Stored in CI/CD secrets or platform config (never in source code).
- Alternative-existing: Could reuse DATABASE_URL or another existing secret, but using a dedicated secret follows principle of least privilege and allows independent rotation.
- Migration script (planned): N/A (environment configuration, not database migration). Will be documented in CLAUDE.md and docker-compose.yml.
