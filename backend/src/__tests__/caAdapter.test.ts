import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VaultPkiAdapter, extractVaultAddr } from '../adapters/vaultPkiAdapter.js';
import { RestCaAdapter } from '../adapters/restCaAdapter.js';
import { getCaAdapter, getCaAdapterByType } from '../adapters/caAdapterFactory.js';
import type { CaConfig } from '../adapters/caAdapter.js';

// ─── Test fixtures ──────────────────────────────────────────────────────────

function makeVaultConfig(overrides: Partial<CaConfig> = {}): CaConfig {
  return {
    id: 'ca-001',
    name: 'vault-pki-dev',
    type: 'VAULT_PKI',
    endpoint: 'https://vault.example.com/v1/pki',
    authToken: 'test-vault-token',
    authHeaders: null,
    role: 'webserver',
    enabled: true,
    ...overrides,
  };
}

function makeRestConfig(overrides: Partial<CaConfig> = {}): CaConfig {
  return {
    id: 'ca-002',
    name: 'rest-ca-prod',
    type: 'REST_CA',
    endpoint: 'https://ca.example.com/api',
    authToken: null,
    authHeaders: { 'X-Api-Key': 'test-api-key' },
    role: null,
    enabled: true,
    ...overrides,
  };
}

// ─── Mock fetch ─────────────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;

function mockFetch(response: {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}) {
  const fn = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    json: response.json ?? (() => Promise.resolve({})),
    text: response.text ?? (() => Promise.resolve('')),
  });
  globalThis.fetch = fn;
  return fn;
}

// ─── VaultPkiAdapter ────────────────────────────────────────────────────────

describe('VaultPkiAdapter', () => {
  let adapter: VaultPkiAdapter;

  beforeEach(() => {
    adapter = new VaultPkiAdapter();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('submitCsr', () => {
    it('should POST to {endpoint}/sign/{role} with the CSR', async () => {
      const config = makeVaultConfig();
      const fetchMock = mockFetch({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: {
              certificate: '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----',
              issuing_ca: '-----BEGIN CERTIFICATE-----\nCA\n-----END CERTIFICATE-----',
              ca_chain: null,
              serial_number: 'aa:bb:cc:dd',
              not_before_unix: 1700000000,
              expiration: 1730000000,
            },
          }),
      });

      const result = await adapter.submitCsr('CSR_PEM', config);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe('https://vault.example.com/v1/pki/sign/webserver');
      expect(opts.method).toBe('POST');
      expect(opts.headers['X-Vault-Token']).toBe('test-vault-token');

      expect(result.certificatePem).toContain('BEGIN CERTIFICATE');
      expect(result.serialNumber).toBe('aa:bb:cc:dd');
      expect(result.notBefore).toBeTruthy();
      expect(result.notAfter).toBeTruthy();
    });

    it('should use "default" role when role is null', async () => {
      const config = makeVaultConfig({ role: null });
      const fetchMock = mockFetch({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: {
              certificate: 'CERT',
              issuing_ca: 'CA',
              ca_chain: null,
              serial_number: '11:22',
              not_before_unix: 1700000000,
              expiration: 1730000000,
            },
          }),
      });

      await adapter.submitCsr('CSR_PEM', config);

      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain('/sign/default');
    });

    it('should use ca_chain when available', async () => {
      const config = makeVaultConfig();
      mockFetch({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: {
              certificate: 'CERT',
              issuing_ca: 'SINGLE_CA',
              ca_chain: ['CHAIN1', 'CHAIN2'],
              serial_number: '11:22',
              not_before_unix: 1700000000,
              expiration: 1730000000,
            },
          }),
      });

      const result = await adapter.submitCsr('CSR_PEM', config);
      expect(result.chainPem).toBe('CHAIN1\nCHAIN2');
    });

    it('should throw on non-OK response', async () => {
      const config = makeVaultConfig();
      mockFetch({
        ok: false,
        status: 403,
        text: () => Promise.resolve('permission denied'),
      });

      await expect(adapter.submitCsr('CSR_PEM', config)).rejects.toThrow(
        /Vault PKI sign failed \(403\)/,
      );
    });
  });

  describe('revokeCertificate', () => {
    it('should POST to {endpoint}/revoke with serial', async () => {
      const config = makeVaultConfig();
      const fetchMock = mockFetch({ ok: true, status: 200 });

      await adapter.revokeCertificate('aa:bb:cc', 'keyCompromise', config);

      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe('https://vault.example.com/v1/pki/revoke');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body);
      expect(body.serial_number).toBe('aa:bb:cc');
    });

    it('should throw on non-OK response', async () => {
      const config = makeVaultConfig();
      mockFetch({
        ok: false,
        status: 500,
        text: () => Promise.resolve('internal error'),
      });

      await expect(
        adapter.revokeCertificate('aa:bb:cc', 'keyCompromise', config),
      ).rejects.toThrow(/Vault PKI revoke failed/);
    });
  });

  describe('healthCheck', () => {
    it('should GET {vault_addr}/v1/sys/health', async () => {
      const config = makeVaultConfig();
      const fetchMock = mockFetch({ ok: true, status: 200 });

      const healthy = await adapter.healthCheck(config);

      expect(healthy).toBe(true);
      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('https://vault.example.com/v1/sys/health');
    });

    it('should return false on non-OK response', async () => {
      const config = makeVaultConfig();
      mockFetch({ ok: false, status: 503 });

      const healthy = await adapter.healthCheck(config);
      expect(healthy).toBe(false);
    });

    it('should return false on network error', async () => {
      const config = makeVaultConfig();
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'));

      const healthy = await adapter.healthCheck(config);
      expect(healthy).toBe(false);
    });
  });
});

describe('extractVaultAddr', () => {
  it('should extract base URL from PKI mount path', () => {
    expect(extractVaultAddr('https://vault.example.com/v1/pki')).toBe(
      'https://vault.example.com',
    );
  });

  it('should handle paths with ports', () => {
    expect(extractVaultAddr('https://vault.example.com:8200/v1/pki')).toBe(
      'https://vault.example.com:8200',
    );
  });

  it('should return as-is for non-URL strings', () => {
    expect(extractVaultAddr('not-a-url')).toBe('not-a-url');
  });
});

// ─── RestCaAdapter ──────────────────────────────────────────────────────────

describe('RestCaAdapter', () => {
  let adapter: RestCaAdapter;

  beforeEach(() => {
    adapter = new RestCaAdapter();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('submitCsr', () => {
    it('should POST to {endpoint}/issue with CSR and auth headers', async () => {
      const config = makeRestConfig();
      const fetchMock = mockFetch({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            certificate: '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----',
            chain: '-----BEGIN CERTIFICATE-----\nCHAIN\n-----END CERTIFICATE-----',
            serial_number: 'AABBCCDD',
            not_before: '2024-01-01T00:00:00Z',
            not_after: '2025-01-01T00:00:00Z',
          }),
      });

      const result = await adapter.submitCsr('CSR_PEM', config);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe('https://ca.example.com/api/issue');
      expect(opts.headers['X-Api-Key']).toBe('test-api-key');
      expect(result.certificatePem).toContain('BEGIN CERTIFICATE');
      expect(result.serialNumber).toBe('AABBCCDD');
    });

    it('should use Bearer token when authHeaders is null', async () => {
      const config = makeRestConfig({
        authHeaders: null,
        authToken: 'bearer-token-123',
      });
      const fetchMock = mockFetch({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            certificate: 'CERT',
            chain: null,
            serial_number: '11',
            not_before: '2024-01-01T00:00:00Z',
            not_after: '2025-01-01T00:00:00Z',
          }),
      });

      await adapter.submitCsr('CSR_PEM', config);

      const [, opts] = fetchMock.mock.calls[0];
      expect(opts.headers['Authorization']).toBe('Bearer bearer-token-123');
    });

    it('should throw on non-OK response', async () => {
      const config = makeRestConfig();
      mockFetch({
        ok: false,
        status: 400,
        text: () => Promise.resolve('invalid CSR'),
      });

      await expect(adapter.submitCsr('bad', config)).rejects.toThrow(
        /REST CA issue failed \(400\)/,
      );
    });
  });

  describe('revokeCertificate', () => {
    it('should POST to {endpoint}/revoke with serial and reason', async () => {
      const config = makeRestConfig();
      const fetchMock = mockFetch({ ok: true, status: 200 });

      await adapter.revokeCertificate('AABB', 'keyCompromise', config);

      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe('https://ca.example.com/api/revoke');
      const body = JSON.parse(opts.body);
      expect(body.serial_number).toBe('AABB');
      expect(body.reason).toBe('keyCompromise');
    });

    it('should throw on non-OK response', async () => {
      const config = makeRestConfig();
      mockFetch({
        ok: false,
        status: 500,
        text: () => Promise.resolve('server error'),
      });

      await expect(
        adapter.revokeCertificate('AABB', 'keyCompromise', config),
      ).rejects.toThrow(/REST CA revoke failed/);
    });
  });

  describe('healthCheck', () => {
    it('should GET {endpoint}/health', async () => {
      const config = makeRestConfig();
      const fetchMock = mockFetch({ ok: true, status: 200 });

      const healthy = await adapter.healthCheck(config);

      expect(healthy).toBe(true);
      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('https://ca.example.com/api/health');
    });

    it('should return false on failure', async () => {
      const config = makeRestConfig();
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('timeout'));

      const healthy = await adapter.healthCheck(config);
      expect(healthy).toBe(false);
    });
  });
});

// ─── CaAdapterFactory ──────────────────────────────────────────────────────

describe('getCaAdapter', () => {
  it('should return VaultPkiAdapter for VAULT_PKI type', () => {
    const adapter = getCaAdapter(makeVaultConfig());
    expect(adapter).toBeInstanceOf(VaultPkiAdapter);
  });

  it('should return RestCaAdapter for REST_CA type', () => {
    const adapter = getCaAdapter(makeRestConfig());
    expect(adapter).toBeInstanceOf(RestCaAdapter);
  });

  it('should throw for unknown CA type', () => {
    const config = makeVaultConfig({ type: 'UNKNOWN' as 'VAULT_PKI' });
    expect(() => getCaAdapter(config)).toThrow(/Unknown CA type/);
  });
});

describe('getCaAdapterByType', () => {
  it('should return VaultPkiAdapter for VAULT_PKI', () => {
    const adapter = getCaAdapterByType('VAULT_PKI');
    expect(adapter).toBeInstanceOf(VaultPkiAdapter);
  });

  it('should return RestCaAdapter for REST_CA', () => {
    const adapter = getCaAdapterByType('REST_CA');
    expect(adapter).toBeInstanceOf(RestCaAdapter);
  });
});

// ─── CaConfigRepository ────────────────────────────────────────────────────

describe('CaConfigRepository', () => {
  // NOTE: CaConfigRepository depends on the `ca_configs` Prisma model.
  // Full integration tests require the table to exist. Here we verify
  // the module can be imported and the class instantiated.

  it('should be importable', async () => {
    const mod = await import('../repositories/caConfigRepo.js');
    expect(mod.CaConfigRepository).toBeDefined();
  });

  it('should instantiate with a PrismaClient-like object', async () => {
    const { CaConfigRepository } = await import('../repositories/caConfigRepo.js');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new CaConfigRepository({} as any);
    expect(repo).toBeDefined();
  });
});
