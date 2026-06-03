# C5. Secure Storage of Private Keys — Acceptance Criteria (Gherkin)

## Feature 1: Private Key Encryption at Rest

```gherkin
Feature: Private Key Encryption at Rest
  As a security officer
  I want all private keys encrypted with AES-256-GCM before storage
  So that a database breach does not expose plaintext key material

  Scenario: AC-1.1 — Private key is encrypted before storage
    Given a valid RSA-2048 private key in PEM format
    And the environment variable PRIVATE_KEY_ENCRYPTION_SECRET is configured
    When the key is stored via POST /api/certificates/:id/keys
    Then the database column "encrypted_key_data" contains ciphertext (not PEM text)
    And the database stores: iv (12 bytes), auth_tag (16 bytes), salt (16 bytes)
    And the encryption algorithm recorded is "aes-256-gcm"

  Scenario: AC-1.2 — Encrypted key can be decrypted back to original PEM
    Given a private key was stored for certificate "cert-123"
    When the key is retrieved via POST /api/certificates/cert-123/keys/retrieve
    Then the returned privateKeyPem matches the original PEM exactly (byte-for-byte)

  Scenario: AC-1.3 — Each key record uses a unique salt and IV
    Given two private keys stored for different certificates
    When I inspect the database records
    Then the iv values are different
    And the salt values are different
    And the ciphertext values are different (even if the source keys are identical)

  Scenario: AC-1.4 — Tampering with ciphertext is detected (GCM auth tag)
    Given a private key was stored for certificate "cert-123"
    When the ciphertext bytes are modified directly in the database
    And a retrieval is attempted via POST /api/certificates/cert-123/keys/retrieve
    Then the request fails with a 500 error
    And the error message indicates "Decryption failed — data integrity check failed"
    And an audit entry is created with result "FAILURE"
```

## Feature 2: KEK (Key Encryption Key) Validation

```gherkin
Feature: KEK Configuration and Startup Validation
  As an infrastructure engineer
  I want the server to refuse to start without a valid encryption secret
  So that private keys are never stored without encryption

  Scenario: AC-2.1 — Server fails to start without PRIVATE_KEY_ENCRYPTION_SECRET
    Given PRIVATE_KEY_ENCRYPTION_SECRET is not set in the environment
    When the backend server attempts to start
    Then the server exits with a non-zero code
    And the error log contains "PRIVATE_KEY_ENCRYPTION_SECRET is required"

  Scenario: AC-2.2 — Server fails to start with a too-short secret
    Given PRIVATE_KEY_ENCRYPTION_SECRET is set to "short" (< 32 characters)
    When the backend server attempts to start
    Then the server exits with a non-zero code
    And the error log contains "PRIVATE_KEY_ENCRYPTION_SECRET must be at least 32 characters"

  Scenario: AC-2.3 — Server starts successfully with valid secret
    Given PRIVATE_KEY_ENCRYPTION_SECRET is set to a 64-character random string
    When the backend server starts
    Then the server starts successfully
    And a health check to GET /health returns 200
```

## Feature 3: Store Private Key API

```gherkin
Feature: Store Private Key
  As a PKI administrator
  I want to store a private key associated with a certificate
  So that I can retrieve it later for renewals or deployments

  Scenario: AC-3.1 — Successfully store a valid private key
    Given a certificate with id "cert-123" exists
    And no private key is currently stored for this certificate
    When I POST to /api/certificates/cert-123/keys with:
      | privateKeyPem | "-----BEGIN RSA PRIVATE KEY-----\n..." |
    Then I receive a 201 response
    And the response includes:
      | keyId          | (UUID)         |
      | certificateId  | "cert-123"     |
      | algorithm      | "RSA-2048"     |
      | fingerprint    | (SHA-256 hash) |
      | status         | "ACTIVE"       |
      | createdAt      | (now)          |
    And an audit entry is created with action "KEY_STORE"

  Scenario: AC-3.2 — Reject storage when key already exists for certificate
    Given a certificate with id "cert-123" has an ACTIVE private key stored
    When I POST to /api/certificates/cert-123/keys with a new private key PEM
    Then I receive a 409 response
    And the error message is "Certificate already has an active private key. Use rotation endpoint."

  Scenario: AC-3.3 — Reject invalid PEM format
    Given a certificate with id "cert-123" exists
    When I POST to /api/certificates/cert-123/keys with:
      | privateKeyPem | "not-a-valid-pem-string" |
    Then I receive a 400 response
    And the error message mentions "Invalid private key PEM format"

  Scenario: AC-3.4 — Reject storage for non-existent certificate
    Given no certificate with id "nonexistent" exists
    When I POST to /api/certificates/nonexistent/keys with a valid private key PEM
    Then I receive a 404 response
    And the error message is "Certificate not found"

  Scenario: AC-3.5 — Reject if caller lacks key:write scope
    Given a service token with scope "cert:read" only
    When I POST to /api/certificates/cert-123/keys with a valid private key PEM
    Then I receive a 403 response
```

## Feature 4: Key Metadata API

```gherkin
Feature: Key Metadata (No Decryption)
  As a platform engineer
  I want to check if a certificate has a stored key and see its metadata
  So that I know whether to request the key or generate a new one

  Scenario: AC-4.1 — Get key metadata for certificate with stored key
    Given a certificate "cert-123" has an ACTIVE private key
    When I GET /api/certificates/cert-123/keys
    Then I receive a 200 response
    And the response includes:
      | keyId         | (UUID)            |
      | certificateId | "cert-123"        |
      | algorithm     | "RSA-2048"        |
      | fingerprint   | (SHA-256)         |
      | status        | "ACTIVE"          |
      | createdAt     | (timestamp)       |
    And the response does NOT include "privateKeyPem" or any ciphertext

  Scenario: AC-4.2 — Get metadata for certificate with no stored key
    Given a certificate "cert-456" has no private key stored
    When I GET /api/certificates/cert-456/keys
    Then I receive a 404 response
    And the error message is "No private key stored for this certificate"

  Scenario: AC-4.3 — Get metadata for deleted key shows deleted status
    Given a certificate "cert-789" had a key that was deleted
    When I GET /api/certificates/cert-789/keys
    Then I receive a 200 response
    And the response includes:
      | status    | "DELETED"          |
      | deletedAt | (timestamp)        |
```

## Feature 5: Retrieve (Decrypt) Private Key API

```gherkin
Feature: Retrieve Private Key (Decrypt and Return)
  As a DevOps engineer
  I want to download the private key for deployment
  So that I can configure TLS termination on my services

  Scenario: AC-5.1 — Successfully retrieve private key with reason
    Given a certificate "cert-123" has an ACTIVE private key
    And I have scope "key:retrieve"
    When I POST to /api/certificates/cert-123/keys/retrieve with:
      | reason | "Deploying to production load balancer" |
    Then I receive a 200 response
    And the response includes:
      | privateKeyPem | "-----BEGIN RSA PRIVATE KEY-----\n..." |
    And an audit entry is created with:
      | action | "KEY_RETRIEVE"                           |
      | detail | "Deploying to production load balancer"  |

  Scenario: AC-5.2 — Retrieval requires a reason (mandatory field)
    Given a certificate "cert-123" has an ACTIVE private key
    When I POST to /api/certificates/cert-123/keys/retrieve without a reason
    Then I receive a 400 response
    And the error message is "Reason is required for key retrieval (audit trail)"

  Scenario: AC-5.3 — Retrieval of deleted key fails with 410
    Given a certificate "cert-789" had a key that was deleted
    When I POST to /api/certificates/cert-789/keys/retrieve with reason "Need key"
    Then I receive a 410 response
    And the error message is "Private key has been permanently deleted"

  Scenario: AC-5.4 — Retrieval without key:retrieve scope is rejected
    Given a service token with scope "key:read" only (no "key:retrieve")
    When I POST to /api/certificates/cert-123/keys/retrieve
    Then I receive a 403 response

  Scenario: AC-5.5 — Every retrieval creates an audit entry
    Given a certificate "cert-123" has an ACTIVE private key
    When I retrieve the key 3 times with different reasons
    Then 3 audit entries exist with action "KEY_RETRIEVE"
    And each entry has a different reason and timestamp
```

## Feature 6: Key Rotation

```gherkin
Feature: Private Key Rotation
  As a PKI administrator
  I want to rotate the private key for a certificate
  So that I can follow key rotation best practices

  Scenario: AC-6.1 — Rotate key replaces current key with new one
    Given a certificate "cert-123" has an ACTIVE private key with id "key-old"
    When I POST to /api/certificates/cert-123/keys/rotate with:
      | newPrivateKeyPem | "-----BEGIN RSA PRIVATE KEY-----\n...(new key)..." |
    Then I receive a 200 response
    And the response includes:
      | keyId         | (new UUID)     |
      | previousKeyId | "key-old"      |
      | status        | "ACTIVE"       |
    And the old key record has status "ROTATED"
    And an audit entry is created with action "KEY_ROTATE"

  Scenario: AC-6.2 — Rotation fails if no existing key
    Given a certificate "cert-456" has no stored private key
    When I POST to /api/certificates/cert-456/keys/rotate with a new key PEM
    Then I receive a 404 response
    And the error message is "No active key found to rotate"

  Scenario: AC-6.3 — Old key is still accessible after rotation (for transition)
    Given a key was rotated from "key-old" to "key-new"
    When I GET /api/certificates/cert-123/keys?includeRotated=true
    Then the response includes both keys
    And "key-old" has status "ROTATED"
    And "key-new" has status "ACTIVE"
```

## Feature 7: Key Deletion

```gherkin
Feature: Private Key Deletion (Destruction)
  As a security officer
  I want to permanently destroy a private key
  So that it cannot be recovered even if the database is compromised

  Scenario: AC-7.1 — Delete key overwrites ciphertext and marks deleted
    Given a certificate "cert-123" has an ACTIVE private key
    When I DELETE /api/certificates/cert-123/keys with:
      | reason | "Certificate expired, key no longer needed" |
    Then I receive a 200 response
    And the response includes:
      | status    | "DELETED"   |
      | deletedAt | (now)       |
    And the database encrypted_key_data column is overwritten with zeros
    And an audit entry is created with action "KEY_DELETE"

  Scenario: AC-7.2 — Deletion requires a reason
    Given a certificate "cert-123" has an ACTIVE private key
    When I DELETE /api/certificates/cert-123/keys without a reason
    Then I receive a 400 response
    And the error message is "Reason is required for key deletion (audit trail)"

  Scenario: AC-7.3 — Deletion is irreversible
    Given a key for "cert-123" was deleted
    When I POST to /api/certificates/cert-123/keys/retrieve with reason "Oops"
    Then I receive a 410 response
    And the error message is "Private key has been permanently deleted"

  Scenario: AC-7.4 — Cannot delete already-deleted key
    Given a key for "cert-123" was already deleted
    When I DELETE /api/certificates/cert-123/keys with reason "Double delete"
    Then I receive a 410 response
```

## Feature 8: CSR Integration (Optional Key Storage)

```gherkin
Feature: CSR Endpoint Enhanced with Optional Key Storage
  As a PKI administrator
  I want to optionally store the generated private key during CSR creation
  So that I don't need a separate step to store the key

  Scenario: AC-8.1 — CSR with storeKey=true stores the generated key
    Given a certificate with id "cert-123" exists
    And I have scopes "cert:csr" and "key:write"
    When I POST to /api/csr with:
      | commonName    | "api.example.com" |
      | keySize       | 2048              |
      | storeKey      | true              |
      | certificateId | "cert-123"        |
    Then I receive a 200 response
    And the response includes csr and publicKey PEM
    And the response does NOT include privateKeyPem (key stored instead)
    And the response includes keyMetadata: { keyId, fingerprint, status: "ACTIVE" }

  Scenario: AC-8.2 — CSR with storeKey=false (default) returns key as before
    When I POST to /api/csr with:
      | commonName | "api.example.com" |
      | keySize    | 2048              |
    Then I receive a 200 response
    And the response includes privateKeyPem in plaintext
    And no key record is created in the database

  Scenario: AC-8.3 — CSR with storeKey=true but no certificateId fails
    When I POST to /api/csr with:
      | commonName | "api.example.com" |
      | keySize    | 2048              |
      | storeKey   | true              |
    Then I receive a 400 response
    And the error message is "certificateId is required when storeKey is true"
```

## Feature 9: Frontend Key Management Panel

```gherkin
Feature: Certificate Detail Page — Key Management Section
  As a PKI administrator using the web UI
  I want to see key status and manage keys from the certificate detail page
  So that I can upload, download, rotate, and delete keys visually

  Scenario: AC-9.1 — Certificate with active key shows key metadata
    Given I am on the detail page for certificate "cert-123"
    And "cert-123" has an ACTIVE private key
    Then I see a "Private Key" section
    And the section shows: algorithm, fingerprint (truncated), creation date
    And I see buttons: "Download Key", "Rotate Key", "Delete Key"

  Scenario: AC-9.2 — Download Key requires reason via modal
    Given I am on the detail page for "cert-123" with an active key
    When I click "Download Key"
    Then a modal appears with a text input labeled "Reason for retrieval"
    And a "Download" button that is disabled until reason is entered
    When I enter "Deploy to staging LB" and click "Download"
    Then a file download starts with the private key PEM
    And a success toast confirms the download was audited

  Scenario: AC-9.3 — Certificate without key shows upload option
    Given I am on the detail page for "cert-456"
    And "cert-456" has no stored private key
    Then I see a message "No private key stored for this certificate"
    And I see a button "Upload Key"
    When I click "Upload Key"
    Then a file input dialog allows me to select a PEM key file

  Scenario: AC-9.4 — Delete Key shows confirmation modal with warning
    Given I am on the detail page for "cert-123" with an active key
    When I click "Delete Key"
    Then a modal appears with a red warning "This action is irreversible"
    And a text input for reason is required
    And a "Confirm Deletion" button is present
    When I enter a reason and confirm
    Then the key section updates to show "Private key was deleted on [date]"

  Scenario: AC-9.5 — Deleted key shows deletion notice
    Given I am on the detail page for "cert-789"
    And "cert-789" had a key that was deleted on 2026-05-15
    Then I see: "Private key was deleted on 2026-05-15"
    And no key action buttons are visible
```

## Feature 10: Audit Trail for Key Operations

```gherkin
Feature: Key Operation Audit Trail
  As a security officer
  I want all key operations to be logged immutably
  So that I can audit key access for compliance reporting

  Scenario: AC-10.1 — KEY_STORE audit entry on key creation
    When a private key is stored for certificate "cert-123"
    Then an audit entry exists with:
      | action        | "KEY_STORE"  |
      | certificateId | "cert-123"   |
      | result        | "SUCCESS"    |
      | actor         | (token owner or username) |

  Scenario: AC-10.2 — KEY_RETRIEVE audit entry on key download
    When a private key is retrieved for certificate "cert-123" with reason "Deployment"
    Then an audit entry exists with:
      | action | "KEY_RETRIEVE" |
      | detail | "Deployment"   |

  Scenario: AC-10.3 — KEY_ROTATE audit entry on key rotation
    When a private key is rotated for certificate "cert-123"
    Then an audit entry exists with:
      | action | "KEY_ROTATE"          |
      | detail | contains old and new keyId |

  Scenario: AC-10.4 — KEY_DELETE audit entry on key destruction
    When a private key is deleted for certificate "cert-123" with reason "Cert expired"
    Then an audit entry exists with:
      | action | "KEY_DELETE"    |
      | detail | "Cert expired"  |

  Scenario: AC-10.5 — Failed decryption creates failure audit entry
    When key retrieval fails due to corrupted ciphertext
    Then an audit entry exists with:
      | action | "KEY_RETRIEVE" |
      | result | "FAILURE"      |
      | detail | contains "Decryption failed" |

  Scenario: AC-10.6 — Key audit entries visible in certificate audit tab
    Given certificate "cert-123" has had 3 key operations (store, retrieve, rotate)
    When I view the audit log for certificate "cert-123"
    Then all 3 key-related audit entries appear in the log
    And they are ordered by timestamp descending
```
