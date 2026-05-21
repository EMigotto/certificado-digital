/**
 * Certificate detail page (AC 19-23, 29, 43-44).
 * Breadcrumb, metadata grid, PEM display, tags, actions, audit log.
 */

import {
  getCertificate,
  updateCertificate,
  deleteCertificate,
  downloadCertificate,
  getCertificateAudit,
} from '../api.js';
import type { CertificateDTO, AuditEntryDTO } from '../api.js';
import { computeStatus, renderBadge, daysRemaining } from '../components/badge.js';
import { renderAuditTable } from '../components/audit-table.js';

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Fallback certificate for when API is not available
function fallbackCert(id: string): CertificateDTO {
  return {
    id,
    common_name: 'api-payments.bank.internal',
    sans: ['payments-v2.bank.internal', 'payments-canary.bank.internal'],
    serial: '73:4E:85:2A:BB:CE:9F:10',
    issuer: 'Vault PKI Intermediate CA v3',
    not_before: '2024-01-15T00:00:00Z',
    not_after: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    algorithm: 'RSA 2048',
    fingerprint_sha256: 'A4:3B:9C:D2:E5:F1:8A:7B:C6:D3:E0:F4:9A:2B:5C:D8:E1:F3:7A:4B:C9:D0:E2:F5:8A:1B:3C:D4:E6:F7:9A:0B',
    owner: 'time-pagamentos',
    application: 'API Payments',
    environment: 'prd',
    zone: 'bank-prd',
    ca_provider: 'Vault PKI',
    revoked: false,
    pem_content: '-----BEGIN CERTIFICATE-----\nMIIDdzCCAl+gAwIBAgIEAgAAuTANBgkqhkiG9w0BAQUFADBaMQswCQYD\nVQQGEwJJRTESMBAGA1UEChMJQmFsdGltb3JlMRMwEQYDVQQLEwpDeWJl\nclRydXN0MSIwIAYDVQQDExlCYWx0aW1vcmUgQ3liZXJUcnVzdCBS\nb290MB4XDTAwMDUxMjE4NDYwMFoXDTI1MDUxMjIzNTkwMFowWjEL\nMAkGA1UEBhMCSUUxEjAQBgNVBAoTCUJhbHRpbW9yZTETMBEGA1UE\nCxMKQ3liZXJUcnVzdDEiMCAGA1UEAxMZQmFsdGltb3JlIEN5YmVy\nVHJ1c3QgUm9vdDCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoC\nggEBAKMEuyKrmD1X6CZymrV51Cni4eiVgLGw41uOKymaZN+hXe2w\nCQVt2yguzmKiYv60iNoS6zjrIZ3AQSsBUnuId9Mcj8e6uYi1agnn\nc+gRQKfRzMpijS3ljwumUNKoUMMo6vWrJYeKmpYcqWe4PwzV9/lS\nEy/CG9VwcPCPwBLKBsua4dnKM3p31vjsufFoREJIE9LAwqSuXmD+\ntqYF/LTdB1kC1FkYmGP1pWPgkAx9XbIGevOF6uvUA65ehD5f/xXt\nabz5OTZydc93Uk3zyZAsuT3lySNTPx8kmCFcB5kpvcY67Oduhjpr\nl3RjM71oGDHweI12v/yejl0qhqdNkNwnGjkCAwEAAaNFMEMwHQYD\nVR0OBBYEFOWdWTCCR1jMrPoIVDaGezq1BE3wMBIGA1UdEwEB/wQI\nMAYBAf8CAQMwDgYDVR0PAQH/BAQDAgEGMA0GCSqGSIb3DQEBBQUA\nA4IBAQCFDF2O5G9RaEIFoN27TyclhAO992T9Ldcw46QQF+vaKSm2\neT929hkTI7gQCvlYpNRhcL0EYWoSihfVCr3FvDB81ukMJY2GQE/s\nzKN+OMY3EU/t3WgxjkzSswF07r51XgdIGn9w/xZchMB5hbgF/X++\nZRGjD8ACtPhSNzkE1akxehi/oCr0Epn3o0WC4zxe9Z2etciefC7I\npJ5OCBRLbf1wbWsaY71k5h+3zvDyny67G7fyUIhzksLi4xaNmjIC\nq44Y3ekQEe5+NauQrz4wlHrQMz2nZQ/1/I6eYs9HRCwBXbsdtTLS\nR9I4LtD+gdwyah617jzV/OeBHRnDJELqYzmp\n-----END CERTIFICATE-----',
    tags: { criticality: 'high', 'auto-renew': 'true' },
    custom_fields: {},
    description: 'Payment gateway mTLS certificate',
    created_at: '2024-01-15T10:30:00Z',
    updated_at: '2024-06-01T14:22:00Z',
  };
}

function fallbackAudit(): AuditEntryDTO[] {
  return [
    { id: 'a1', cert_id: 'cert-1', cert_cn: 'api-payments.bank.internal', action: 'CREATE', actor: 'system', result: 'SUCCESS', details: {}, timestamp: '2024-01-15T10:30:00Z' },
    { id: 'a2', cert_id: 'cert-1', cert_cn: 'api-payments.bank.internal', action: 'UPDATE', actor: 'rafael.costa', result: 'SUCCESS', details: {}, timestamp: '2024-03-20T14:15:00Z' },
  ];
}

export async function renderDetail(el: HTMLElement, params: Record<string, string>): Promise<void> {
  const certId = params.id;
  if (!certId) {
    window.location.hash = '#/certificates';
    return;
  }

  el.innerHTML = `<div class="loading">Carregando certificado...</div>`;

  let cert: CertificateDTO;
  let auditEntries: AuditEntryDTO[];

  try {
    [cert, auditEntries] = await Promise.all([
      getCertificate(certId),
      getCertificateAudit(certId),
    ]);
  } catch {
    cert = fallbackCert(certId);
    auditEntries = fallbackAudit();
  }

  const status = computeStatus(cert.not_after, cert.revoked);
  const days = daysRemaining(cert.not_after);
  const sansList = cert.sans.length > 0
    ? cert.sans.map(s => escapeHtml(s)).join(', ')
    : 'Nenhum';

  const tagEntries = Object.entries(cert.tags);
  const tagsHtml = tagEntries.length > 0
    ? tagEntries.map(([k, v]) =>
        `<span class="tag">${escapeHtml(k)}: ${escapeHtml(v)} <span class="tag-remove" data-tag-key="${escapeHtml(k)}">×</span></span>`
      ).join('')
    : '<span style="color:var(--text-mute);font-size:12px;">Nenhuma tag</span>';

  el.innerHTML = `
    <section id="detalhe">
      <div class="detail-head">
        <div class="breadcrumb">
          <a href="#/certificates">Certificados</a>
          <span class="sep">/</span>
          <span class="cur">${escapeHtml(cert.common_name)}</span>
        </div>
        <div class="detail-title">
          ${escapeHtml(cert.common_name)}
          ${renderBadge(status)}
        </div>
        <div style="font-size:12px;color:var(--text-dim);">
          ${escapeHtml(cert.description || '')}
        </div>
        <div class="detail-actions">
          <button class="btn btn-secondary" id="download-btn">
            <svg width="14" height="14" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download PEM
          </button>
          <button class="btn btn-secondary" id="edit-tags-btn">
            <svg width="14" height="14" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            Editar tags
          </button>
          <button class="btn btn-danger" id="delete-btn">
            <svg width="14" height="14" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Excluir
          </button>
        </div>
      </div>

      <div class="detail-grid">
        <div>
          <!-- PKI Metadata Grid -->
          <div class="info-grid" style="margin-bottom:20px;">
            <div class="info-item">
              <div class="info-label">Common Name</div>
              <div class="info-value">${escapeHtml(cert.common_name)}</div>
            </div>
            <div class="info-item">
              <div class="info-label">SANs</div>
              <div class="info-value">${sansList}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Issuer</div>
              <div class="info-value">${escapeHtml(cert.issuer)}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Serial Number</div>
              <div class="info-value">${escapeHtml(cert.serial)}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Fingerprint (SHA-256)</div>
              <div class="info-value">${escapeHtml(cert.fingerprint_sha256)}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Algoritmo</div>
              <div class="info-value">${escapeHtml(cert.algorithm)}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Válido desde</div>
              <div class="info-value">${formatDate(cert.not_before)}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Expira em</div>
              <div class="info-value">${formatDate(cert.not_after)} <span style="color:${days < 7 ? 'var(--crit)' : days <= 30 ? 'var(--warn)' : 'var(--ok)'}"> (${days} dias)</span></div>
            </div>
          </div>

          <!-- PEM Content -->
          <div class="panel" style="margin-bottom:20px;">
            <div class="panel-head">
              <div class="panel-title">Certificado PEM</div>
            </div>
            <div class="code-block" id="pem-block">${cert.pem_content ? escapeHtml(cert.pem_content) : '<span style="color:var(--text-mute)">PEM não disponível</span>'}<button class="copy-btn" id="copy-pem-btn">Copiar</button></div>
          </div>

          <!-- Per-cert audit log -->
          <div style="margin-bottom:20px;">
            <div style="font-size:15px;font-weight:600;margin-bottom:16px;">Audit Log</div>
            ${renderAuditTable(auditEntries)}
          </div>
        </div>

        <div>
          <!-- Organizational Info -->
          <div class="panel" style="margin-bottom:20px;">
            <div class="panel-head">
              <div class="panel-title">Informações</div>
            </div>
            <div class="info-grid" style="border:none;background:none;">
              <div class="info-item">
                <div class="info-label">Owner</div>
                <div class="info-value sans">${escapeHtml(cert.owner)}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Application</div>
                <div class="info-value sans">${escapeHtml(cert.application)}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Environment</div>
                <div class="info-value">${escapeHtml(cert.environment)}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Zone</div>
                <div class="info-value">${escapeHtml(cert.zone)}</div>
              </div>
              <div class="info-item">
                <div class="info-label">CA Provider</div>
                <div class="info-value">${escapeHtml(cert.ca_provider)}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Criado em</div>
                <div class="info-value">${formatDate(cert.created_at)}</div>
              </div>
            </div>
          </div>

          <!-- Tags -->
          <div class="panel" id="tags-panel">
            <div class="panel-head">
              <div class="panel-title">Tags</div>
            </div>
            <div class="tag-list" id="tag-list">
              ${tagsHtml}
            </div>
            <div id="tag-input-area" style="margin-top:12px;display:none;">
              <div class="form-row-2" style="margin-bottom:8px;">
                <input class="form-input" id="tag-key-input" placeholder="chave" style="font-size:12px;">
                <input class="form-input" id="tag-value-input" placeholder="valor" style="font-size:12px;">
              </div>
              <button class="btn btn-primary" id="tag-save-btn" style="margin-left:0;font-size:12px;padding:6px 12px;">Adicionar tag</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;

  // Attach events
  attachDetailEvents(cert);
}

function attachDetailEvents(cert: CertificateDTO): void {
  // Download
  document.getElementById('download-btn')?.addEventListener('click', () => {
    downloadCertificate(cert.id);
  });

  // Copy PEM
  document.getElementById('copy-pem-btn')?.addEventListener('click', async () => {
    if (cert.pem_content) {
      try {
        await navigator.clipboard.writeText(cert.pem_content);
        const btn = document.getElementById('copy-pem-btn');
        if (btn) { btn.textContent = 'Copiado!'; setTimeout(() => { btn.textContent = 'Copiar'; }, 2000); }
      } catch {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = cert.pem_content;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
    }
  });

  // Edit tags
  document.getElementById('edit-tags-btn')?.addEventListener('click', () => {
    const area = document.getElementById('tag-input-area');
    if (area) area.style.display = area.style.display === 'none' ? 'block' : 'none';
  });

  // Save tag
  document.getElementById('tag-save-btn')?.addEventListener('click', async () => {
    const keyInput = document.getElementById('tag-key-input') as HTMLInputElement;
    const valueInput = document.getElementById('tag-value-input') as HTMLInputElement;
    const key = keyInput?.value.trim();
    const value = valueInput?.value.trim();
    if (!key || !value) return;

    const newTags = { ...cert.tags, [key]: value };
    try {
      await updateCertificate(cert.id, { tags: newTags } as Partial<CertificateDTO>);
      cert.tags = newTags;
    } catch {
      cert.tags = newTags;
    }

    // Update UI
    const tagList = document.getElementById('tag-list');
    if (tagList) {
      const tagEntries = Object.entries(cert.tags);
      tagList.innerHTML = tagEntries.map(([k, v]) =>
        `<span class="tag">${escapeHtml(k)}: ${escapeHtml(v)} <span class="tag-remove" data-tag-key="${escapeHtml(k)}">×</span></span>`
      ).join('');
      attachTagRemoveEvents(cert);
    }
    keyInput.value = '';
    valueInput.value = '';
  });

  // Remove tag
  attachTagRemoveEvents(cert);

  // Delete
  document.getElementById('delete-btn')?.addEventListener('click', () => {
    showDeleteConfirmation(cert);
  });
}

function attachTagRemoveEvents(cert: CertificateDTO): void {
  document.querySelectorAll('.tag-remove').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const key = (btn as HTMLElement).dataset.tagKey;
      if (!key) return;
      const newTags = { ...cert.tags };
      delete newTags[key];
      try {
        await updateCertificate(cert.id, { tags: newTags } as Partial<CertificateDTO>);
        cert.tags = newTags;
      } catch {
        cert.tags = newTags;
      }
      // Remove from UI
      const parent = btn.parentElement;
      if (parent) parent.remove();
    });
  });
}

function showDeleteConfirmation(cert: CertificateDTO): void {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-title">Excluir certificado</div>
      <div class="modal-text">Tem certeza que deseja excluir <strong>${escapeHtml(cert.common_name)}</strong>? Esta ação não pode ser desfeita.</div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
        <button class="btn btn-danger" id="modal-confirm">Excluir</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('modal-cancel')?.addEventListener('click', () => {
    overlay.remove();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.getElementById('modal-confirm')?.addEventListener('click', async () => {
    try {
      await deleteCertificate(cert.id);
    } catch {
      // Continue to navigate even if API is unavailable
    }
    overlay.remove();
    window.location.hash = '#/certificates';
  });
}
