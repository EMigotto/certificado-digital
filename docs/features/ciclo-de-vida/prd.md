# PRD: C2. Ciclo de Vida Basico (Issue / Renew / Revoke)

**Feature ID**: C2  
**Slug**: ciclo-de-vida  
**Status**: Specification  
**Created**: 2026-05-28  
**Target Release**: MVP (Phase 1)  

---

## Problem Statement

Organizations managing mTLS infrastructure must **issue, renew, and revoke certificates** throughout their lifecycle. Today:

- Certificate issuance requires manual submission to multiple CAs (Vault, ACM, external) with inconsistent workflows
- No unified renewal process; teams manually track expiration and perform ad-hoc renewals
- Manual renewal risks service downtime if missed; no automation or nudging
- Key rotation (security best practice) is not enforced or tracked
- Revocation is opaque; no clear reason codes, audit trails, or owner notification
- No single UI/API to manage the full lifecycle
- Compliance gaps: RFC 5280 revocation reasons not enforced

**Impact**: Operational risk (unplanned outages), security gaps (stale/compromised keys not rotated), audit failures.

---

## Users & Jobs to Be Done (JTBD)

### User Personas

1. **PKI Administrator**
   - Role: Issues and revokes certificates, manages lifecycle policies
   - Job: Quickly issue, renew, and revoke certs with clear audit trails
   - Tools: Vault, ACM, PKI dashboards

2. **Platform Engineer**
   - Role: Manages service deployments; coordinates cert renewals with release cycles
   - Job: Know when renewal is needed; deploy new certs with minimal friction
   - Tools: CI/CD, deployment platforms, monitoring

3. **Security Officer**
   - Role: Ensures certs are rotated, compromised keys are revoked immediately
   - Job: Track revocation reasons, audit who revoked what and when
   - Tools: Audit logs, compliance reports

4. **Developer / Operator**
   - Role: Consumes certs in services
   - Job: Get certificate issued/renewed quickly; understand status and next action
   - Tools: CLI, API, service config

### Jobs to Be Done

| User | JTBD |
|------|------|
| PKI Admin | **Issue a certificate** by generating CSR on-platform (with private key stored securely) OR uploading external CSR within 60 seconds via UI |
| PKI Admin | **Submit CSR to CA** (Vault PKI or generic REST CA) automatically without manual copy-paste |
| PKI Admin | **Renew an expiring cert** with option to rotate the private key (RFC 5280 / security best practice) |
| Platform Engineer | **Receive renewal nudge** 30 days before expiration and know required actions |
| Security Officer | **Revoke a compromised cert** with RFC 5280 reason code (keyCompromise, superseded, etc.) |
| Security Officer | **Audit revocations** with immutable logs: who, when, why |
| Operator | **Issue/renew/revoke via API** in CI/CD pipelines or scripts |
| Any User | **Track certificate status** after issuance (pending, issued, active, expiring, revoked) |

---

## Functional Scope

### 1. Certificate Lifecycle Status States

A certificate moves through these states:

| State | Description |
|-------|-------------|
| **PENDING** | CSR submitted to CA, awaiting issuance |
| **ISSUED** | Certificate received from CA; ready for deployment |
| **ACTIVE** | Certificate is in use and valid |
| **EXPIRING_SOON** | Certificate is valid but < 30 days to expiration |
| **RENEWED** | A renewal CSR has been submitted; old cert still active |
| **REVOKED** | Certificate has been revoked; no longer valid |
| **EXPIRED** | notAfter date has passed |

Transitions:
- PENDING -> ISSUED -> ACTIVE
- ACTIVE -> EXPIRING_SOON -> EXPIRED
- ACTIVE -> RENEWED (old cert) + ISSUED (new cert)
- ACTIVE / ISSUED -> REVOKED (any state)
- REVOKED -> EXPIRED (after notAfter)

### 2. Issue Certificate (Sub-feature)

#### 2.1 CSR Generation or Upload

**Requirement**: User can generate a CSR on-platform with a private key stored in the system, OR upload an externally-generated CSR.

**Generate Mode**:
- Input: CN, SANs, Algorithm (RSA 2048/4096, ECDSA P-256/P-384), Organization, keyUsage
- Output: CSR (PEM) + Private Key (stored in secure vault or encrypted in DB)
- Private key is **never** exposed in UI; kept server-side
- UI shows fingerprint/checksum only, for verification

**Upload Mode**:
- User uploads CSR PEM file
- System validates CSR structure and extracts CN/SANs/algorithm
- User confirms extracted fields before submission
- No private key is required (external CSR assumed to have private key elsewhere)

#### 2.2 CA Integration & Submission

**Requirement**: Submit CSR to one or more CAs via API/REST without manual intervention.

**Supported CAs (MVP)**:
- Vault PKI: via Vault HTTP API (generate or import CSR endpoint)
- Generic REST CA: custom endpoint (POST /issue with CSR PEM in body)
- Future: AWS ACM PCA, other CAs (extensible)

**CA Response**:
- CA returns issued certificate (PEM) + chain
- System stores certificate metadata (serial, notBefore, notAfter, algorithm, SANs)
- Status transitions to ISSUED
- Private key (if generated on-platform) is linked to certificate

#### 2.3 Validation & Checks

Before submission, system verifies:
- CN format (FQDN or valid DNS pattern)
- No duplicate active certificate with same CN + zone
- CA connectivity (health check)
- User authorization (owner can issue in their zone)

#### 2.4 Issue Flow (UI & API)

**UI Flow** (< 60 seconds):
1. User navigates to "Issue Certificate"
2. Choose CSR Source: Generate or Upload
3. Fill CN, SANs, Algorithm, CA, Owner, Zone, Tags
4. See validation status (live)
5. Click "Submit to CA & Issue"
6. Poll for CA response (show spinner)
7. On success: redirect to certificate detail page
8. Audit log entry created

**API Endpoint**:
```
POST /api/certificates/issue
Body: { cn, sans[], ca_id, algorithm, validity_days, owner, zone, tags[] }
Response: { id, cn, status: "PENDING", created_at, ...metadata }
Polling: GET /api/certificates/{id} -> check status field
```

### 3. Renew Certificate (Sub-feature)

#### 3.1 Manual Renewal Trigger

**Requirement**: User manually initiates renewal on an active/expiring certificate with option to rotate the private key.

**Renewal Strategies**:

| Strategy | Description | Use Case |
|----------|-------------|----------|
| **Keep Same Key** | Reuse existing private key; generate new CSR; submit to CA | Fast renewal; key still secure |
| **Rotate Key** | Generate new CSR with new private key; submit to CA; mark old key for rotation | Best practice; periodic rotation; compromised key scenario |

User selects strategy before submission.

#### 3.2 CSR Generation for Renewal

- If Keep Same Key: extract existing private key; generate new CSR
- If Rotate Key: generate new private key + CSR
- Submit CSR to same CA (configurable)
- New certificate issued by CA

#### 3.3 Old Certificate Handling

During renewal, the old certificate:
- Remains ACTIVE until new certificate is ready
- Gets status flag: "has pending renewal"
- Not revoked automatically (team decides when to switch)
- Audit log shows relationship between old and new cert (renewal_parent_id, renewal_child_id)

New certificate:
- Starts as PENDING (awaiting CA response)
- Transitions to ISSUED when CA responds
- Linked to old cert via parent reference

#### 3.4 Key Rotation Notification

If Rotate Key is chosen:
- System generates notification for owning team
- Email includes: new certificate fingerprint, new key thumbprint, recommended deployment window
- Owner must re-deploy service with new key before old cert expires
- Audit log shows notification sent

#### 3.5 Renewal Flow (UI & API)

**UI Flow**:
1. User navigates to certificate detail page
2. Sees "Renewal" button if certificate is within 30 days of expiration
3. Clicks Renewal button
4. Choose strategy: Keep Same Key OR Rotate Key
5. Confirm validity period (default: same as original)
6. If Rotate Key: confirm notification will be sent
7. Click "Submit Renewal to CA"
8. Poll for response; show status
9. On success: show new certificate detail; allow side-by-side comparison
10. Audit entry created

**API Endpoint**:
```
POST /api/certificates/{id}/renew
Body: { rotate_key: bool, validity_days: int }
Response: { 
  old_id: id,
  new_id: id,
  new_status: "PENDING",
  notification_sent: bool
}
Polling: GET /api/certificates/{new_id} -> check status
```

### 4. Revoke Certificate (Sub-feature)

#### 4.1 Revocation with Reason Code (RFC 5280)

**Requirement**: Revoke a certificate and specify the revocation reason code per RFC 5280.

**Supported Reason Codes**:
- unspecified (0)
- keyCompromise (1)
- cACompromise (2)
- affiliationChanged (3)
- superseded (4)
- cessationOfOperation (5)
- certificateHold (6)
- removeFromCRL (8)
- other custom reasons (extensible)

User selects reason code from dropdown + provides optional justification text for audit trail.

#### 4.2 CA Revocation Submission

Submit revocation request to CA via API:
- Vault PKI: revoke endpoint with serial number
- Generic REST CA: POST /revoke with certificate serial + reason code
- Wait for CA confirmation
- Store revocation metadata: reason_code, revocation_timestamp, revoked_by_user, revocation_justification

#### 4.3 Local State & CRL/OCSP

System transitions certificate to REVOKED status locally and:
- Marks notAfter as still valid (cert is NOT expired, but no longer trusted)
- Stores revocation_timestamp and reason_code
- Audit log entry with reason and justification
- Certificate appears in inventory with REVOKED badge

CRL/OCSP updates happen downstream (CA-side); system tracks that revocation was submitted.

#### 4.4 Owner Notification

Optional: send email to owning team notifying revocation with reason code.
- Email includes: old certificate CN, reason, timestamp, replacement cert ID (if available)

#### 4.5 Revocation Flow (UI & API)

**UI Flow**:
1. User navigates to certificate detail page
2. Clicks "Revoke" button (visible for ACTIVE or ISSUED certs)
3. See warning: "This action is irreversible"
4. Select revocation reason code from RFC 5280 dropdown
5. Add optional justification text ("Service retired", "Key compromised", etc.)
6. Check "Notify owner" (default: checked)
7. Click "Confirm Revocation"
8. System submits to CA; show spinner
9. On success: redirect to certificate detail; show REVOKED badge
10. Audit entry created with reason code and justification

**API Endpoint**:
```
POST /api/certificates/{id}/revoke
Body: { reason: "keyCompromise|superseded|...", comment: "Justification text", notify_owner: bool }
Response: { id, status: "REVOKED", revocation_timestamp, reason_code, revoked_by }
```

### 5. Database Schema (Prisma Model)

```prisma
model Certificate {
  id String @id @default(cuid())
  
  // Identity
  cn String
  sans String[] // JSON array of DNS/IP
  serial String @unique // CA serial number
  fingerprint String // SHA256
  
  // Validity & Lifecycle
  notBefore DateTime
  notAfter DateTime
  daysUntilExpiry Int @db.Computed // (notAfter - now).days
  status String // PENDING, ISSUED, ACTIVE, EXPIRING_SOON, RENEWED, REVOKED, EXPIRED
  
  // Cryptography
  algorithm String // RSA2048, RSA4096, ECDSA_P256, ECDSA_P384
  keySize Int // 2048, 4096, 256, 384
  signatureAlgorithm String // SHA256WithRSA, SHA256WithECDSA, etc.
  
  // Issuer & CA
  caId String // e.g. "vault-prd", "acm-pca-1"
  caName String
  issuerDN String // /C=US/O=Acme/CN=Acme Root CA
  
  // Organization
  organization String // from CSR
  organizationalUnit String
  countryCode String
  
  // Ownership & Governance
  owner String // team name
  zone String // environment group
  environment String // prd, hml, dev
  tags String[] // JSON array of tags
  
  // Certificate Family (for renewals)
  renewalParentId String? // if this is a renewal, point to old cert
  renewalChildId String? // if renewed, point to new cert
  
  // Revocation
  revocationTimestamp DateTime?
  revocationReason String? // keyCompromise, superseded, etc.
  revocationJustification String?
  revokedBy String? // user ID
  
  // Private Key (only if generated on-platform)
  privateKeyId String? // reference to vault/KMS
  privateKeyAlgorithm String? // for on-platform generated certs
  
  // Metadata
  createdAt DateTime @default(now())
  createdBy String // user ID
  updatedAt DateTime @default(now())
  updatedBy String
  
  // Audit trail
  auditLog CertificateAuditLog[]
  
  // Relationships
  zone Zone @relation(fields: [zoneId], references: [id])
  zoneId String
  ca CA @relation(fields: [caId], references: [id])
}

model CertificateAuditLog {
  id String @id @default(cuid())
  certificateId String
  certificate Certificate @relation(fields: [certificateId], references: [id])
  
  action String // CREATED, ISSUED, RENEWED, REVOKED, KEY_ROTATED
  actor String // user ID or system
  timestamp DateTime @default(now())
  details String // JSON: reason, old_status, new_status, etc.
  result String // SUCCESS, FAILURE
  errorMessage String?
}

model CA {
  id String @id
  name String
  type String // VAULT_PKI, REST_CA, AWS_ACM_PCA
  endpoint String // URL
  apiKey String @db.Text() // encrypted
  tlsCert String? // for mTLS
  isActive Boolean @default(true)
  certificates Certificate[]
}
```

### 6. API Endpoints (REST)

#### Issue
- `POST /api/certificates/issue` — Submit new CSR to CA

#### Renew
- `POST /api/certificates/{id}/renew` — Renew certificate with optional key rotation
- `GET /api/certificates/{id}/renewal-options` — Check if renewal is possible

#### Revoke
- `POST /api/certificates/{id}/revoke` — Revoke with reason code
- `GET /api/certificates/{id}/revocation-reasons` — List RFC 5280 reason codes

#### Status & Polling
- `GET /api/certificates/{id}` — Get current certificate status
- `GET /api/certificates/{id}/timeline` — View issue -> renew -> revoke history

#### Audit
- `GET /api/certificates/{id}/audit` — View audit log for certificate

---

## Out of Scope

- **Automated renewal scheduling**: Not triggered automatically; user initiates manually (future feature)
- **CRL distribution & OCSP responder**: CA-side responsibility; we track revocations locally
- **Private key backup/recovery**: Keys stored in vault; no export/backup in MVP
- **Intermediate CA issuance**: Only end-entity certificates in MVP
- **Cross-signing**: Not supported in MVP
- **Smart card / HSM integration**: Not in MVP (keys stored in software vault or encrypted in DB)
- **Batch issue/renew**: Single certificate operations only in MVP (bulk future)
- **Custom validation rules**: Only RFC 5280 standard checks in MVP

---

## Acceptance Criteria

See `acceptance-criteria.md` for detailed Gherkin scenarios covering:
- Issue: CSR generation, CA submission, validation, error handling
- Renew: key rotation, notification, old/new cert handling
- Revoke: reason code selection, notification, state transitions
- Positive and negative scenarios for each

---

## Risks & Assumptions

### Risks

1. **CA Integration Delays**: If Vault/CA API changes, issuance may fail
   - Mitigation: Implement robust error handling; support fallback CA

2. **Private Key Security**: On-platform generated keys must be encrypted at rest
   - Mitigation: Use PostgreSQL encryption + Vault for sensitive keys

3. **Key Rotation Coordination**: Service teams may not redeploy new keys in time
   - Mitigation: Enforce pre-expiration notification; require ACK before old cert expires

4. **Revocation Latency**: CRL/OCSP updates may lag (CA-side)
   - Mitigation: Document that revocation is submitted but may take 5-15min to propagate

5. **Audit Log Tampering**: Malicious actor revokes cert without authorization
   - Mitigation: RBAC on revoke endpoint; audit log is immutable post-creation

### Assumptions

1. CA endpoints (Vault PKI, REST API) are stable and reachable within 5s
2. Private keys generated on-platform are stored securely (DB encryption + Vault)
3. Users have authorization context (owner field correlates to their team/zone)
4. Renewal is **not** automatic; user/CI-CD initiates manually
5. RFC 5280 reason codes are sufficient; no custom reasons in MVP
6. Revocation reason codes are correctly reported to CA (Vault/REST endpoint supports them)

---

## Success Criteria (MVP)

1. **Issue**: User can issue a test certificate (CSR to CA) within 60 seconds via UI and API
2. **Renew**: User can renew a certificate with key rotation option within 60 seconds via UI and API
3. **Revoke**: User can revoke with RFC 5280 reason code within 30 seconds via UI and API
4. **Audit**: All actions (issue, renew, revoke) are logged with actor, timestamp, reason
5. **State Tracking**: Certificate status is accurate and updates in real-time as CA responds

---

## Metrics & Telemetry

Track:
- `certificates_issued_total` (gauge, by CA)
- `certificates_renewed_total` (gauge, key_rotation_yes/no)
- `certificates_revoked_total` (gauge, by reason_code)
- `issue_latency_seconds` (histogram, CA submission to ISSUED)
- `renewal_latency_seconds` (histogram)
- `revoke_latency_seconds` (histogram)
- `key_rotation_adoption_percent` (renewal with rotate_key=true)

---

## Timeline & Rollout

- **MVP**: Issue, Renew (no auto-rotation), Revoke with RFC 5280 reason codes
- **Phase 2**: Automated renewal scheduling, multiple CA support expansion
- **Phase 3**: Advanced: smart card integration, cross-signing, bulk operations

---

## Related Features

- **C1. Inventory**: Uses certificate data model; inventory list shows lifecycle status
- **C3. Monitoring & Alerts**: Alerts on expiration; triggers renewal suggestions
- **API & CLI**: All lifecycle operations exposed via API; CLI wrapper available
