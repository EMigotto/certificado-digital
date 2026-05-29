/**
 * Email templates for expiration alert notifications.
 *
 * Provides both HTML and plain-text renderings that include:
 *   - Certificate Common Name (CN)
 *   - Owner
 *   - Expiry date
 *   - CA name
 *   - Zone / environment
 *   - Days remaining
 *   - Actionable instructions
 */

// ─── Template data ─────────────────────────────────────────────────────────

export interface AlertEmailData {
  /** Certificate common name */
  certificateCn: string;

  /** Certificate owner (person / team) */
  owner: string;

  /** Absolute expiry date (ISO-8601 string or Date) */
  expiryDate: string;

  /** Days remaining until expiry at the time the alert was raised */
  daysUntilExpiry: number;

  /** Certificate authority name */
  caName: string;

  /** Zone identifier (may be null) */
  zone: string | null;

  /** Deployment environment (may be null) */
  environment: string | null;

  /** Subject Alternative Names */
  sans: string[];

  /** Alert threshold that fired (e.g. 90, 30, 7, 1) */
  threshold: number;

  /** Optional link to the certificate detail page in the UI */
  actionUrl?: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function severityColor(days: number): string {
  if (days <= 1) return '#dc2626'; // red-600
  if (days <= 7) return '#ea580c'; // orange-600
  if (days <= 30) return '#d97706'; // amber-600
  return '#2563eb'; // blue-600
}

function severityLabel(days: number): string {
  if (days <= 1) return 'URGENT';
  if (days <= 7) return 'CRITICAL';
  if (days <= 30) return 'WARNING';
  return 'INFO';
}

// ─── HTML template ─────────────────────────────────────────────────────────

/**
 * Build the HTML body for an expiration alert email.
 */
export function buildAlertEmailHtml(data: AlertEmailData): string {
  const cn = escapeHtml(data.certificateCn);
  const owner = escapeHtml(data.owner);
  const ca = escapeHtml(data.caName);
  const zone = data.zone ? escapeHtml(data.zone) : '—';
  const env = data.environment ? escapeHtml(data.environment) : '—';
  const expiryFormatted = formatDate(data.expiryDate);
  const color = severityColor(data.daysUntilExpiry);
  const severity = severityLabel(data.daysUntilExpiry);
  const sansHtml =
    data.sans.length > 0
      ? data.sans.map((s) => `<li>${escapeHtml(s)}</li>`).join('')
      : '<li><em>None</em></li>';

  const actionSection = data.actionUrl
    ? `
      <tr>
        <td style="padding: 20px 30px 30px;">
          <a href="${escapeHtml(data.actionUrl)}"
             style="display: inline-block; padding: 12px 24px;
                    background-color: ${color}; color: #ffffff;
                    text-decoration: none; border-radius: 4px;
                    font-weight: 600; font-size: 14px;">
            View Certificate Details
          </a>
        </td>
      </tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0"
               style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background-color: ${color}; padding: 24px 30px; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700;">
                ⚠️ Certificate Expiration ${severity}
              </h1>
              <p style="margin: 8px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">
                ${data.daysUntilExpiry} day${data.daysUntilExpiry !== 1 ? 's' : ''} remaining
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 15px; line-height: 1.6;">
                The following certificate is expiring soon and requires attention:
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
                     style="border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
                <tr style="background-color: #f9fafb;">
                  <td style="padding: 10px 16px; font-weight: 600; color: #6b7280; font-size: 13px; width: 140px;">Common Name</td>
                  <td style="padding: 10px 16px; color: #111827; font-size: 14px; font-weight: 600;">${cn}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 16px; font-weight: 600; color: #6b7280; font-size: 13px; border-top: 1px solid #e5e7eb;">Owner</td>
                  <td style="padding: 10px 16px; color: #111827; font-size: 14px; border-top: 1px solid #e5e7eb;">${owner}</td>
                </tr>
                <tr style="background-color: #f9fafb;">
                  <td style="padding: 10px 16px; font-weight: 600; color: #6b7280; font-size: 13px; border-top: 1px solid #e5e7eb;">Expiry Date</td>
                  <td style="padding: 10px 16px; color: #111827; font-size: 14px; border-top: 1px solid #e5e7eb;">${expiryFormatted}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 16px; font-weight: 600; color: #6b7280; font-size: 13px; border-top: 1px solid #e5e7eb;">Days Remaining</td>
                  <td style="padding: 10px 16px; font-size: 14px; border-top: 1px solid #e5e7eb;">
                    <span style="color: ${color}; font-weight: 700;">${data.daysUntilExpiry}</span>
                  </td>
                </tr>
                <tr style="background-color: #f9fafb;">
                  <td style="padding: 10px 16px; font-weight: 600; color: #6b7280; font-size: 13px; border-top: 1px solid #e5e7eb;">CA</td>
                  <td style="padding: 10px 16px; color: #111827; font-size: 14px; border-top: 1px solid #e5e7eb;">${ca}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 16px; font-weight: 600; color: #6b7280; font-size: 13px; border-top: 1px solid #e5e7eb;">Zone</td>
                  <td style="padding: 10px 16px; color: #111827; font-size: 14px; border-top: 1px solid #e5e7eb;">${zone}</td>
                </tr>
                <tr style="background-color: #f9fafb;">
                  <td style="padding: 10px 16px; font-weight: 600; color: #6b7280; font-size: 13px; border-top: 1px solid #e5e7eb;">Environment</td>
                  <td style="padding: 10px 16px; color: #111827; font-size: 14px; border-top: 1px solid #e5e7eb;">${env}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 16px; font-weight: 600; color: #6b7280; font-size: 13px; border-top: 1px solid #e5e7eb; vertical-align: top;">SANs</td>
                  <td style="padding: 10px 16px; color: #111827; font-size: 14px; border-top: 1px solid #e5e7eb;">
                    <ul style="margin: 0; padding-left: 18px;">${sansHtml}</ul>
                  </td>
                </tr>
              </table>

              <p style="margin: 24px 0 0; color: #6b7280; font-size: 13px; line-height: 1.6;">
                <strong>Recommended action:</strong> Renew or replace this certificate before expiry
                to avoid service disruptions. Use the Certificado Digital dashboard or API to manage renewals.
              </p>
            </td>
          </tr>

          <!-- Action button -->${actionSection}

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 30px; border-top: 1px solid #e5e7eb; background-color: #f9fafb; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px; line-height: 1.5;">
                This is an automated notification from Certificado Digital.
                Alert threshold: ${data.threshold}-day policy.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Plain-text template ───────────────────────────────────────────────────

/**
 * Build the plain-text body for an expiration alert email.
 */
export function buildAlertEmailText(data: AlertEmailData): string {
  const severity = severityLabel(data.daysUntilExpiry);
  const expiryFormatted = formatDate(data.expiryDate);
  const sansText =
    data.sans.length > 0 ? data.sans.map((s) => `  - ${s}`).join('\n') : '  (none)';
  const actionText = data.actionUrl
    ? `\nView certificate details:\n${data.actionUrl}\n`
    : '';

  return `CERTIFICATE EXPIRATION ${severity}
${'='.repeat(50)}

The following certificate is expiring soon and requires attention:

  Common Name:    ${data.certificateCn}
  Owner:          ${data.owner}
  Expiry Date:    ${expiryFormatted}
  Days Remaining: ${data.daysUntilExpiry}
  CA:             ${data.caName}
  Zone:           ${data.zone ?? '—'}
  Environment:    ${data.environment ?? '—'}

  SANs:
${sansText}

Recommended action: Renew or replace this certificate before
expiry to avoid service disruptions. Use the Certificado Digital
dashboard or API to manage renewals.
${actionText}
---
This is an automated notification from Certificado Digital.
Alert threshold: ${data.threshold}-day policy.
`;
}

// ─── Subject builder ───────────────────────────────────────────────────────

/**
 * Build the email subject line for an alert notification.
 *
 * Format: `{prefix} Certificate expiring in {days} days: {cn}`
 *
 * @param data  Alert template data
 * @param prefix  Subject prefix (defaults to `[ALERT]`)
 */
export function buildAlertSubject(
  data: Pick<AlertEmailData, 'certificateCn' | 'daysUntilExpiry'>,
  prefix?: string | null,
): string {
  const pfx = prefix?.trim() || '[ALERT]';
  return `${pfx} Certificate expiring in ${data.daysUntilExpiry} day${data.daysUntilExpiry !== 1 ? 's' : ''}: ${data.certificateCn}`;
}
