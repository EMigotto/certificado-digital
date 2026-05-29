/**
 * CA Configuration Repository.
 *
 * Reads CA integration settings from the `ca_configs` table.
 * NOTE: The `ca_configs` table must exist before this repository is used
 *       at runtime. See docs/features/ciclo-de-vida/infrastructure.md.
 */

import type { PrismaClient, CaConfig } from '@prisma/client';
import { getCaAdapter } from '../adapters/caAdapterFactory.js';
import type { CaConfig as CaAdapterConfig } from '../adapters/caAdapter.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Map a Prisma CaConfig row to the adapter-level CaConfig interface.
 */
function toAdapterConfig(row: CaConfig): CaAdapterConfig {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    endpoint: row.endpoint,
    authToken: row.authToken,
    authHeaders: (row.authHeaders ?? null) as Record<string, string> | null,
    role: row.role,
    enabled: row.enabled,
  };
}

// ─── Repository class ───────────────────────────────────────────────────────

export class CaConfigRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Retrieve all CA configurations, optionally filtered by enabled status.
   */
  async findAll(enabledOnly = false): Promise<CaAdapterConfig[]> {
    const rows = await this.prisma.caConfig.findMany({
      where: enabledOnly ? { enabled: true } : undefined,
      orderBy: { name: 'asc' },
    });
    return rows.map(toAdapterConfig);
  }

  /**
   * Find a CA configuration by its UUID.
   */
  async findById(id: string): Promise<CaAdapterConfig | null> {
    const row = await this.prisma.caConfig.findUnique({ where: { id } });
    return row ? toAdapterConfig(row) : null;
  }

  /**
   * Find a CA configuration by its unique name.
   */
  async findByName(name: string): Promise<CaAdapterConfig | null> {
    const row = await this.prisma.caConfig.findUnique({ where: { name } });
    return row ? toAdapterConfig(row) : null;
  }

  /**
   * Run a health check against a specific CA configuration.
   * Returns true if the CA endpoint is reachable and healthy.
   */
  async healthCheck(id: string): Promise<boolean> {
    const caConfig = await this.findById(id);
    if (!caConfig) return false;

    const adapter = getCaAdapter(caConfig);
    return adapter.healthCheck(caConfig);
  }
}
