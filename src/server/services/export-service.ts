/**
 * Export service — CSV & JSON certificate list export.
 *
 * Covers ACs: 31, 40.
 *
 * Generates downloadable files with timestamp filenames
 * (e.g. `certs_export_20240115.csv`).
 */
import {
  CertificateService,
  type CertificateDetail,
  type ListParams,
} from './certificate-service.js';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface ExportResult {
  filename: string;
  contentType: string;
  data: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function timestamp(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/** Escape a field for CSV (RFC 4180). */
function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

export class ExportService {
  constructor(private certService: CertificateService) {}

  /**
   * Export filtered certificate list as CSV (AC 31).
   *
   * Columns: CN, SANs, Owner, Environment, CA, Status, Days until expiration, Tags
   */
  exportCsv(
    params: Omit<ListParams, 'page' | 'page_size'>,
    now: Date = new Date(),
  ): ExportResult {
    const certs = this.certService.listAll(params, now);

    const header = [
      'CN',
      'SANs',
      'Owner',
      'Environment',
      'CA',
      'Status',
      'Days until expiration',
      'Tags',
    ].join(',');

    const rows = certs.map((c) =>
      [
        csvEscape(c.commonName),
        csvEscape(c.sans.join('; ')),
        csvEscape(c.owner),
        csvEscape(c.environment),
        csvEscape(c.caProvider),
        csvEscape(c.statusLabel),
        String(c.daysUntilExpiration),
        csvEscape(
          Object.entries(c.tags)
            .map(([k, v]) => `${k}=${v}`)
            .join('; '),
        ),
      ].join(','),
    );

    return {
      filename: `certs_export_${timestamp()}.csv`,
      contentType: 'text/csv; charset=utf-8',
      data: [header, ...rows].join('\n'),
    };
  }

  /**
   * Export filtered certificate list as JSON array (AC 40).
   */
  exportJson(
    params: Omit<ListParams, 'page' | 'page_size'>,
    now: Date = new Date(),
  ): ExportResult {
    const certs = this.certService.listAll(params, now);

    return {
      filename: `certs_export_${timestamp()}.json`,
      contentType: 'application/json; charset=utf-8',
      data: JSON.stringify(certs, null, 2),
    };
  }
}
