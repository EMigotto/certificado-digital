/**
 * Lifecycle API client — issuance, renewal, revocation, and timeline endpoints.
 *
 * All methods return typed responses matching the backend lifecycle contract.
 */

import { api } from '@/services/api';
import type {
  IssueCertificateRequest,
  IssueCertificateResponse,
  RenewCertificateRequest,
  RenewCertificateResponse,
  RevokeCertificateRequest,
  RevokeCertificateResponse,
  CertificateTimeline,
  RenewalOptions,
  RevocationReasonOption,
  CaConfig,
} from '@certificado-digital/shared';

// ─── Certificate Issuance ───────────────────────────────────────────────────

/**
 * Issue a new certificate.
 *
 * POST /api/certificates/issue
 */
export async function issueCertificate(
  params: IssueCertificateRequest,
): Promise<IssueCertificateResponse> {
  const { data } = await api.post<IssueCertificateResponse>('/certificates/issue', params);
  return data;
}

// ─── Certificate Renewal ────────────────────────────────────────────────────

/**
 * Renew an existing certificate.
 *
 * POST /api/certificates/:id/renew
 */
export async function renewCertificate(
  id: string,
  params: RenewCertificateRequest,
): Promise<RenewCertificateResponse> {
  const { data } = await api.post<RenewCertificateResponse>(`/certificates/${id}/renew`, params);
  return data;
}

/**
 * Get renewal options / eligibility for a certificate.
 *
 * GET /api/certificates/:id/renewal-options
 */
export async function getRenewalOptions(id: string): Promise<RenewalOptions> {
  const { data } = await api.get<RenewalOptions>(`/certificates/${id}/renewal-options`);
  return data;
}

// ─── Certificate Revocation ─────────────────────────────────────────────────

/**
 * Revoke a certificate with an RFC 5280 reason code and justification.
 *
 * POST /api/certificates/:id/revoke
 */
export async function revokeCertificateWithReason(
  id: string,
  params: RevokeCertificateRequest,
): Promise<RevokeCertificateResponse> {
  const { data } = await api.post<RevokeCertificateResponse>(`/certificates/${id}/revoke`, params);
  return data;
}

/**
 * Get available RFC 5280 revocation reason codes.
 *
 * GET /api/revocation-reasons
 */
export async function getRevocationReasons(): Promise<RevocationReasonOption[]> {
  const { data } = await api.get<RevocationReasonOption[]>('/revocation-reasons');
  return data;
}

// ─── Certificate Timeline ───────────────────────────────────────────────────

/**
 * Get the lifecycle timeline for a certificate.
 *
 * GET /api/certificates/:id/timeline
 */
export async function getCertificateTimeline(id: string): Promise<CertificateTimeline> {
  const { data } = await api.get<CertificateTimeline>(`/certificates/${id}/timeline`);
  return data;
}

// ─── Certificate Authorities ────────────────────────────────────────────────

/**
 * List all available Certificate Authority configurations.
 *
 * GET /api/cas
 */
export async function getCaList(): Promise<CaConfig[]> {
  const { data } = await api.get<CaConfig[]>('/cas');
  return data;
}

/**
 * Check health status of a specific CA.
 *
 * POST /api/cas/:id/health
 */
export async function checkCaHealth(
  id: string,
): Promise<{ healthy: boolean; latencyMs: number; message: string | null }> {
  const { data } = await api.post<{ healthy: boolean; latencyMs: number; message: string | null }>(
    `/cas/${id}/health`,
  );
  return data;
}
