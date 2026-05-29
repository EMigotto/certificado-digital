/**
 * CA Adapter Factory.
 *
 * Resolves the correct CaAdapter implementation based on the CaConfig type.
 */

import type { CaAdapter, CaConfig, CaType } from './caAdapter.js';
import { VaultPkiAdapter } from './vaultPkiAdapter.js';
import { RestCaAdapter } from './restCaAdapter.js';

// Singleton instances — adapters are stateless, so one per type suffices.
const adapters: Record<CaType, CaAdapter> = {
  VAULT_PKI: new VaultPkiAdapter(),
  REST_CA: new RestCaAdapter(),
};

/**
 * Get the appropriate CA adapter for the given configuration.
 *
 * @throws Error if `config.type` is not a recognised CA type.
 */
export function getCaAdapter(config: CaConfig): CaAdapter {
  const adapter = adapters[config.type];
  if (!adapter) {
    throw new Error(`Unknown CA type: ${config.type}`);
  }
  return adapter;
}

/**
 * Get a CA adapter by type string.
 *
 * @throws Error if `type` is not a recognised CA type.
 */
export function getCaAdapterByType(type: CaType): CaAdapter {
  const adapter = adapters[type];
  if (!adapter) {
    throw new Error(`Unknown CA type: ${type}`);
  }
  return adapter;
}
