/**
 * Vault PKI CA adapter.
 *
 * Integrates with HashiCorp Vault's PKI secrets engine to issue and revoke
 * certificates via the Vault HTTP API.
 *
 * Endpoints used:
 *   Issue:   POST {endpoint}/sign/{role}
 *   Revoke:  POST {endpoint}/revoke
 *   Health:  GET  {vault_addr}/v1/sys/health
 */

import type { CaAdapter, CaConfig, CaIssuanceResult } from './caAdapter.js';

export class VaultPkiAdapter implements CaAdapter {
  /**
   * Submit a CSR to Vault PKI for signing.
   *
   * POST {endpoint}/sign/{role}
   * Body: { csr: "<pem>", common_name: "<cn>", ttl: "8760h" }
   * Headers: X-Vault-Token
   */
  async submitCsr(csrPem: string, config: CaConfig): Promise<CaIssuanceResult> {
    const role = config.role ?? 'default';
    const url = `${config.endpoint}/sign/${role}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Vault-Token': config.authToken ?? '',
      },
      body: JSON.stringify({
        csr: csrPem,
        format: 'pem',
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Vault PKI sign failed (${response.status}): ${body}`,
      );
    }

    const json = (await response.json()) as VaultSignResponse;
    const data = json.data;

    return {
      certificatePem: data.certificate,
      chainPem: data.ca_chain?.join('\n') ?? data.issuing_ca ?? null,
      serialNumber: data.serial_number,
      notBefore: new Date(data.not_before_unix * 1000).toISOString(),
      notAfter: new Date(data.expiration * 1000).toISOString(),
    };
  }

  /**
   * Revoke a certificate in Vault PKI.
   *
   * POST {endpoint}/revoke
   * Body: { serial_number: "<serial>" }
   */
  async revokeCertificate(
    serial: string,
    _reasonCode: string,
    config: CaConfig,
  ): Promise<void> {
    const url = `${config.endpoint}/revoke`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Vault-Token': config.authToken ?? '',
      },
      body: JSON.stringify({ serial_number: serial }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Vault PKI revoke failed (${response.status}): ${body}`,
      );
    }
  }

  /**
   * Check Vault health.
   *
   * GET {vault_addr}/v1/sys/health
   * Vault health endpoint returns 200 for initialized+unsealed.
   */
  async healthCheck(config: CaConfig): Promise<boolean> {
    try {
      // Derive the Vault base address from the PKI endpoint.
      // e.g. "https://vault.example.com/v1/pki" → "https://vault.example.com"
      const vaultAddr = extractVaultAddr(config.endpoint);
      const url = `${vaultAddr}/v1/sys/health`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Vault-Token': config.authToken ?? '',
        },
        signal: AbortSignal.timeout(5000),
      });

      // Vault returns 200 when initialized and unsealed
      return response.ok;
    } catch {
      return false;
    }
  }
}

// ─── Vault API response types ───────────────────────────────────────────────

interface VaultSignResponse {
  data: {
    certificate: string;
    issuing_ca: string;
    ca_chain: string[] | null;
    serial_number: string;
    expiration: number;
    not_before_unix: number;
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract the Vault base address from a PKI mount path.
 * "https://vault.example.com/v1/pki" → "https://vault.example.com"
 */
export function extractVaultAddr(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    return `${url.protocol}//${url.host}`;
  } catch {
    // If not a valid URL, return as-is (e.g. in tests)
    return endpoint;
  }
}
