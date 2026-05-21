/**
 * Status badge component.
 * Maps status → color class and Portuguese label (AC 45).
 */

export type StatusType = 'valid' | 'attention' | 'critical' | 'expired' | 'revoked';

const STATUS_MAP: Record<StatusType, { label: string; cssClass: string }> = {
  valid:     { label: 'Válido',   cssClass: 'b-ok' },
  attention: { label: 'Atenção',  cssClass: 'b-warn' },
  critical:  { label: 'Crítico',  cssClass: 'b-crit' },
  expired:   { label: 'Expirado', cssClass: 'b-crit' },
  revoked:   { label: 'Revogado', cssClass: 'b-rev' },
};

export function computeStatus(notAfter: string, revoked: boolean): StatusType {
  if (revoked) return 'revoked';
  const days = Math.floor(
    (new Date(notAfter).getTime() - Date.now()) / 86_400_000,
  );
  if (days <= 0) return 'expired';
  if (days < 7) return 'critical';
  if (days <= 30) return 'attention';
  return 'valid';
}

export function daysRemaining(notAfter: string): number {
  return Math.floor(
    (new Date(notAfter).getTime() - Date.now()) / 86_400_000,
  );
}

export function renderBadge(status: StatusType): string {
  const info = STATUS_MAP[status];
  return `<span class="badge ${info.cssClass}"><span class="badge-dot"></span>${info.label}</span>`;
}

export function renderDaysLeft(notAfter: string): string {
  const days = daysRemaining(notAfter);
  let cls = '';
  if (days < 7) cls = 'crit';
  else if (days <= 30) cls = 'warn';
  return `<span class="days-left ${cls}">${days} dias</span>`;
}

export function renderEnvTag(zone: string, env: string): string {
  const isPrd = env === 'prd';
  return `<span class="env-tag ${isPrd ? 'prd' : ''}">${zone ? zone + ' / ' : ''}${env}</span>`;
}
