/**
 * Search & filter logic for the certificate inventory.
 * Maps to AC Scenario Sets 1 (1.2–1.10) and 5 (performance).
 */

import type { Certificate } from './certificate.js';
import { daysUntilExpiration } from './certificate.js';

/* ------------------------------------------------------------------ */
/* Filter types                                                        */
/* ------------------------------------------------------------------ */

export interface ExpirationFilter {
  kind: 'expiration';
  /** Maximum days until expiry, e.g. 30 for "< 30d" */
  maxDays: number;
}

export interface EnvironmentFilter {
  kind: 'environment';
  value: 'dev' | 'hml' | 'prd';
}

export interface OwnerFilter {
  kind: 'owner';
  value: string;
}

export interface CaFilter {
  kind: 'ca';
  value: string;
}

export type InventoryFilter = ExpirationFilter | EnvironmentFilter | OwnerFilter | CaFilter;

/* ------------------------------------------------------------------ */
/* Filter badge display (AC 1.5, 1.6, 1.7, 1.8, 1.10)                */
/* ------------------------------------------------------------------ */

/**
 * Return human-readable badge label for a filter, e.g. "expira: < 30d".
 */
export function filterBadge(f: InventoryFilter): string {
  switch (f.kind) {
    case 'expiration':
      return `expira: < ${f.maxDays}d`;
    case 'environment':
      return `env: ${f.value}`;
    case 'owner':
      return `owner: ${f.value}`;
    case 'ca':
      return `ca: ${f.value}`;
  }
}

/* ------------------------------------------------------------------ */
/* Parse filter string (AC 1.15 — invalid filter handling)             */
/* ------------------------------------------------------------------ */

/**
 * Parse a filter string like "expira: < 30d" or "env: prd" into a
 * typed filter object. Returns `null` for invalid inputs.
 */
export function parseFilter(raw: string): InventoryFilter | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\w+)\s*:\s*(.+)$/);
  if (!match) return null;
  const [, key, value] = match;

  switch (key) {
    case 'expira': {
      const daysMatch = value.trim().match(/^<\s*(\d+)\s*d$/);
      if (!daysMatch) return null;
      const maxDays = Number(daysMatch[1]);
      if (!Number.isFinite(maxDays) || maxDays <= 0) return null;
      return { kind: 'expiration', maxDays };
    }
    case 'env': {
      const v = value.trim() as 'dev' | 'hml' | 'prd';
      if (!['dev', 'hml', 'prd'].includes(v)) return null;
      return { kind: 'environment', value: v };
    }
    case 'owner':
      return { kind: 'owner', value: value.trim() };
    case 'ca':
      return { kind: 'ca', value: value.trim() };
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Search — AC 1.2, 1.3, 1.4                                          */
/* ------------------------------------------------------------------ */

/**
 * Full-text search across CN, SANs, serial, and owner.
 * Case-insensitive partial match (AC 1.2, 1.3, 1.4).
 */
export function searchCertificates(certs: Certificate[], query: string): Certificate[] {
  if (!query.trim()) return certs;
  const q = query.toLowerCase();
  return certs.filter((c) => {
    if (c.commonName.toLowerCase().includes(q)) return true;
    if (c.sans.some((san) => san.toLowerCase().includes(q))) return true;
    if (c.serial.toLowerCase().includes(q)) return true;
    if (c.owner.toLowerCase().includes(q)) return true;
    return false;
  });
}

/* ------------------------------------------------------------------ */
/* Filter application — AC 1.5–1.9 (AND logic)                        */
/* ------------------------------------------------------------------ */

function applySingleFilter(
  certs: Certificate[],
  filter: InventoryFilter,
  now: Date = new Date(),
): Certificate[] {
  switch (filter.kind) {
    case 'expiration':
      return certs.filter((c) => {
        const days = daysUntilExpiration(c.notAfter, now);
        return days >= 0 && days < filter.maxDays;
      });
    case 'environment':
      return certs.filter((c) => c.environment === filter.value);
    case 'owner':
      return certs.filter((c) => c.owner === filter.value);
    case 'ca':
      return certs.filter((c) => c.issuer.includes(filter.value));
    default:
      return certs;
  }
}

/**
 * Apply multiple filters with AND logic (AC 1.9).
 */
export function applyFilters(
  certs: Certificate[],
  filters: InventoryFilter[],
  now: Date = new Date(),
): Certificate[] {
  return filters.reduce((acc, f) => applySingleFilter(acc, f, now), certs);
}
