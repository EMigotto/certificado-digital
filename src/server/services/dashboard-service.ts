/**
 * Dashboard service — aggregation queries for KPI cards, heatmap, and alerts.
 *
 * Implements:
 *  - getStats()   → total, valid, expiringSoon, expired, revoked, growthLast7d
 *  - getHeatmap() → 90-day expiration distribution (one entry per day)
 *  - getAlerts()  → top-N certificates expiring soonest
 *
 * All queries run directly in SQLite (no in-memory aggregation).
 * See ADR §2.6 for the SQL design rationale.
 *
 * Covers AC 24, 25, 26, 27, 28.
 */

import type Database from 'better-sqlite3';

/* ------------------------------------------------------------------ */
/* Response types                                                      */
/* ------------------------------------------------------------------ */

export interface DashboardStats {
  /** Total managed certificates. */
  total: number;
  /** Not expired, not revoked. */
  valid: number;
  /** Expiring within 30 days (not expired, not revoked). */
  expiringSoon: number;
  /** Already expired (notAfter < now), not revoked. */
  expired: number;
  /** Revoked certificates. */
  revoked: number;
  /** Certificates created in the last 7 days. */
  growthLast7d: number;
}

export interface HeatmapEntry {
  /** Day offset from today (0 = today, 89 = +89 days). */
  dayOffset: number;
  /** Count of certificates expiring on that day. */
  count: number;
}

export interface AlertEntry {
  /** Certificate ID. */
  id: string;
  /** Common Name. */
  commonName: string;
  /** Environment (dev / hml / prd). */
  environment: string;
  /** CA Provider. */
  caProvider: string;
  /** Owning team / user. */
  owner: string;
  /** Days until expiration (positive = future, 0 = today). */
  daysRemaining: number;
}

/* ------------------------------------------------------------------ */
/* Service class                                                       */
/* ------------------------------------------------------------------ */

export class DashboardService {
  constructor(private readonly db: Database.Database) {}

  /**
   * KPI card statistics.
   *
   * AC 24: "Total gerenciados" — total count + 7d growth
   * AC 25: "Expiram < 30 dias" — expiringSoon count
   */
  getStats(): DashboardStats {
    const now = new Date().toISOString();

    // Total count
    const totalRow = this.db
      .prepare('SELECT COUNT(*) AS cnt FROM certificates')
      .get() as { cnt: number };

    // Valid: not expired, not revoked
    const validRow = this.db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM certificates
         WHERE not_after > ? AND revoked = 0`,
      )
      .get(now) as { cnt: number };

    // Expiring soon: within 30 days, not expired, not revoked
    const expiringSoonRow = this.db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM certificates
         WHERE not_after > ?
           AND not_after <= datetime(?, '+30 days')
           AND revoked = 0`,
      )
      .get(now, now) as { cnt: number };

    // Expired: notAfter <= now, not revoked
    const expiredRow = this.db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM certificates
         WHERE not_after <= ? AND revoked = 0`,
      )
      .get(now) as { cnt: number };

    // Revoked
    const revokedRow = this.db
      .prepare('SELECT COUNT(*) AS cnt FROM certificates WHERE revoked = 1')
      .get() as { cnt: number };

    // Growth in last 7 days
    const growthRow = this.db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM certificates
         WHERE created_at > datetime(?, '-7 days')`,
      )
      .get(now) as { cnt: number };

    return {
      total: totalRow.cnt,
      valid: validRow.cnt,
      expiringSoon: expiringSoonRow.cnt,
      expired: expiredRow.cnt,
      revoked: revokedRow.cnt,
      growthLast7d: growthRow.cnt,
    };
  }

  /**
   * 90-day expiration heatmap.
   *
   * Returns an array of 90 entries (day 0 = today, day 89 = +89 days).
   * Each entry has the count of non-revoked certificates expiring on that day.
   * Days with no expirations have count = 0.
   *
   * AC 27: 30×3 heatmap grid — 90 days, cell intensity = cert count
   * AC 28: tooltip data (count per day)
   */
  getHeatmap(): HeatmapEntry[] {
    const now = new Date().toISOString();

    // Query days that have expirations (sparse)
    const rows = this.db
      .prepare(
        `SELECT
           CAST(julianday(date(not_after)) - julianday(date(?)) AS INTEGER) AS day_offset,
           COUNT(*) AS count
         FROM certificates
         WHERE not_after >= date(?)
           AND not_after < date(?, '+90 days')
           AND revoked = 0
         GROUP BY day_offset`,
      )
      .all(now, now, now) as { day_offset: number; count: number }[];

    // Build a lookup from the sparse results
    const countByDay = new Map<number, number>();
    for (const row of rows) {
      countByDay.set(row.day_offset, row.count);
    }

    // Fill all 90 days (0..89), defaulting to 0
    const heatmap: HeatmapEntry[] = [];
    for (let d = 0; d < 90; d++) {
      heatmap.push({
        dayOffset: d,
        count: countByDay.get(d) ?? 0,
      });
    }

    return heatmap;
  }

  /**
   * Top-N certificates expiring soonest (critical alerts).
   *
   * Excludes expired and revoked certificates.
   * Sorted by nearest expiration first.
   *
   * AC 26: "Alertas críticos" — top 5, CN + env + owner + days, color-coded
   *
   * @param limit  Maximum number of alerts to return (default 5).
   */
  getAlerts(limit: number = 5): AlertEntry[] {
    const now = new Date().toISOString();

    const rows = this.db
      .prepare(
        `SELECT
           id,
           common_name,
           environment,
           ca_provider,
           owner,
           CAST(julianday(date(not_after)) - julianday(date(?)) AS INTEGER) AS days_remaining
         FROM certificates
         WHERE not_after > ?
           AND revoked = 0
         ORDER BY not_after ASC
         LIMIT ?`,
      )
      .all(now, now, limit) as {
      id: string;
      common_name: string;
      environment: string;
      ca_provider: string;
      owner: string;
      days_remaining: number;
    }[];

    return rows.map((row) => ({
      id: row.id,
      commonName: row.common_name,
      environment: row.environment,
      caProvider: row.ca_provider,
      owner: row.owner,
      daysRemaining: row.days_remaining,
    }));
  }
}
