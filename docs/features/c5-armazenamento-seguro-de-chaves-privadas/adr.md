# ADR: C5 — Secure Storage of Private Keys

**Feature ID**: C5  
**Slug**: `c5-armazenamento-seguro-de-chaves-privadas`  
**Status**: Proposed  
**Date**: 2026-06-03  
**Deciders**: Tech Lead  
**Parent Issue**: #0

---

## 1. Context

The Certificado Digital platform manages certificate lifecycle operations (C1 inventory, C2 lifecycle, C3 monitoring, C7 API/CLI). A critical gap exists: **the platform has no capability to securely store private keys**.

### Current State

| Area | Current Behavior | Gap |
|------|-----------------|-----|
| CSR generation (C7) | `POST /api/csr` generates RSA key pair + CSR, returns private key PEM in the response, discards immediately | Key is lost if caller doesn't save it |
| Certificate import | `POST /api/import` parses PEM/PKCS#12 and extracts cert metadata; PKCS#12 private keys are ignored | Imported PKCS#12 private keys are discarded |
| Certificate model | `pemData` column stores the **certificate** PEM (public); no column for private key | No private key association |
| Renewal (C2 planned) | "Keep Same Key" strategy requires the original private key | Impossible without key storage |
| Audit | `AuditEntry` tracks cert operations (CREATE, UPDATE, DELETE, REVOKE) | No key-specific audit actions |

### Constraints & Inputs

| Input | Detail |
|-------|--------|
| PRD | `docs/features/c5-armazenamento-seguro-de-chaves-privadas/prd.md` — 6 functional areas, 5 API endpoints |
| Acceptance Criteria | `docs/features/c5-armazenamento-seguro-de-chaves-privadas/acceptance-criteria.md` — 10 features, 30+ Gherkin scenarios |
| CLAUDE.md | Stack: React 19, Vite, Fastify 5, Prisma, PostgreSQL 16, npm workspaces |
| Existing crypto lib | `node-forge` already used for cert parsing; Node.js `crypto` for AES-GCM |
| Existing DB | PostgreSQL 16, Prisma ORM, `Certificate` + `AuditEntry` models |

### What Already Exists (Reusable)

- **`node-forge`**: Already a dependency — used for PEM parsing, fingerprint computation, PKCS#12 decoding
- **`AuditEntry` model**: Immutable audit log with `action`, `actor`, `result`, `detail`, `changes` fields
- **`AuditAction` enum**: Currently `CREATE | UPDATE | DELETE | REVOKE | IMPORT | EXPORT` — needs extension
- **`CertificateService`**: Service layer with repository pattern — extend for key operations
- **Backend `config.ts`**: Zod-validated environment configuration — add `PRIVATE_KEY_ENCRYPTION_SECRET`
- **Frontend detail page**: `CertificateDetailPage` with `MetadataGrid`, `ActionPanel` — add Key section

---

## 2. Decision Drivers

1. **Security first**: Private keys are the most sensitive data in the system. Encryption at rest is non-negotiable. No plaintext keys in the DB, logs, or error messages.
2. **Compliance alignment**: AES-256-GCM with PBKDF2 key derivation satisfies PCI-DSS and SOC 2 encryption-at-rest requirements.
3. **Operational simplicity**: Use Node.js native `crypto` module for AES-256-GCM (FIPS-compatible, zero additional dependencies). No external vault service in MVP.
4. **Backward compatibility**: The existing CSR endpoint must continue to work unchanged when `storeKey` is not specified.
5. **Audit transparency**: Every key access (store, retrieve, rotate, delete) must be audited with actor and reason.
6. **Minimal schema impact**: One new table (`PrivateKey`) with FK to `Certificate`. No changes to the existing `Certificate` model columns.
7. **Separation of scopes**: Key operations use a distinct scope prefix (`key:`) separate from certificate scopes (`cert:`), enforcing principle of least privilege.

---

## 3. Architectural Decisions

### 3.1 Encryption Scheme: AES-256-GCM with PBKDF2

**Decision**: Use Node.js `crypto` module for envelope encryption.

```
KEK source: env var PRIVATE_KEY_ENCRYPTION_SECRET (≥32 chars)
    │
    ▼
PBKDF2(KEK, per-record-salt, 100000 iterations, SHA-512) → 32-byte DEK
    │
    ▼
AES-256-GCM(DEK, random-IV) → {ciphertext, authTag}
    │
    ▼
Store: {ciphertext, iv, authTag, salt, algorithm} → PostgreSQL BYTEA column
```

**Per-record isolation**: Each `PrivateKey` row gets a unique 16-byte `salt` and 12-byte `iv`, so identical plaintext keys produce different ciphertext. This prevents correlation attacks.

**GCM authenticated encryption**: AES-GCM provides both confidentiality and integrity. The 16-byte `authTag` detects any tampering with the ciphertext. Decryption fails fast if data is corrupted.

**PBKDF2 parameters**:
- Hash: SHA-512
- Iterations: 100,000 (balance between security and performance)
- Output: 32 bytes (256-bit AES key)
- Salt: 16 bytes, cryptographically random per record

**Why Node.js `crypto` instead of `node-forge`?**

| Factor | Node.js `crypto` | `node-forge` |
|--------|-----------------|-------------|
| AES-GCM support | Native, hardware-accelerated (AES-NI) | Pure JS, ~10x slower |
| PBKDF2 | Native, uses OpenSSL | Pure JS |
| FIPS compliance | Yes (OpenSSL-backed) | No (JS implementation) |
| Dependencies | Zero (built-in) | Already present |
| Performance | ~1ms for AES-GCM | ~10ms for AES-GCM |

**Decision**: Use `crypto` for all encryption operations. Continue using `node-forge` for PEM parsing and fingerprint computation (already established pattern).

**Alternatives considered**:

| Alternative | Rejected because |
|-------------|-----------------|
| Store plaintext + PostgreSQL column encryption (pgcrypto) | DB-level encryption ties security to DB access control; application-level encryption is more portable |
| HashiCorp Vault Transit engine | External dependency; operational overhead; MVP doesn't justify the complexity |
| AWS KMS / Azure Key Vault | Cloud provider lock-in; adds latency (API call per encrypt/decrypt); overkill for MVP |
| `node-forge` AES-GCM | Pure JS, not hardware-accelerated, not FIPS-compliant |
| RSA envelope encryption (encrypt DEK with RSA public key) | Adds RSA key pair management for the KEK itself; PBKDF2 is simpler for single-KEK scenario |

### 3.2 Database Schema: `PrivateKey` Model

**Decision**: New Prisma model `PrivateKey` with 1:1 optional relationship to `Certificate`.

```prisma
model PrivateKey {
  id              String        @id @default(uuid())

  // ── Certificate link ────────────────────────────────────────────
  certificateId   String        @map("certificate_id")
  certificate     Certificate   @relation(fields: [certificateId], references: [id], onDelete: Cascade)

  // ── Key metadata (never encrypted, for queries) ─────────────────
  algorithm       String                          // "RSA-2048", "RSA-4096", "ECDSA-P256"
  fingerprint     String        @map("fingerprint")  // SHA-256 of public key DER
  status          KeyStatus     @default(ACTIVE)

  // ── Encrypted key material ──────────────────────────────────────
  encryptedData   Bytes         @map("encrypted_data")     // AES-256-GCM ciphertext
  iv              Bytes         @map("iv")                 // 12-byte initialization vector
  authTag         Bytes         @map("auth_tag")           // 16-byte GCM authentication tag
  salt            Bytes         @map("salt")               // 16-byte PBKDF2 salt
  encAlgorithm    String        @default("aes-256-gcm") @map("enc_algorithm")

  // ── Rotation chain ──────────────────────────────────────────────
  previousKeyId   String?       @map("previous_key_id")
  previousKey     PrivateKey?   @relation("KeyRotation", fields: [previousKeyId], references: [id])
  nextKey         PrivateKey?   @relation("KeyRotation")

  // ── Timestamps ──────────────────────────────────────────────────
  createdAt       DateTime      @default(now())   @map("created_at")
  rotatedAt       DateTime?     @map("rotated_at")
  deletedAt       DateTime?     @map("deleted_at")

  // ── Indexes ─────────────────────────────────────────────────────
  @@index([certificateId], name: "idx_pk_certificate_id")
  @@index([status], name: "idx_pk_status")
  @@index([fingerprint], name: "idx_pk_fingerprint")
  @@map("private_keys")
}

enum KeyStatus {
  ACTIVE
  ROTATED
  DELETED
}
```

**Key design rationale**:

1. **`Bytes` columns** for `encryptedData`, `iv`, `authTag`, `salt`: PostgreSQL `BYTEA` type stores raw bytes efficiently. No base64 encoding overhead.
2. **`KeyStatus` enum**: Three states — `ACTIVE` (current key), `ROTATED` (superseded by rotation), `DELETED` (ciphertext zeroed).
3. **Self-referential `previousKeyId`**: Tracks rotation chain. `previousKey` → `nextKey` gives the full history.
4. **`certificateId` FK with `onDelete: Cascade`**: If a certificate is permanently removed, its key records are also removed.
5. **No unique constraint on `certificateId`**: A certificate may have multiple key records (one `ACTIVE`, N `ROTATED`, M `DELETED`).
6. **`fingerprint`**: SHA-256 of the DER-encoded public key. Allows verification of key identity without decryption.

**Extension to `AuditAction` enum**:

```prisma
enum AuditAction {
  CREATE
  UPDATE
  DELETE
  REVOKE
  IMPORT
  EXPORT
  KEY_STORE       // NEW
  KEY_RETRIEVE    // NEW
  KEY_ROTATE      // NEW
  KEY_DELETE       // NEW
}
```

**No changes to `Certificate` model**: The key relationship is managed entirely from the `PrivateKey` side. The `Certificate` model gains an optional `keys PrivateKey[]` relation field (Prisma-only, no DB schema change to the certificates table).

### 3.3 Backend Architecture: Service + Repository + Crypto Module

**Decision**: Follow the existing layered architecture pattern.

```
┌─────────────────────────────────────────────────┐
│                    Routes Layer                   │
│   backend/src/routes/keys.ts                     │
│   Registers: POST, GET, DELETE endpoints          │
│   Validates request, calls service                │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│                   Service Layer                   │
│   backend/src/services/keyService.ts             │
│   Business logic: store, retrieve, rotate, delete │
│   Calls crypto module + repository + audit        │
└──────────────────────┬──────────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         │             │             │
┌────────▼─────┐ ┌────▼──────┐ ┌───▼──────────┐
│  Repository  │ │  Crypto   │ │ Audit Service│
│  keyRepo.ts  │ │  Module   │ │ (existing)   │
│  Prisma CRUD │ │ keyCrypto │ │ auditService │
│              │ │   .ts     │ │              │
└──────────────┘ └───────────┘ └──────────────┘
```

**Files to create**:

| File | Responsibility |
|------|---------------|
| `backend/src/utils/keyCrypto.ts` | `encrypt(pem, kek)`, `decrypt(record, kek)`, `deriveKey(kek, salt)`, `computeKeyFingerprint(pem)` |
| `backend/src/repositories/keyRepo.ts` | Prisma CRUD for `PrivateKey` model |
| `backend/src/services/keyService.ts` | Business logic: store, retrieve, rotate, delete with audit |
| `backend/src/routes/keys.ts` | Fastify route plugin: `POST/GET/DELETE /api/certificates/:id/keys`, `POST .../keys/retrieve`, `POST .../keys/rotate` |

**Files to modify**:

| File | Change |
|------|--------|
| `backend/src/config.ts` | Add `PRIVATE_KEY_ENCRYPTION_SECRET` to Zod schema (required, min 32 chars) |
| `backend/src/server.ts` | Register `keyRoutes` plugin |
| `backend/prisma/schema.prisma` | Add `PrivateKey` model, `KeyStatus` enum, extend `AuditAction` enum, add `keys` relation to `Certificate` |
| `shared/types/index.ts` | Export new `PrivateKeyMetadata`, `KeyStatus` types |
| `shared/types/certificate.ts` | Add optional `keyMetadata` field to `Certificate` type |

### 3.4 Crypto Module Design (`keyCrypto.ts`)

**Decision**: Stateless module with pure functions using Node.js `crypto`.

```typescript
// keyCrypto.ts — Public API

export interface EncryptedKeyData {
  encryptedData: Buffer;
  iv: Buffer;
  authTag: Buffer;
  salt: Buffer;
  algorithm: 'aes-256-gcm';
}

/** Encrypt a PEM private key */
export function encryptPrivateKey(pemData: string, kek: string): EncryptedKeyData;

/** Decrypt an encrypted key record back to PEM */
export function decryptPrivateKey(encrypted: EncryptedKeyData, kek: string): string;

/** Compute SHA-256 fingerprint of the public key extracted from a private key PEM */
export function computeKeyFingerprint(privateKeyPem: string): string;

/** Parse a PEM private key and extract algorithm + key size */
export function parsePrivateKeyMetadata(pem: string): { algorithm: string; keySize: number };

/** Validate that a string is a well-formed PEM private key */
export function validatePrivateKeyPem(pem: string): { valid: boolean; error?: string };
```

**Implementation details**:

1. **`encryptPrivateKey`**: Generates random salt (16 bytes) + IV (12 bytes), derives DEK via PBKDF2, encrypts with `crypto.createCipheriv('aes-256-gcm', ...)`.
2. **`decryptPrivateKey`**: Derives DEK from stored salt, decrypts with `crypto.createDecipheriv('aes-256-gcm', ...)`, verifies auth tag.
3. **`computeKeyFingerprint`**: Uses `node-forge` to parse the private key PEM, extract the public key, convert to DER, compute SHA-256.
4. **`parsePrivateKeyMetadata`**: Uses `node-forge` to detect RSA vs ECDSA and key size.
5. **`validatePrivateKeyPem`**: Checks PEM header/footer, attempts parse with `node-forge`.

**Error handling**: Decryption failure (wrong KEK, corrupted data, tampered auth tag) throws a typed `KeyDecryptionError` that the service layer catches and logs.

### 3.5 Scope Model Extension

**Decision**: Add 3 new scopes for key operations, separate from certificate scopes.

| Scope | Operations | Rationale |
|-------|-----------|-----------|
| `key:read` | `GET /api/certificates/:id/keys` (metadata only) | Low-risk read of non-sensitive data |
| `key:write` | `POST .../keys`, `POST .../keys/rotate` | Store and rotate keys |
| `key:retrieve` | `POST .../keys/retrieve` | High-risk: returns plaintext key. Separate from read for principle of least privilege |
| `key:delete` | `DELETE .../keys` | Irreversible destruction; separate scope |

**Why separate `key:retrieve` from `key:read`?**

Reading metadata (algorithm, fingerprint, status) is low-risk. Retrieving the actual plaintext private key is the most sensitive operation in the system. Separating scopes allows tokens to have `key:read` for monitoring/status checks without granting decryption access.

### 3.6 Frontend: Key Management Panel Component

**Decision**: New `KeyPanel` component embedded in `CertificateDetailPage`, following existing component patterns.

```
frontend/src/pages/CertificateDetail/components/
├── KeyPanel.tsx              # Main key panel component
├── KeyPanel.module.css       # Styles
├── KeyDownloadModal.tsx      # Reason-required download dialog
├── KeyUploadModal.tsx        # PEM file upload dialog
├── KeyDeleteModal.tsx        # Confirmation + reason dialog
└── KeyRotateModal.tsx        # New key upload for rotation
```

**Hooks**:
```
frontend/src/hooks/
├── useKeyMetadata.ts         # GET /api/certificates/:id/keys
├── useStoreKey.ts            # POST /api/certificates/:id/keys
├── useRetrieveKey.ts         # POST /api/certificates/:id/keys/retrieve
├── useRotateKey.ts           # POST /api/certificates/:id/keys/rotate
└── useDeleteKey.ts           # DELETE /api/certificates/:id/keys
```

**API client**:
```
frontend/src/services/keyApi.ts   # Axios calls for key endpoints
```

**Shared types**:
```typescript
// shared/types/key.ts
export type KeyStatus = 'ACTIVE' | 'ROTATED' | 'DELETED';

export interface PrivateKeyMetadata {
  keyId: string;
  certificateId: string;
  algorithm: string;
  fingerprint: string;
  status: KeyStatus;
  createdAt: string;
  rotatedAt: string | null;
  deletedAt: string | null;
  previousKeyId: string | null;
}
```

### 3.7 Config Validation Enhancement

**Decision**: Extend `backend/src/config.ts` Zod schema with conditional validation.

```typescript
PRIVATE_KEY_ENCRYPTION_SECRET: z
  .string()
  .min(32, 'PRIVATE_KEY_ENCRYPTION_SECRET must be at least 32 characters')
  .describe('Master key for encrypting private keys at rest (AES-256-GCM via PBKDF2)')
```

**Behavior**:
- In `production` and `test` environments: **required** — server fails to start if missing
- In `development`: has a default value for local dev convenience (a deterministic dev-only key), with a warning log
- Zod parse failure produces a clear error message naming the missing variable

---

## 4. Data Flow

### Store Private Key

```
Client → POST /api/certificates/:id/keys { privateKeyPem }
  → Auth middleware: verify token + scope "key:write"
    → keyRoutes.ts: validate body, extract params
      → keyService.store(certId, pemData, actor)
        → Validate PEM (keyCrypto.validatePrivateKeyPem)
        → Check no ACTIVE key exists for this cert (keyRepo)
        → Compute fingerprint (keyCrypto.computeKeyFingerprint)
        → Parse metadata (keyCrypto.parsePrivateKeyMetadata)
        → Encrypt (keyCrypto.encryptPrivateKey + config.PRIVATE_KEY_ENCRYPTION_SECRET)
        → keyRepo.create({ certificateId, algorithm, fingerprint, encryptedData, iv, authTag, salt })
        → auditService.log({ action: KEY_STORE, certificateId, actor, result: SUCCESS })
        → Return { keyId, certificateId, algorithm, fingerprint, status: ACTIVE }
```

### Retrieve (Decrypt) Private Key

```
Client → POST /api/certificates/:id/keys/retrieve { reason }
  → Auth middleware: verify token + scope "key:retrieve"
    → keyRoutes.ts: validate body (reason required)
      → keyService.retrieve(certId, reason, actor)
        → keyRepo.findActiveByCertId(certId)
          → Not found? → 404
          → Status DELETED? → 410
        → Decrypt (keyCrypto.decryptPrivateKey + config.PRIVATE_KEY_ENCRYPTION_SECRET)
          → Failure? → auditService.log(FAILURE) → 500 "Decryption failed"
        → auditService.log({ action: KEY_RETRIEVE, certificateId, actor, detail: reason })
        → Return { privateKeyPem }
          → Clear plaintext from memory after response sent
```

---

## 5. Consequences

### Positive

- **Keys encrypted at rest**: AES-256-GCM with per-record salt makes database breach ineffective without the KEK
- **Audit trail**: Every key access is logged with actor and reason — satisfies compliance audits
- **Backward compatible**: Existing CSR endpoint unchanged unless `storeKey=true` is explicitly passed
- **Scope separation**: `key:retrieve` is a distinct, high-privilege scope — tokens for monitoring don't get decryption access
- **Rotation tracking**: Full chain of key rotations is preserved via `previousKeyId` self-reference
- **Zero new dependencies**: Uses Node.js `crypto` (built-in) for encryption and existing `node-forge` for PEM parsing

### Negative

- **KEK management burden**: The `PRIVATE_KEY_ENCRYPTION_SECRET` env var must be backed up and rotated carefully. Loss = all keys unrecoverable.
- **No HSM**: Keys are software-encrypted in PostgreSQL, not in a hardware security module. Acceptable for MVP but may need upgrade for high-security environments.
- **PBKDF2 latency**: ~100-200ms per key operation due to 100K iterations. Acceptable for the expected low frequency of key operations.
- **Single KEK**: All keys are encrypted with the same KEK. A KEK rotation mechanism (re-encrypting all keys with a new KEK) is not in scope for MVP.
- **No external vault**: No integration with HashiCorp Vault, AWS KMS, or Azure Key Vault. Future feature.

### Risks

| Risk | Mitigation |
|------|-----------|
| KEK leak in logs/errors | Never log the KEK value; Zod parse error redacts the value; keyCrypto never includes KEK in error messages |
| KEK loss | Document backup procedure in ops runbook; health check verifies KEK presence on every startup |
| GCM nonce reuse | IV is generated via `crypto.randomBytes(12)` per record — collision probability negligible for <2^32 records |
| Memory exposure of plaintext keys | Plaintext key only exists in Node.js heap during request processing; no caching; GC handles cleanup |
| Migration complexity | Single new table + enum extension; no changes to existing certificate table data |

---

## 6. Acceptance Criteria Mapping

| Feature | AC Scenarios | Covered by Chunk(s) |
|---------|-------------|---------------------|
| F1: Encryption at rest | AC-1.1 to AC-1.4 (4 scenarios) | Chunk 2 (Crypto module) |
| F2: KEK validation | AC-2.1 to AC-2.3 (3 scenarios) | Chunk 1 (Config + Schema) |
| F3: Store key API | AC-3.1 to AC-3.5 (5 scenarios) | Chunk 3 (Key service + routes) |
| F4: Key metadata API | AC-4.1 to AC-4.3 (3 scenarios) | Chunk 3 (Key service + routes) |
| F5: Retrieve key API | AC-5.1 to AC-5.5 (5 scenarios) | Chunk 3 (Key service + routes) |
| F6: Key rotation | AC-6.1 to AC-6.3 (3 scenarios) | Chunk 4 (Rotation + deletion) |
| F7: Key deletion | AC-7.1 to AC-7.4 (4 scenarios) | Chunk 4 (Rotation + deletion) |
| F8: CSR integration | AC-8.1 to AC-8.3 (3 scenarios) | Chunk 5 (CSR enhancement) |
| F9: Frontend key panel | AC-9.1 to AC-9.5 (5 scenarios) | Chunk 6 (Frontend) |
| F10: Audit trail | AC-10.1 to AC-10.6 (6 scenarios) | Chunks 3, 4 (audit integrated in service layer) |

**Total**: 10 features, 41 acceptance scenarios, covered by 6 chunks.

---

## 7. Dependencies Between Chunks

```
Chunk 1 (DB schema + config)
  │
  ├──→ Chunk 2 (Crypto module — needs config for KEK)
  │       │
  │       └──→ Chunk 3 (Key service + routes — needs crypto + schema)
  │               │
  │               ├──→ Chunk 4 (Rotation + deletion — extends Chunk 3 service)
  │               │
  │               └──→ Chunk 5 (CSR integration — needs key service)
  │
  └──→ Chunk 6 (Frontend — needs API from Chunk 3)
         (can start UI scaffolding in parallel with Chunk 3,
          but full integration needs API ready)
```
