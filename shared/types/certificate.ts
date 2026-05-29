/**
 * Certificate domain types.
 *
 * These are the API-level representations (dates as ISO-8601 strings).
 * The Prisma model uses native Date objects; conversion happens at the API boundary.
 */

/** Certificate status derived from validity dates and revocation state */
export type CertStatus = 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'REVOKED';

/** Frontend display status (used in detail page and badges) */
export type CertificateStatus = 'active' | 'expiring' | 'expired' | 'revoked';

/** Deployment environment */
export type Environment = 'DEV' | 'HML' | 'PRD';

/** How the certificate was imported into the system */
export type ImportSource = 'MANUAL' | 'CSV_IMPORT' | 'API_SYNC' | 'CERTIFICATE_FILE';

/** Deployment environment — accepts lowercase for frontend convenience */
export type EnvironmentLike = Environment | 'dev' | 'hml' | 'prd';

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
