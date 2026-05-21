/**
 * Alert list component for dashboard critical alerts panel (AC 26).
 * Shows top 5 certificates expiring soonest.
 */

import type { AlertDTO } from '../api.js';

function alertSeverity(days: number): string {
  if (days < 7) return 'crit';
  if (days <= 30) return 'warn';
  return '';
}

export function renderAlertList(alerts: AlertDTO[]): string {
  if (!alerts.length) {
    return `
      <div class="panel">
        <div class="panel-head">
          <div class="panel-title">Alertas críticos</div>
          <div class="panel-sub">Top 5</div>
        </div>
        <div class="empty-state">
          <div class="empty-state-text">Nenhum alerta no momento</div>
        </div>
      </div>`;
  }

  const items = alerts.map(
    (a) => `
    <div class="alert ${alertSeverity(a.days_remaining)}">
      <div class="alert-content">
        <div class="alert-cn">${escapeHtml(a.common_name)}</div>
        <div class="alert-meta">${escapeHtml(a.environment)} · ${escapeHtml(a.ca_provider)} · owner: ${escapeHtml(a.owner)}</div>
      </div>
      <div class="alert-days">${a.days_remaining}d</div>
    </div>`,
  );

  return `
    <div class="panel">
      <div class="panel-head">
        <div class="panel-title">Alertas críticos</div>
        <div class="panel-sub">Top 5</div>
      </div>
      <div class="alert-list">${items.join('')}</div>
    </div>`;
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
