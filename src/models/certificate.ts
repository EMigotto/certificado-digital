/**
 * Domain model for X.509 certificate inventory.
 * Maps to PRD §2 "Certificate Metadata CRUD" and AC Set 6.
 */

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type CertificateStatus = 'valid' | 'attention' | 'critical' | 'expired' | 'revoked';

export interface Certificate {
  /** Unique identifier (UUID or similar) */
  id: string;
  /** Common Name (CN) from subject */
  commonName: string;
  /** Subject Alternative Names */
  sans: string[];
  /** Certificate serial number (hex string) */
  serial: string;
  /** Issuing CA */
  issuer: string;
  /** Validity start */
  notBefore: Date;
  /** Validity end */
  notAfter: Date;
  /** Key algorithm + size, e.g. "RSA 2048" */
  algorithm: string;
  /** SHA-256 fingerprint */
  fingerprintSHA256: string;
  /** Owning team / service */
  owner: string;
  /** Associated application name */
  application: string;
  /** Environment tag: dev | hml | prd */
  environment: 'dev' | 'hml' | 'prd';
  /** Zone/domain name */
  zone: string;
  /** Free-form key:value tags */
  tags: Record<string, string>;
  /** Custom extensible fields (stored as JSON, no migration needed — AC 6.3) */
  customFields: Record<string, unknown>;
  /** Whether the certificate has been revoked */
  revoked: boolean;
}

/* ------------------------------------------------------------------ */
/* Status computation — AC 1.11 / 1.12 / 7.1 / 7.2                    */
/* ------------------------------------------------------------------ */

/**
 * Compute days until expiration (negative = already expired).
 * Uses calendar-day difference (floor).
 */
export function daysUntilExpiration(notAfter: Date, now: Date = new Date()): number {
  const msPerDay = 86_400_000;
  return Math.floor((notAfter.getTime() - now.getTime()) / msPerDay);
}

/**
 * Derive display status for a certificate.
 *
 * Rules (AC 1.11 / 7.1 / 7.2):
 *   - revoked  → "revoked"
 *   - ≤ 0 days → "expired"
 *   - < 7 days → "critical"
 *   - ≤ 30 days → "attention"
 *   - > 30 days → "valid"
 */
export function computeStatus(cert: Certificate, now: Date = new Date()): CertificateStatus {
  if (cert.revoked) return 'revoked';
  const days = daysUntilExpiration(cert.notAfter, now);
  if (days <= 0) return 'expired';
  if (days < 7) return 'critical';
  if (days <= 30) return 'attention';
  return 'valid';
}

/**
 * Map status to the Portuguese badge label shown in the UI (AC 1.11).
 */
export function statusLabel(status: CertificateStatus): string {
  const labels: Record<CertificateStatus, string> = {
    valid: 'Válido',
    attention: 'Atenção',
    critical: 'Crítico',
    expired: 'Expirado',
    revoked: 'Revogado',
  };
  return labels[status];
}

/**
 * Map status to urgency colour class (AC 1.12).
 *
 * - critical / expired → "crit"  (red)
 * - attention           → "warn"  (yellow)
 * - valid               → "ok"    (green)
 * - revoked             → "rev"   (purple)
 */
export function statusColor(status: CertificateStatus): 'crit' | 'warn' | 'ok' | 'rev' {
  switch (status) {
    case 'critical':
    case 'expired':
      return 'crit';
    case 'attention':
      return 'warn';
    case 'revoked':
      return 'rev';
    default:
      return 'ok';
  }
}

/**
 * Format days-to-expiration for the "Expira em" column (AC 1.12).
 * E.g. "2 dias", "0 dias", "-3 dias".
 */
export function formatDaysLeft(days: number): string {
  return `${days} dias`;
}
