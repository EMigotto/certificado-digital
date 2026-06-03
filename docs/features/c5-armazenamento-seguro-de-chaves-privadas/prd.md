# PRD: C5. Secure Storage of Private Keys

**Feature ID**: C5  
**Slug**: `c5-armazenamento-seguro-de-chaves-privadas`  
**Status**: Specification  
**Created**: 2026-06-03  
**Target Release**: MVP (Phase 1)  

---

## Problem Statement

When the platform generates CSRs and key pairs (C2 Lifecycle, C7 API/CLI), private keys are either:

- **Returned once and discarded** (C7 CSR endpoint generates keys but does not store them — the caller must save the key themselves)
- **Not generated at all** (certificates imported via PEM/CSV never have a platform-managed private key)

This creates several operational gaps:

1. **No platform-managed key storage**: If a user loses the private key after CSR generation, they must regenerate from scratch
2. **No renewal with same key**: The C2 lifecycle "Keep Same Key" renewal strategy requires the platform to retain the original private key — currently impossible
3. **No key rotation tracking**: There is no record of which private key is associated with which certificate
4. **Plaintext risk**: The C7 CSR endpoint returns keys in the response body. If the platform were to store keys, they must NEVER be in plaintext at rest
5. **No access control**: There is no mechanism to restrict who can retrieve a stored private key
6. **Compliance gaps**: Regulatory frameworks (PCI-DSS, SOC 2) require encryption at rest and audit trails for key access

**Impact**: Operational risk (lost keys → certificate re-issuance), security risk (plaintext keys in DB), compliance failures, inability to support key-rotation-aware renewals.

---

## Users & Jobs to Be Done (JTBD)

### User Personas

1. **PKI Administrator**
   - Role: Manages certificate lifecycle; needs to store keys for renewal
   - Job: Generate CSR + private key on-platform and store securely for future renewals
   - Tools: Web UI, API

2. **Platform Engineer / DevOps**
   - Role: Deploys services; needs to download private keys for TLS termination
   - Job: Retrieve the private key for a certificate to configure a load balancer or service
   - Tools: API, CLI

3. **Security Officer**
   - Role: Ensures key material is encrypted at rest and access is audited
   - Job: Verify that no private key is stored in plaintext; audit who accessed which key and when
   - Tools: Audit logs, compliance reports

### Jobs to Be Done

| User | JTBD |
|------|------|
| PKI Admin | **Store the private key** generated during CSR creation so it can be used for certificate renewal without regeneration |
| PKI Admin | **Retrieve a stored private key** for a specific certificate to deploy it on a new server |
| Platform Engineer | **Download a private key via API/CLI** for automated deployment (e.g., inject into Kubernetes secret) |
| Platform Engineer | **Rotate a private key** during certificate renewal and track the rotation in audit |
| Security Officer | **Verify encryption at rest**: confirm that no private key is stored in plaintext in the database |
| Security Officer | **Audit key access**: see immutable log of who retrieved, rotated, or deleted a key |
| Any User | **Delete a private key** when it is no longer needed (e.g., after cert expiry or revocation) |

---

## Functional Scope

### 1. Private Key Storage Model

Each private key record is associated with exactly one certificate and stores:

- **Key ID**: Unique identifier (UUID)
- **Certificate ID**: FK to the Certificate model
- **Algorithm**: RSA-2048, RSA-4096, ECDSA-P256, ECDSA-P384
- **Key fingerprint**: SHA-256 hash of the public key (for verification without decryption)
- **Encrypted key data**: The private key PEM, encrypted with AES-256-GCM
- **Encryption metadata**: IV, auth tag, key derivation salt (all needed for decryption)
- **Storage status**: `ACTIVE`, `ROTATED`, `DELETED`
- **Created at / Rotated at / Deleted at**: Timestamps

### 2. Encryption at Rest (AES-256-GCM)

**Requirement**: Private keys MUST be encrypted before being written to the database. The encryption key (KEK — Key Encryption Key) is derived from an environment variable, never hardcoded.

#### 2.1 Key Encryption Key (KEK) Derivation

- **Source**: Environment variable `PRIVATE_KEY_ENCRYPTION_SECRET` (minimum 32 characters)
- **Derivation**: PBKDF2 with SHA-512, 100,000 iterations, 32-byte output
- **Salt**: Unique per-record, stored alongside the ciphertext
- **Validation**: Backend startup MUST fail if `PRIVATE_KEY_ENCRYPTION_SECRET` is not set or is too short

#### 2.2 Encryption Process

1. Generate random 12-byte IV and 16-byte salt
2. Derive AES-256 key from KEK using PBKDF2 + salt
3. Encrypt private key PEM with AES-256-GCM using IV
4. Store: `{ciphertext, iv, authTag, salt, algorithm: "aes-256-gcm"}`

#### 2.3 Decryption Process

1. Read `{ciphertext, iv, authTag, salt}` from DB
2. Derive AES-256 key from KEK using PBKDF2 + salt
3. Decrypt with AES-256-GCM using IV and authTag
4. Return plaintext PEM
5. **Never cache** decrypted key material in memory beyond the request lifecycle

### 3. API Endpoints

#### 3.1 POST /api/certificates/:id/keys — Store a Private Key

- **Auth**: Requires scope `key:write`
- **Body**: `{ privateKeyPem: string }` (PEM-encoded private key)
- **Behavior**: Encrypt and store the key; associate with certificate
- **Response**: `{ keyId, certificateId, algorithm, fingerprint, status: "ACTIVE", createdAt }`
- **Validation**: 
  - Private key PEM must be valid and parseable
  - Certificate must exist
  - Certificate must not already have an ACTIVE key (use rotation endpoint instead)
- **Errors**: 400 (invalid PEM), 404 (cert not found), 409 (key already exists)

#### 3.2 GET /api/certificates/:id/keys — Get Key Metadata (no decryption)

- **Auth**: Requires scope `key:read`
- **Response**: `{ keyId, certificateId, algorithm, fingerprint, status, createdAt, rotatedAt }`
- **Note**: Does NOT return the actual private key — only metadata

#### 3.3 POST /api/certificates/:id/keys/retrieve — Retrieve (Decrypt) Private Key

- **Auth**: Requires scope `key:retrieve`
- **Body**: `{ reason: string }` (mandatory justification for audit trail)
- **Response**: `{ privateKeyPem: string }`
- **Audit**: Creates immutable audit entry: `{ action: "KEY_RETRIEVE", actor, certificateId, reason, timestamp }`
- **Errors**: 404 (no key for this cert), 410 (key was deleted)

#### 3.4 POST /api/certificates/:id/keys/rotate — Rotate Private Key

- **Auth**: Requires scope `key:write`
- **Body**: `{ newPrivateKeyPem: string }` (new key PEM)
- **Behavior**: 
  - Mark current key as `ROTATED`
  - Store new key as `ACTIVE`
  - Link old and new key records via `previousKeyId`
- **Audit**: Creates audit entry: `{ action: "KEY_ROTATE", actor, certificateId, oldKeyId, newKeyId }`
- **Response**: `{ keyId (new), previousKeyId, status: "ACTIVE", fingerprint }`

#### 3.5 DELETE /api/certificates/:id/keys — Delete (Destroy) Private Key

- **Auth**: Requires scope `key:delete`
- **Body**: `{ reason: string }` (mandatory justification)
- **Behavior**: Overwrite encrypted data with zeros, set status to `DELETED`
- **Audit**: Creates audit entry: `{ action: "KEY_DELETE", actor, certificateId, reason }`
- **Irreversible**: Cannot be undone
- **Response**: `{ keyId, status: "DELETED", deletedAt }`

### 4. CSR Integration

When the existing CSR endpoint (`POST /api/csr`) generates a key pair:

- **New parameter**: `storeKey: boolean` (default: `false`)
- If `storeKey: true` AND a `certificateId` is provided:
  - Encrypt and store the generated private key
  - Return key metadata in the response (not the plaintext key)
- If `storeKey: false` (default, backward-compatible):
  - Return private key PEM in response as currently implemented
  - Do NOT store the key

### 5. Frontend — Key Management Panel

On the Certificate Detail page, add a **Private Key** section:

- **If key exists (ACTIVE)**:
  - Show: algorithm, fingerprint, creation date
  - Actions: "Download Key" (prompts for reason), "Rotate Key", "Delete Key"
  - "Download Key" opens a confirmation modal requiring a reason text
  - Downloaded key is served as a file download, never displayed in the UI
- **If key exists (ROTATED)**:
  - Show: rotation history (old → new fingerprints, timestamps)
- **If no key**:
  - Show: "No private key stored for this certificate"
  - Action: "Upload Key" (for manually associating a key with an imported cert)
- **If key deleted**:
  - Show: "Private key was deleted on [date]"

### 6. Audit Trail

All key operations create immutable audit entries:

| Action | Detail |
|--------|--------|
| `KEY_STORE` | Private key encrypted and stored |
| `KEY_RETRIEVE` | Private key decrypted and returned (reason logged) |
| `KEY_ROTATE` | Old key marked ROTATED, new key stored |
| `KEY_DELETE` | Key material destroyed |

Audit entries include: actor, timestamp, certificateId, keyId, reason/detail, result (SUCCESS/FAILURE).

---

## Out of Scope

1. **HSM integration**: Keys are encrypted in PostgreSQL; no Hardware Security Module in MVP
2. **External vault integration**: No HashiCorp Vault, AWS KMS, or Azure Key Vault integration in MVP
3. **Key escrow / recovery**: If KEK is lost, encrypted keys are unrecoverable (by design)
4. **Automatic key rotation**: Rotation is manual (triggered by user or renewal process)
5. **Key sharing across certificates**: One key per certificate; no key reuse tracking
6. **Client-side encryption**: Keys are encrypted server-side; browser-based encryption is not in scope
7. **Multi-KEK support**: Single KEK for all keys; key versioning for KEK rotation is future work
8. **PKCS#11 / KMIP protocols**: Not in MVP

---

## Risks & Assumptions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| KEK leakage (env var exposed) | Low | Critical — all keys compromised | Restrict env var access; rotate KEK periodically; document secure deployment |
| KEK loss (env var not backed up) | Medium | Critical — all keys unrecoverable | Document backup procedure; health check on startup |
| Performance degradation (PBKDF2 per request) | Low | Slow key retrieval (~200ms added) | PBKDF2 with 100K iterations adds ~100-200ms; acceptable for infrequent key operations |
| Database breach exposes ciphertext | Medium | Low impact if encryption is correct | AES-256-GCM with per-record salt; attacker needs KEK to decrypt |
| Audit log tampering | Low | Compliance failure | Audit entries are immutable (append-only, no UPDATE/DELETE) |

### Assumptions

1. PostgreSQL is used for encrypted key storage (no external vault in MVP)
2. `PRIVATE_KEY_ENCRYPTION_SECRET` is provisioned securely via CI/CD secrets or platform config
3. Key retrieval is an infrequent operation (< 10 requests/minute expected)
4. One private key per certificate (1:1 relationship)
5. Node.js `crypto` module provides FIPS-compatible AES-256-GCM
6. Frontend never displays raw private key material; download only

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Encryption correctness | 100% of stored keys encrypted with AES-256-GCM; no plaintext in DB |
| Key retrieval latency | < 500ms (including PBKDF2 derivation + DB lookup + decryption) |
| Audit coverage | 100% of key operations logged in audit trail |
| Startup validation | Server refuses to start if KEK env var is missing/invalid |
| Key deletion | Ciphertext overwritten with zeros on delete; unrecoverable |

---

## Related Features

- **C2. Lifecycle**: Renewal with "Keep Same Key" requires stored private key
- **C7. API & CLI**: CSR generation can optionally store generated key; CLI retrieval
- **C1. Inventory**: Certificate detail page extended with key management panel
- **C3. Monitoring**: No direct dependency
