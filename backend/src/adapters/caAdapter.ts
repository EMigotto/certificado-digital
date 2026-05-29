/**
 * CA Adapter interface and shared types for Certificate Authority integrations.
 *
 * Every CA backend (Vault PKI, REST CA, etc.) implements this interface so the
 * lifecycle service can issue / revoke certificates through a uniform API.
 */

// ─── CA configuration (matches Prisma CaConfig model) ───────────────────────

export type CaType = 'VAULT_PKI' | 'REST_CA';

export interface CaConfig {
  id: string;
  name: string;
  type: CaType;
  endpoint: string;
  authToken: string | null;
  authHeaders: Record<string, string> | null;
  role: string | null;
  enabled: boolean;
}

// ─── Issuance result ────────────────────────────────────────────────────────

export interface CaIssuanceResult {
  /** Issued certificate in PEM format */
  certificatePem: string;
  /** CA chain in PEM format (intermediate + root) */
  chainPem: string | null;
  /** Certificate serial number */
  serialNumber: string;
  /** Validity start (ISO-8601) */
  notBefore: string;
  /** Validity end (ISO-8601) */
  notAfter: string;
}

// ─── Adapter interface ──────────────────────────────────────────────────────

export interface CaAdapter {
  /**
   * Submit a CSR to the CA for signing.
   * Returns the issued certificate + chain.
   */
  submitCsr(csrPem: string, config: CaConfig): Promise<CaIssuanceResult>;

  /**
   * Revoke a certificate by serial number.
   * @param serial  Certificate serial (hex or colon-delimited).
   * @param reasonCode  RFC 5280 revocation reason (e.g. "keyCompromise").
   */
  revokeCertificate(serial: string, reasonCode: string, config: CaConfig): Promise<void>;

  /**
   * Lightweight connectivity / health check for the CA endpoint.
   */
  healthCheck(config: CaConfig): Promise<boolean>;
}
