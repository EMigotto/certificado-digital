/**
 * Certificate table component for inventory page (AC 5-18, 45, 49).
 * Renders table rows with CN/SANs, Zone/Env, Status, CA/Algorithm, Owner, Days left.
 */

import type { CertificateDTO } from '../api.js';
import { computeStatus, renderBadge, renderDaysLeft, renderEnvTag } from './badge.js';

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function sanSummary(sans: string[]): string {
  if (!sans || sans.length === 0) return '+ 0 SANs';
  if (sans.length === 1) return `+ 1 SAN`;
  return `+ ${sans.length} SANs`;
}

function extractAlgorithmInfo(algorithm: string): { algo: string; size: string } {
  // "RSA 2048" → { algo: "RSA", size: "2048" }
  const parts = algorithm.split(' ');
  return { algo: parts[0] || algorithm, size: parts.slice(1).join(' ') || '' };
}

export function renderCertTable(certs: CertificateDTO[]): string {
  if (certs.length === 0) {
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:30%">Common Name / SANs</th>
              <th>Zona / Env</th>
              <th>Status</th>
              <th>CA / Algoritmo</th>
              <th>Owner</th>
              <th>Expira em</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr><td colspan="7">
              <div class="empty-state">
                <div class="empty-state-text">Nenhum certificado encontrado</div>
              </div>
            </td></tr>
          </tbody>
        </table>
      </div>`;
  }

  const rows = certs.map((cert) => {
    const status = computeStatus(cert.not_after, cert.revoked);
    const sanText = sanSummary(cert.sans);
    const sanNames = cert.sans.length > 0 && cert.sans.length <= 3
      ? cert.sans.map(s => escapeHtml(s)).join(', ')
      : '';
    const sanDisplay = sanNames ? `${sanText}: ${sanNames}` : sanText;

    return `
      <tr data-cert-id="${escapeHtml(cert.id)}" onclick="window.location.hash='#/certificates/${encodeURIComponent(cert.id)}'">
        <td>
          <div class="cn-cell">${escapeHtml(cert.common_name)}
            <span class="san">${sanDisplay}</span>
          </div>
        </td>
        <td>${renderEnvTag(cert.zone, cert.environment)}</td>
        <td>${renderBadge(status)}</td>
        <td>
          <span class="env-tag">${escapeHtml(cert.ca_provider)}</span><br>
          <span style="font-family:var(--mono);font-size:11px;color:var(--text-mute)">${escapeHtml(cert.algorithm)}</span>
        </td>
        <td>${escapeHtml(cert.owner)}</td>
        <td>${renderDaysLeft(cert.not_after)}</td>
        <td>→</td>
      </tr>`;
  });

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width:30%">Common Name / SANs</th>
            <th>Zona / Env</th>
            <th>Status</th>
            <th>CA / Algoritmo</th>
            <th>Owner</th>
            <th>Expira em</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    </div>`;
}
