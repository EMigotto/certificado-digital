/**
 * Audit table component (AC 21, 32-34).
 * Renders audit log entries with timestamp, actor, action, target, result.
 */

import type { AuditEntryDTO } from '../api.js';

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }) + ' ' + d.toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function actorInitials(name: string): string {
  return name.split(/[\s-]+/).map(w => w[0]?.toUpperCase() || '').slice(0, 2).join('');
}

export function renderAuditTable(entries: AuditEntryDTO[]): string {
  if (entries.length === 0) {
    return `
      <div class="panel">
        <div class="empty-state">
          <div class="empty-state-text">Nenhuma entrada de auditoria encontrada</div>
        </div>
      </div>`;
  }

  const rows = entries.map(
    (e) => `
    <div class="audit-row">
      <div class="audit-time">${formatTimestamp(e.timestamp)}</div>
      <div class="audit-actor">
        <div class="avatar">${actorInitials(e.actor)}</div>
        ${escapeHtml(e.actor)}
      </div>
      <div class="audit-event">
        <span class="verb">${escapeHtml(e.action)}</span>
        <span class="target">${escapeHtml(e.cert_cn)}</span>
      </div>
      <div class="audit-result ${e.result === 'SUCCESS' ? 'success' : 'fail'}">${escapeHtml(e.result)}</div>
    </div>`,
  );

  return `
    <div class="panel">
      <div class="audit-row" style="background:var(--surface-2);border-radius:8px 8px 0 0;">
        <div class="audit-time" style="font-weight:500;color:var(--text-mute);text-transform:uppercase;letter-spacing:0.1em;font-size:10px;">Timestamp</div>
        <div class="audit-actor" style="font-weight:500;color:var(--text-mute);text-transform:uppercase;letter-spacing:0.1em;font-size:10px;">Ator</div>
        <div class="audit-event" style="font-weight:500;color:var(--text-mute);text-transform:uppercase;letter-spacing:0.1em;font-size:10px;">Evento</div>
        <div class="audit-result" style="font-weight:500;color:var(--text-mute);text-transform:uppercase;letter-spacing:0.1em;font-size:10px;">Resultado</div>
      </div>
      ${rows.join('')}
    </div>`;
}
