/**
 * Certificate domain types.
 *
 * These are the API-level representations (dates as ISO-8601 strings).
 * The Prisma model uses native Date objects; conversion happens at the API boundary.
 */

/** Certificate status derived from validity dates and revocation state */
export type CertStatus =
  | 'VALID'
  | 'EXPIRING_SOON'
  | 'EXPIRED'
  | 'REVOKED'
  | 'PENDING'
  | 'ISSUED'
  | 'ACTIVE'
  | 'RENEWED';

/** Frontend display status (used in detail page and badges) */
export type CertificateStatus = 'active' | 'expiring' | 'expired' | 'revoked';

/** Deployment environment */
export type Environment = 'DEV' | 'HML' | 'PRD';

/** How the certificate was imported into the system */
export type ImportSource = 'MANUAL' | 'CSV_IMPORT' | 'API_SYNC' | 'CERTIFICATE_FILE';

/** Deployment environment — accepts lowercase for frontend convenience */
export type EnvironmentLike = Environment | 'dev' | 'hml' | 'prd';

/** How the CSR is provided during certificate issuance */
export type CsrSource = 'generate' | 'upload';

/**
 * RFC 5280 §5.3.1 CRL reason codes used for certificate revocation.
 * @see https://datatracker.ietf.org/doc/html/rfc5280#section-5.3.1
 */
export type RevocationReasonCode =
  | 'unspecified'
  | 'keyCompromise'
  | 'cACompromise'
  | 'affiliationChanged'
  | 'superseded'
  | 'cessationOfOperation'
  | 'certificateHold'
  | 'removeFromCRL'
  | 'privilegeWithdrawn'
  | 'aACompromise';

/** Key algorithm options for certificate generation */
export type KeyAlgorithm = 'RSA-2048' | 'RSA-4096' | 'ECDSA-P256' | 'ECDSA-P384';

/** Core certificate metadata — 30+ fields covering identity, validity, crypto, org context, system */
export interface Certificate {
  id: string;

  // Identity
  commonName: string;
  subjectDn: string | null;
  issuerDn: string | null;
  sans: string[];
  serialNumber: string;
  /** Alias — short field name used by frontend components */
  serial?: string;

  // Validity
  notBefore: string; // ISO-8601
  notAfter: string; // ISO-8601
  status?: CertStatus;

  // Cryptography
  signatureAlgorithm: string;
  /** Alias — short field name used by frontend components */
  algorithm?: string;
  keySize: number | null;
  fingerprintSha256: string;
  fingerprintSha1: string | null;

  // Organization context
  owner: string;
  team: string | null;
  application: string;
  environment: EnvironmentLike;
  zone: string | null;

  // CA / Provider
  caName: string;
  caProvider: string | null;
  /** Alias — short field name used by frontend components */
  issuer?: string;

  // Import metadata
  importSource?: ImportSource;
  sourceFile: string | null;

  // Revocation
  revoked: boolean;
  revokedAt: string | null; // ISO-8601
  revocationReason: string | null;

  // Lifecycle fields
  csrSource: CsrSource | null;
  validityDays: number | null;
  renewalParentId: string | null;
  renewalChildId: string | null;
  revocationReasonCode: RevocationReasonCode | null;
  revocationJustification: string | null;
  revokedBy: string | null;
  keyAlgorithm: KeyAlgorithm | null;

  // Flexible fields
  tags: Record<string, string>;
  customFields: Record<string, string>;
  description: string | null;

  // System timestamps
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

/** Payload for creating a new certificate (system fields omitted) */
export type CertificateCreate = Omit<Certificate, 'id' | 'createdAt' | 'updatedAt'>;

/** Payload for updating an existing certificate (all fields optional) */
export type CertificateUpdate = Partial<CertificateCreate>;

// ─── Certificate Authority ──────────────────────────────────────────────────

/** CA provider configuration */
export interface CaConfig {
  id: string;
  name: string;
  provider: string;
  endpoint: string | null;
  supportedAlgorithms: KeyAlgorithm[];
  maxValidityDays: number;
  isDefault: boolean;
  healthy: boolean;
  lastHealthCheck: string | null; // ISO-8601
}

// ─── Lifecycle Request / Response DTOs ──────────────────────────────────────

/** Request body for issuing a new certificate */
export interface IssueCertificateRequest {
  commonName: string;
  sans: string[];
  keyAlgorithm: KeyAlgorithm;
  csrSource: CsrSource;
  csrPem: string | null;
  caId: string;
  owner: string;
  team: string | null;
  application: string;
  environment: Environment;
  zone: string | null;
  validityDays: number;
  description: string | null;
  tags: Record<string, string>;
}

/** Response after issuing a certificate */
export interface IssueCertificateResponse {
  certificate: Certificate;
  auditId: string;
}

/** Request body for renewing an existing certificate */
export interface RenewCertificateRequest {
  validityDays: number;
  rotateKey: boolean;
  keyAlgorithm: KeyAlgorithm | null;
}

/** Response after renewing a certificate */
export interface RenewCertificateResponse {
  certificate: Certificate;
  previousCertificateId: string;
  auditId: string;
}

/** Request body for revoking a certificate with a reason */
export interface RevokeCertificateRequest {
  reasonCode: RevocationReasonCode;
  justification: string;
}

/** Response after revoking a certificate */
export interface RevokeCertificateResponse {
  certificate: Certificate;
  auditId: string;
}

// ─── Certificate Timeline ───────────────────────────────────────────────────

/** Timeline event type for certificate history */
export type TimelineEventType =
  | 'ISSUED'
  | 'ACTIVATED'
  | 'RENEWED'
  | 'REVOKED'
  | 'EXPIRED'
  | 'KEY_ROTATED'
  | 'NOTIFICATION_SENT';

/** Single event in a certificate's lifecycle timeline */
export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  timestamp: string; // ISO-8601
  actor: string;
  detail: string | null;
  relatedCertificateId: string | null;
}

/** Full timeline for a certificate */
export interface CertificateTimeline {
  certificateId: string;
  events: TimelineEvent[];
}

// ─── Renewal Options ────────────────────────────────────────────────────────

/** Options/eligibility for renewing a specific certificate */
export interface RenewalOptions {
  eligible: boolean;
  reason: string | null;
  suggestedValidityDays: number;
  maxValidityDays: number;
  canRotateKey: boolean;
  currentAlgorithm: KeyAlgorithm | null;
  availableAlgorithms: KeyAlgorithm[];
}

// ─── Revocation Reasons ─────────────────────────────────────────────────────

/** Human-readable revocation reason option */
export interface RevocationReasonOption {
  code: RevocationReasonCode;
  label: string;
  description: string;
}
