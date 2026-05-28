/**
 * Utility formatters for the certificate management UI.
 * Handles CN truncation, date formatting, number formatting, etc.
 */

/**
 * Truncates a Common Name or string to a max length with ellipsis.
 * Full text is always available in the title attribute (handled by component).
 *
 * @param cn - The Common Name string
 * @param maxLength - Maximum characters before truncation (default 40)
 * @returns Truncated string with '…' suffix, or original if under limit
 */
export function truncateCn(cn: string, maxLength = 40): string {
  if (!cn) return '';
  if (cn.length <= maxLength) return cn;
  return cn.slice(0, maxLength) + '…';
}

/**
 * Formats an ISO-8601 date string to a localized Brazilian date-time format.
 *
 * @param isoDate - ISO-8601 date string
 * @returns Formatted date string (e.g., "27/05/2026 14:32")
 */
export function formatDateTime(isoDate: string): string {
  if (!isoDate) return '—';
  try {
    const date = new Date(isoDate);
    if (isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return '—';
  }
}

/**
 * Formats an ISO-8601 date string to a short date format.
 *
 * @param isoDate - ISO-8601 date string
 * @returns Formatted date string (e.g., "27/05/2026")
 */
export function formatDate(isoDate: string): string {
  if (!isoDate) return '—';
  try {
    const date = new Date(isoDate);
    if (isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  } catch {
    return '—';
  }
}

/**
 * Calculates days remaining until a certificate expires.
 * Returns negative numbers for already-expired certificates.
 *
 * @param notAfter - ISO-8601 expiry date string
 * @returns Number of days (negative = expired)
 */
export function daysUntilExpiry(notAfter: string): number {
  if (!notAfter) return 0;
  const expiry = new Date(notAfter);
  const now = new Date();
  const diffMs = expiry.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Formats the days-until-expiry number for display.
 *
 * @param days - Number of days
 * @returns Formatted string (e.g., "2 dias", "-15 dias", "Hoje")
 */
export function formatDaysLeft(days: number): string {
  if (days === 0) return 'Hoje';
  if (days === 1) return '1 dia';
  if (days === -1) return '-1 dia';
  return `${days} dias`;
}

/**
 * Formats a number with Brazilian locale (e.g., 2847 → "2.847").
 *
 * @param value - The number to format
 * @returns Formatted number string
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value);
}

/**
 * Returns the SANs summary text for the table view.
 *
 * @param sans - Array of Subject Alternative Names
 * @returns Summary string (e.g., "+ 2 SANs", "+ 0 SANs", "+ 100 SANs")
 */
export function formatSansSummary(sans: string[]): string {
  const count = sans.length;
  if (count === 0) return '+ 0 SANs';
  if (count === 1) return '+ 1 SAN';
  return `+ ${count} SANs`;
}

/**
 * Derives the certificate status variant for Badge component.
 *
 * @param days - Days until expiry
 * @param revoked - Whether the cert is revoked
 * @returns Badge variant key
 */
export function getStatusVariant(
  days: number,
  revoked: boolean,
): 'ok' | 'warn' | 'crit' | 'rev' {
  if (revoked) return 'rev';
  if (days <= 0) return 'crit';
  if (days <= 30) return 'warn';
  return 'ok';
}

/**
 * Derives the status label for Badge component.
 *
 * @param days - Days until expiry
 * @param revoked - Whether the cert is revoked
 * @returns Status label string
 */
export function getStatusLabel(days: number, revoked: boolean): string {
  if (revoked) return 'Revogado';
  if (days <= 0) return 'Vencido';
  if (days <= 7) return 'Crítico';
  if (days <= 30) return 'Atenção';
  return 'Válido';
}
