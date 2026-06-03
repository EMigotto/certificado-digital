# C7. API REST e CLI - Acceptance Criteria (Gherkin)

## Feature 1: OpenAPI/Swagger Documentation

```gherkin
Feature: OpenAPI Specification and Swagger UI
  As a developer integrating with the API
  I want complete, up-to-date OpenAPI documentation
  So that I can discover endpoints, request/response schemas, and authentication requirements

  Scenario: OpenAPI specification is accessible at documentation endpoints
    Given the API server is running
    When I request GET /api/docs
    Then I receive a 200 response
    And the response body contains the Swagger UI HTML

  Scenario: OpenAPI JSON schema is available for tooling
    Given the API server is running
    When I request GET /api/docs/openapi.json
    Then I receive a 200 response
    And the response body is valid OpenAPI 3.0.0 JSON
    And the schema includes all /api/certificates, /api/csr, /api/policies, and /api/zones endpoints

  Scenario: Certificate GET endpoint is documented with correct schema
    Given the OpenAPI schema is available at /api/docs/openapi.json
    When I parse the schema
    Then I find path /api/certificates with GET method
    And the GET method has a 200 response with Certificate array schema
    And the response schema includes fields: id, commonName, notBefore, notAfter, status, environment

  Scenario: Token creation endpoint requires Bearer authentication in schema
    Given the OpenAPI schema is available at /api/docs/openapi.json
    When I parse the schema
    Then I find path /api/tokens with POST method
    And the POST method documents Bearer token security requirement
    And the security section lists valid scopes

  Scenario: Negative - Invalid path is not in OpenAPI schema
    Given the OpenAPI schema is available at /api/docs/openapi.json
    When I search for path /api/invalid
    Then the path is not found in the schema
```

## Feature 2: Service Token Authentication

```gherkin
Feature: Service Token Issuance and Validation
  As a platform engineer
  I want to issue long-lived, scoped API tokens for services and CI/CD pipelines
  So that third-party systems can authenticate and manage certificates without user sessions

  Scenario: Create a service token with specific scopes
    Given I am authenticated as an admin user
    When I POST to /api/tokens with:
      | name     | "CI Pipeline Prod"      |
      | scopes   | ["cert:read","cert:renew"] |
      | expiresIn| 604800                  |
    Then I receive a 201 response
    And the response contains a token value (masked preview)
    And the response includes:
      | id        | (new UUID)               |
      | name      | "CI Pipeline Prod"       |
      | scopes    | ["cert:read","cert:renew"] |
      | expiresAt | (7 days from now)       |
      | createdAt | (now)                   |

  Scenario: Token can only be retrieved at creation time
    Given a service token was created 5 minutes ago
    When I try to GET /api/tokens/:id to retrieve the full token value
    Then I receive a 200 response with masked token (last 4 chars visible)
    And the full token value is NOT in the response

  Scenario: API request with valid token succeeds
    Given a valid service token with scope "cert:read"
    When I request GET /api/certificates with Authorization header "Bearer <token>"
    Then I receive a 200 response
    And the response contains the certificates list

  Scenario: API request with expired token is rejected
    Given a service token that expired 1 day ago
    When I request GET /api/certificates with Authorization header "Bearer <token>"
    Then I receive a 401 response
    And the error message is "Token expired"

  Scenario: API request with invalid token signature is rejected
    Given a malformed token (invalid signature)
    When I request GET /api/certificates with Authorization header "Bearer <malformed>"
    Then I receive a 401 response
    And the error message is "Invalid token"

  Scenario: API request without Authorization header is rejected
    Given a valid certificate exists
    When I request GET /api/certificates without Authorization header
    Then I receive a 401 response
    And the error message mentions "Authorization header required"

  Scenario: Endpoint with required scope rejects token with insufficient scope
    Given a service token with scope "cert:read" only
    When I request DELETE /api/certificates/:id with this token
    Then I receive a 403 response
    And the error message is "Insufficient scope: cert:delete required"

  Scenario: Token with multiple scopes grants access to all corresponding endpoints
    Given a service token with scopes ["cert:read", "cert:create", "cert:delete"]
    When I request:
      | GET /api/certificates     | (read)   |
      | POST /api/certificates    | (create) |
      | DELETE /api/certificates/:id | (delete) |
    Then all three requests receive 2xx responses

  Scenario: Negative - Default token expiration is 30 days if not specified
    Given I create a service token without specifying expiresIn
    When I receive the response
    Then the token expiresAt is approximately 30 days from creation time

  Scenario: Admin can revoke a token
    Given a service token "Old CI Setup" was created
    When I POST to /api/tokens/:id/revoke
    Then I receive a 200 response
    And subsequent requests with this token receive 401 "Token revoked"
```

## Feature 3: Certificate CRUD Endpoints

```gherkin
Feature: Certificate REST API CRUD Operations
  As a service or DevOps engineer
  I want to read, create, update, and delete certificates via REST API
  So that certificate management is fully programmable

  Scenario: List certificates with pagination
    Given 100 certificates exist in the system
    When I request GET /api/certificates?page=1&limit=20
    Then I receive a 200 response
    And the response includes:
      | data   | (array of 20 certificates) |
      | total  | 100                        |
      | page   | 1                          |
      | limit  | 20                         |

  Scenario: List certificates with search filter
    Given certificates with commonNames: "api.example.com", "web.example.com", "db.prod.example.com"
    When I request GET /api/certificates?search=example.com
    Then I receive a 200 response
    And the response includes all 3 certificates

  Scenario: List certificates with status filter
    Given 50 VALID, 10 EXPIRING_SOON, 5 EXPIRED, 2 REVOKED certificates
    When I request GET /api/certificates?filter[status]=EXPIRING_SOON
    Then I receive a 200 response
    And the response includes exactly 10 certificates
    And all certificates have status "EXPIRING_SOON"

  Scenario: Get single certificate by ID
    Given a certificate with id "abc123" exists
    When I request GET /api/certificates/abc123
    Then I receive a 200 response
    And the response includes all fields:
      | id, commonName, notBefore, notAfter, status, owner, team, application, environment |
      | zone, caName, caProvider, revoked, tags, customFields, createdAt, updatedAt |

  Scenario: Negative - Get non-existent certificate returns 404
    Given no certificate with id "nonexistent" exists
    When I request GET /api/certificates/nonexistent
    Then I receive a 404 response
    And the error message is "Certificate with id "nonexistent" not found"

  Scenario: Create a new certificate
    Given I have scope "cert:create"
    When I POST to /api/certificates with:
      | commonName     | "api.staging.example.com"      |
      | organizationName | "My Company"                 |
      | owner          | "team-platform"                |
      | environment    | "DEV"                          |
      | application    | "api-gateway"                  |
      | notBefore      | "2026-01-01T00:00:00Z"        |
      | notAfter       | "2027-01-01T00:00:00Z"        |
    Then I receive a 201 response
    And the response includes:
      | id              | (generated UUID)               |
      | commonName      | "api.staging.example.com"      |
      | status          | "VALID"                        |
      | revoked         | false                          |
      | createdAt       | (now)                          |

  Scenario: Negative - Create certificate without required fields fails validation
    Given I have scope "cert:create"
    When I POST to /api/certificates with:
      | owner | "team-a" |
    Then I receive a 400 response
    And the error message mentions "commonName is required"

  Scenario: Update certificate metadata
    Given a certificate with id "abc123" exists
    When I PATCH /api/certificates/abc123 with:
      | tags        | {"environment": "prod", "cost-center": "12345"} |
      | description | "Production API certificate"                     |
      | customFields | {"renewal-approver": "ops-lead"}                |
    Then I receive a 200 response
    And the response includes the updated fields
    And the updatedAt timestamp is newer than before

  Scenario: Negative - Update non-existent certificate returns 404
    Given no certificate with id "nonexistent" exists
    When I PATCH /api/certificates/nonexistent with {"description": "new"}
    Then I receive a 404 response

  Scenario: Soft-delete (revoke) a certificate
    Given a certificate with id "abc123" and revoked=false
    When I DELETE /api/certificates/abc123
    Then I receive a 200 response
    And the response includes:
      | revoked     | true                |
      | revokedAt   | (now)               |

  Scenario: Negative - Revoke already-revoked certificate
    Given a certificate with id "abc123" and revoked=true
    When I DELETE /api/certificates/abc123
    Then I receive a 409 response
    And the error message is "Certificate already revoked"

  Scenario: Export certificate as PEM
    Given a certificate with id "abc123" exists
    When I request GET /api/certificates/abc123/export/pem
    Then I receive a 200 response
    And the Content-Type header is "application/octet-stream"
    And the Content-Disposition header is "attachment; filename="abc123.pem""
    And the body is valid X.509 PEM format

  Scenario: Export certificate as JSON
    Given a certificate with id "abc123" exists
    When I request GET /api/certificates/abc123/export/json
    Then I receive a 200 response
    And the Content-Type header is "application/json"
    And the body is the full Certificate JSON object

  Scenario: Negative - Export with unsupported format
    Given a certificate with id "abc123" exists
    When I request GET /api/certificates/abc123/export/der
    Then I receive a 400 response
    And the error message mentions "Unsupported export format"
```

## Feature 4: CSR Generation Endpoint

```gherkin
Feature: Certificate Signing Request Generation
  As a DevOps engineer
  I want to generate a CSR and private key via API
  So that I can provision new certificates programmatically without UI

  Scenario: Generate CSR with minimum required fields
    Given I have scope "cert:csr"
    When I POST to /api/csr with:
      | commonName | "api.example.com"      |
      | keySize    | 2048                   |
    Then I receive a 200 response
    And the response includes:
      | csr        | (valid PEM CSR)        |
      | privateKey | (valid PEM private key) |
      | publicKey  | (valid PEM public key) |
      | keySize    | 2048                   |

  Scenario: Generate CSR with full organizational details
    Given I have scope "cert:csr"
    When I POST to /api/csr with:
      | commonName       | "api.example.com"  |
      | organizationName | "Example Corp"     |
      | organizationUnit | "Engineering"      |
      | countryCode      | "US"               |
      | state            | "California"       |
      | locality         | "San Francisco"    |
      | keySize          | 4096               |
      | signatureAlgorithm | "sha256"         |
    Then I receive a 200 response
    And the CSR contains all provided organizational fields
    And the private key is 4096-bit

  Scenario: CSR generation uses secure random generation
    Given I have scope "cert:csr"
    When I generate two CSRs with the same common name
    Then I receive 200 responses for both
    And the privateKey values are different (entropy verified)
    And the CSR signatures are different

  Scenario: Negative - Generate CSR without commonName
    Given I have scope "cert:csr"
    When I POST to /api/csr with:
      | keySize | 2048 |
    Then I receive a 400 response
    And the error message mentions "commonName is required"

  Scenario: Negative - Generate CSR with invalid keySize
    Given I have scope "cert:csr"
    When I POST to /api/csr with:
      | commonName | "api.example.com" |
      | keySize    | 512               |
    Then I receive a 400 response
    And the error message mentions "keySize must be 2048 or 4096"

  Scenario: Insufficient scope rejects CSR request
    Given a service token with scope "cert:read" only (no "cert:csr")
    When I POST to /api/csr with valid CSR parameters
    Then I receive a 403 response
    And the error message is "Insufficient scope: cert:csr required"
```

## Feature 5: Renewal Endpoint

```gherkin
Feature: Certificate Renewal via API
  As a DevOps engineer
  I want to renew certificates programmatically via API
  So that certificate renewal is fully automated in CI/CD pipelines

  Scenario: Renew a certificate approaching expiration
    Given a certificate with id "abc123", notAfter "2026-12-01T00:00:00Z", and current date "2026-11-20"
    When I POST to /api/certificates/abc123/renew
    Then I receive a 200 response
    And the response includes a new Certificate with:
      | id         | (new UUID or same, implementation-specific) |
      | commonName | (same as original) |
      | notBefore  | (approximately today) |
      | notAfter   | (approximately 1 year from today) |
      | status     | "VALID" |

  Scenario: Renewal preserves organizational metadata
    Given a certificate with tags, customFields, owner, team, application
    When I POST to /api/certificates/abc123/renew
    Then I receive a 200 response
    And the renewed certificate includes all original metadata

  Scenario: Renew with optional field overrides
    Given a certificate with SANs: ["api.example.com", "backup.example.com"]
    When I POST to /api/certificates/abc123/renew with:
      | sans | ["api.example.com", "backup.example.com", "new.example.com"] |
    Then I receive a 200 response
    And the renewed certificate includes all 3 SANs

  Scenario: Negative - Cannot renew certificate too far from expiration
    Given a certificate with id "abc123", notAfter "2027-12-01T00:00:00Z", and current date "2026-06-01"
    When I POST to /api/certificates/abc123/renew
    Then I receive a 409 response
    And the error message mentions "Certificate not yet eligible for renewal (too far from expiration)"

  Scenario: Negative - Renew revoked certificate fails
    Given a certificate with id "abc123" and revoked=true
    When I POST to /api/certificates/abc123/renew
    Then I receive a 409 response
    And the error message is "Cannot renew revoked certificate"

  Scenario: Negative - Renew non-existent certificate
    Given no certificate with id "nonexistent" exists
    When I POST to /api/certificates/nonexistent/renew
    Then I receive a 404 response
```

## Feature 6: Revocation Endpoint

```gherkin
Feature: Certificate Revocation via API
  As a security engineer
  I want to revoke certificates programmatically
  So that compromised or obsolete certificates are taken out of service

  Scenario: Revoke a certificate with reason
    Given a certificate with id "abc123" and revoked=false
    When I POST to /api/certificates/abc123/revoke with:
      | reason  | "compromised" |
      | comment | "Key leaked in GitHub" |
    Then I receive a 200 response
    And the response includes:
      | revoked           | true                       |
      | revokedAt         | (now)                      |
      | revocationReason  | "compromised"              |

  Scenario: Revoke with valid revocation reasons
    Given a certificate with id "abc123" and revoked=false
    When I POST to /api/certificates/abc123/revoke with reason from:
      | superseded | (replaced with new cert) |
      | compromised | (key/cert exposed) |
      | cessationOfOperation | (service no longer exists) |
      | certificateHold | (temporary suspension) |
    Then I receive 200 responses for all 4 reasons
    And each response shows the correct reason

  Scenario: Negative - Revoke already-revoked certificate
    Given a certificate with id "abc123" and revoked=true
    When I POST to /api/certificates/abc123/revoke with reason "superseded"
    Then I receive a 409 response
    And the error message is "Certificate already revoked"

  Scenario: Negative - Invalid revocation reason
    Given a certificate with id "abc123" and revoked=false
    When I POST to /api/certificates/abc123/revoke with reason "invalid_reason"
    Then I receive a 400 response
    And the error message mentions "Invalid revocation reason"
```

## Feature 7: Policy Endpoints

```gherkin
Feature: Certificate Policies API
  As a security engineer
  I want to query certificate policies via API
  So that I can enforce governance rules in automated workflows

  Scenario: List all policies
    Given policies exist for "PRD", "HML", and "DEV" environments
    When I request GET /api/policies
    Then I receive a 200 response
    And the response includes an array of all policies

  Scenario: List policies with pagination
    Given 100 policies exist
    When I request GET /api/policies?page=1&limit=20
    Then I receive a 200 response with 20 policies and total=100

  Scenario: Get single policy by ID
    Given a policy with id "policy-prod-1" exists
    When I request GET /api/policies/policy-prod-1
    Then I receive a 200 response
    And the response includes policy details such as:
      | id | name | environment | keySize | validityDays | allowedOrgNames |

  Scenario: Negative - Get non-existent policy
    Given no policy with id "nonexistent" exists
    When I request GET /api/policies/nonexistent
    Then I receive a 404 response
```

## Feature 8: Zones Endpoints

```gherkin
Feature: Zones API
  As a platform engineer
  I want to query zones via API
  So that I can organize certificate management across regions/teams

  Scenario: List all zones
    Given zones exist: "us-east", "us-west", "eu-central"
    When I request GET /api/zones
    Then I receive a 200 response
    And the response includes all 3 zones

  Scenario: Get single zone by ID
    Given a zone with id "us-east" exists
    When I request GET /api/zones/us-east
    Then I receive a 200 response
    And the response includes zone metadata

  Scenario: Negative - Get non-existent zone
    Given no zone with id "nonexistent" exists
    When I request GET /api/zones/nonexistent
    Then I receive a 404 response
```

## Feature 9: CLI Tool — Installation and Configuration

```gherkin
Feature: CLI Installation and Configuration
  As a developer
  I want to install and configure the CLI
  So that I can interact with the API from the command line

  Scenario: Install CLI from binary release
    Given a release with certificado-cli-1.0.0-linux-x64.tar.gz exists
    When I download and extract the archive
    Then I have an executable certificado-cli binary
    And certificado-cli --version returns "1.0.0"

  Scenario: Configure API endpoint and token
    Given I have the CLI installed
    When I run:
      | certificado-cli config set api_url https://api.example.com |
      | certificado-cli config set token st_xxx...                   |
    Then the config file ~/.certificado/config.yaml is created
    And subsequent commands use these credentials

  Scenario: CLI accepts token via environment variable
    Given I have the CLI installed
    When I set CERTIFICADO_TOKEN=st_xxx and run certificado-cli certs list
    Then the CLI uses the token from the environment variable

  Scenario: CLI flags override config file and env vars
    Given I have config file with token "st_old" and env var CERTIFICADO_TOKEN="st_env"
    When I run:
      | certificado-cli certs list --token st_flag |
    Then the CLI uses "st_flag"

  Scenario: Negative - Missing token results in clear error
    Given I have the CLI installed with no token configured
    When I run certificado-cli certs list
    Then I receive an error message mentioning "Token not found in config, CERTIFICADO_TOKEN, or --token flag"
```

## Feature 10: CLI Commands — Certificate Management

```gherkin
Feature: CLI Certificate Commands
  As a DevOps engineer
  I want to manage certificates from the command line
  So that certificate operations can be scripted and automated

  Scenario: List certificates with human-readable table output
    Given 5 certificates exist
    When I run certificado-cli certs list
    Then I receive a table with columns:
      | ID | Common Name | Status | NotAfter | Owner |
    And each row represents one certificate

  Scenario: List certificates with JSON output
    Given 5 certificates exist
    When I run certificado-cli certs list --format json
    Then I receive valid JSON array of Certificate objects

  Scenario: Filter certificates by status
    Given certificates with statuses VALID, EXPIRING_SOON, EXPIRED
    When I run certificado-cli certs list --filter-status EXPIRING_SOON
    Then I receive only the EXPIRING_SOON certificate

  Scenario: Get single certificate and display full details
    Given a certificate with id "abc123"
    When I run certificado-cli certs get abc123
    Then I receive formatted output showing all fields:
      | commonName, owner, environment, notAfter, status, etc. |

  Scenario: Export certificate as PEM
    Given a certificate with id "abc123"
    When I run certificado-cli certs get abc123 --export pem
    Then stdout contains valid X.509 PEM format
    And I can pipe to a file: certificado-cli certs get abc123 --export pem > cert.pem

  Scenario: Renew certificate from CLI
    Given a certificate with id "abc123" approaching expiration
    When I run certificado-cli certs renew abc123 --dry-run
    Then I receive output showing what renewal would do
    When I run certificado-cli certs renew abc123
    Then I receive success message with renewed certificate details

  Scenario: Revoke certificate from CLI
    Given a certificate with id "abc123"
    When I run certificado-cli certs revoke abc123 --reason compromised
    Then I receive success message with revocation timestamp

  Scenario: Delete (soft-delete) certificate from CLI
    Given a certificate with id "abc123"
    When I run certificado-cli certs delete abc123 --confirm
    Then the certificate is marked as revoked
    And I receive success confirmation

  Scenario: Negative - List certificates without token fails
    Given no token configured
    When I run certificado-cli certs list
    Then I receive an error about missing authentication
```

## Feature 11: CLI Commands — CSR Generation

```gherkin
Feature: CLI CSR Generation
  As a DevOps engineer
  I want to generate CSRs from the command line
  So that I can request new certificates without UI

  Scenario: Generate CSR with minimum parameters
    When I run:
      | certificado-cli csr generate --cn api.example.com --key-size 2048 |
    Then stdout contains:
      | -----BEGIN CERTIFICATE REQUEST----- |
      | ... CSR content ... |
      | -----END CERTIFICATE REQUEST----- |
      | -----BEGIN RSA PRIVATE KEY----- |
      | ... private key content ... |
      | -----END RSA PRIVATE KEY----- |

  Scenario: Generate CSR and save to files
    When I run:
      | certificado-cli csr generate --cn api.example.com --output-csr req.pem --output-key key.pem |
    Then req.pem contains the CSR
    And key.pem contains the private key

  Scenario: Generate CSR with organizational details
    When I run:
      | certificado-cli csr generate --cn api.example.com --org "My Corp" --country US --state CA --locality SF |
    Then the CSR contains the organization details in the subject DN

  Scenario: Negative - Generate CSR without common name
    When I run:
      | certificado-cli csr generate --key-size 2048 |
    Then I receive an error mentioning "common name (--cn) is required"
```

## Feature 12: CLI Commands — Policy and Zone Lookup

```gherkin
Feature: CLI Policy and Zone Commands
  As a security engineer
  I want to query policies and zones from CLI
  So that I can verify governance rules in scripts

  Scenario: List policies
    When I run certificado-cli policy list
    Then I receive a table of all policies with:
      | ID | Name | Environment | Key Size |

  Scenario: Get policy details
    Given a policy with id "prod-policy-1"
    When I run certificado-cli policy get prod-policy-1
    Then I receive full policy details in human-readable format

  Scenario: List zones
    When I run certificado-cli zone list
    Then I receive a table of all zones

  Scenario: Get zone details
    Given a zone with id "us-east"
    When I run certificado-cli zone get us-east
    Then I receive full zone details
```

## Feature 13: CI/CD Acceptance Test

```gherkin
Feature: End-to-End CI/CD Integration
  As a DevOps engineer
  I want to verify that CI/CD can issue and download certificates in under 30 seconds
  So that automated certificate provisioning is fast enough for production

  Scenario: Pipeline issues and downloads certificate in under 30 seconds
    Given:
      - CI/CD environment has CERTIFICADO_API_URL and CERTIFICADO_TOKEN configured
      - API and CLI are deployed and reachable
    When I run in a CI job:
      | certificado-cli certs create --cn temp-test-$(date +%s).example.com --owner ci-test |
      | (pause for 2 seconds to allow propagation)                                           |
      | CERT_ID=$(certificado-cli certs list --filter-owner ci-test --format json | jq -r '.[0].id') |
      | certificado-cli certs get $CERT_ID --export pem > cert.pem                         |
    Then:
      - All commands complete within 30 seconds total (start to cert.pem on disk)
      - cert.pem is valid X.509 PEM format
      - Exit code is 0 (all commands succeed)

  Scenario: Pipeline can also use REST API endpoints directly
    Given CI/CD environment has CERTIFICADO_TOKEN set
    When I run:
      | curl -H "Authorization: Bearer $CERTIFICADO_TOKEN" https://api.example.com/api/certificates |
    Then I receive a 200 response with the certificates list
    And the response is valid JSON

  Scenario: Negative - Expired or revoked token in CI pipeline fails gracefully
    Given CI/CD environment has an expired CERTIFICADO_TOKEN
    When I run certificado-cli certs list
    Then I receive a clear error message about token expiration
    And the exit code is non-zero
    And the error is suitable for alerting/notification
```
