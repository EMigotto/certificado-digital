/**
 * Zone domain types for C7 infrastructure zone management.
 *
 * Zones represent network/infrastructure segments (e.g. DMZ, internal,
 * restricted) used to organize certificates. Dates are ISO-8601 strings
 * at the API level.
 */

// ─── Zone ─────────────────────────────────────────────────────────────────

/** Full zone record */
export interface Zone {
  id: string;

  /** Unique zone name (e.g. "dmz", "internal", "restricted") */
  name: string;

  /** Optional human-readable description */
  description: string | null;

  /** Geographic or cloud region (e.g. "sa-east-1", "us-east-1") */
  region: string | null;

  /** Arbitrary key-value metadata */
  metadata: Record<string, unknown>;

  /** Record creation timestamp (ISO-8601) */
  createdAt: string;

  /** Record last-update timestamp (ISO-8601) */
  updatedAt: string;
}

// ─── Mutation Payloads ────────────────────────────────────────────────────

/** Payload for creating a new zone (system fields omitted) */
export type ZoneCreate = Omit<Zone, 'id' | 'createdAt' | 'updatedAt'>;

/** Payload for updating an existing zone (all fields optional) */
export type ZoneUpdate = Partial<ZoneCreate>;
