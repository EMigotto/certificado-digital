/**
 * Generic REST CA adapter.
 *
 * Integrates with any Certificate Authority that exposes a simple REST API
 * for issuing and revoking certificates.
 *
 * Endpoints used:
 *   Issue:   POST {endpoint}/issue
 *   Revoke:  POST {endpoint}/revoke
 *   Health:  GET  {endpoint}/health
 */

import type { CaAdapter, CaConfig, CaIssuanceResult } from './caAdapter.js';

export class RestCaAdapter implements CaAdapter {
  /**
   * Submit a CSR to the REST CA for signing.
   *
   * POST {endpoint}/issue
   * Body: { csr: "<pem>" }
   */
  async submitCsr(csrPem: string, config: CaConfig): Promise<CaIssuanceResult> {
    const url = `${config.endpoint}/issue`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(config),
      },
      body: JSON.stringify({ csr: csrPem }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `REST CA issue failed (${response.status}): ${body}`,
      );
    }

    const json = (await response.json()) as RestCaIssueResponse;

    return {
      certificatePem: json.certificate,
      chainPem: json.chain ?? null,
      serialNumber: json.serial_number,
      notBefore: json.not_before,
      notAfter: json.not_after,
    };
  }

  /**
   * Revoke a certificate via the REST CA.
   *
   * POST {endpoint}/revoke
   * Body: { serial_number: "<serial>", reason: "<reason>" }
   */
  async revokeCertificate(
    serial: string,
    reasonCode: string,
    config: CaConfig,
  ): Promise<void> {
    const url = `${config.endpoint}/revoke`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(config),
      },
      body: JSON.stringify({
        serial_number: serial,
        reason: reasonCode,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `REST CA revoke failed (${response.status}): ${body}`,
      );
    }
  }

  /**
   * Check REST CA health.
   *
   * GET {endpoint}/health
   */
  async healthCheck(config: CaConfig): Promise<boolean> {
    try {
      const url = `${config.endpoint}/health`;

      const response = await fetch(url, {
        method: 'GET',
        headers: buildAuthHeaders(config),
        signal: AbortSignal.timeout(5000),
      });

      return response.ok;
    } catch {
      return false;
    }
  }
}

// ─── REST CA response types ─────────────────────────────────────────────────

interface RestCaIssueResponse {
  certificate: string;
  chain: string | null;
  serial_number: string;
  not_before: string;
  not_after: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build auth headers from CaConfig.
 * Prefers authHeaders map; falls back to Bearer token from authToken.
 */
function buildAuthHeaders(config: CaConfig): Record<string, string> {
  if (config.authHeaders && Object.keys(config.authHeaders).length > 0) {
    return { ...config.authHeaders };
  }
  if (config.authToken) {
    return { Authorization: `Bearer ${config.authToken}` };
  }
  return {};
}
