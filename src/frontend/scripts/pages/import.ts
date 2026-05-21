/**
 * Import page — PEM/PKCS#12 single upload + CSV bulk (AC 1-4, 38-39, 46-48).
 * Tabs: Single file upload with metadata form / Bulk CSV upload.
 */

import { importPEM, importPKCS12, importCSV } from '../api.js';
import type { ImportResultDTO } from '../api.js';

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

let activeTab: 'single' | 'bulk' = 'single';

export async function renderImport(el: HTMLElement): Promise<void> {
  el.innerHTML = `
    <section id="import">
      <div class="sec-head">
        <div>
          <div class="sec-title">04 · <em>Importar</em> certificados</div>
          <div class="sec-tag" style="margin-top:8px">Upload PEM, PKCS#12 ou CSV<span class="cap">C3 · Import</span></div>
        </div>
      </div>

      <div class="tab-nav">
        <button class="tab-btn active" data-tab="single" id="tab-single">Certificado único</button>
        <button class="tab-btn" data-tab="bulk" id="tab-bulk">Import CSV em lote</button>
      </div>

      <div id="import-content"></div>
    </section>
  `;

  renderSingleTab();
  attachTabEvents();
}

function attachTabEvents(): void {
  const singleBtn = document.getElementById('tab-single');
  const bulkBtn = document.getElementById('tab-bulk');

  singleBtn?.addEventListener('click', () => {
    activeTab = 'single';
    singleBtn.classList.add('active');
    bulkBtn?.classList.remove('active');
    renderSingleTab();
  });

  bulkBtn?.addEventListener('click', () => {
    activeTab = 'bulk';
    bulkBtn.classList.add('active');
    singleBtn?.classList.remove('active');
    renderBulkTab();
  });
}

function renderSingleTab(): void {
  const content = document.getElementById('import-content');
  if (!content) return;

  content.innerHTML = `
    <div class="form-card">
      <div class="policy-note">
        <span>ℹ</span>
        <div><strong>Política:</strong> Certificados devem ser no formato PEM (.pem, .crt) ou PKCS#12 (.p12, .pfx). O owner e ambiente são obrigatórios.</div>
      </div>

      <div class="form-row">
        <label class="form-label">Arquivo do certificado</label>
        <div class="upload-zone" id="upload-zone-single">
          <div class="upload-icon">📄</div>
          <div class="upload-text">Arraste o arquivo aqui ou clique para selecionar</div>
          <div class="upload-hint">PEM (.pem, .crt) ou PKCS#12 (.p12, .pfx)</div>
          <input type="file" id="cert-file-input" accept=".pem,.crt,.p12,.pfx" style="display:none">
        </div>
        <div id="file-name" style="font-family:var(--mono);font-size:12px;color:var(--text-dim);margin-top:4px;"></div>
      </div>

      <div id="cert-preview-area"></div>

      <div id="pkcs12-password-row" class="form-row" style="display:none;">
        <label class="form-label">Senha PKCS#12</label>
        <input type="password" class="form-input" id="pkcs12-password" placeholder="Senha do arquivo .p12/.pfx">
      </div>

      <div class="form-row-2">
        <div class="form-row">
          <label class="form-label">Owner *</label>
          <input class="form-input" id="import-owner" placeholder="ex: time-pagamentos">
        </div>
        <div class="form-row">
          <label class="form-label">Application</label>
          <input class="form-input" id="import-application" placeholder="ex: API Payments">
        </div>
      </div>

      <div class="form-row-2">
        <div class="form-row">
          <label class="form-label">Environment *</label>
          <select class="form-input" id="import-environment" style="cursor:pointer;">
            <option value="">Selecione...</option>
            <option value="dev">dev</option>
            <option value="hml">hml</option>
            <option value="prd">prd</option>
          </select>
        </div>
        <div class="form-row">
          <label class="form-label">Zone</label>
          <input class="form-input" id="import-zone" placeholder="ex: bank-prd">
        </div>
      </div>

      <div class="form-row-2">
        <div class="form-row">
          <label class="form-label">CA Provider</label>
          <input class="form-input" id="import-ca" placeholder="ex: Vault PKI">
        </div>
        <div class="form-row">
          <label class="form-label">Tags</label>
          <input class="form-input" id="import-tags" placeholder="chave:valor, chave2:valor2">
          <div class="form-hint">Formato: chave:valor separados por vírgula</div>
        </div>
      </div>

      <div class="form-row">
        <label class="form-label">Descrição</label>
        <input class="form-input" id="import-description" placeholder="Descrição opcional do certificado">
      </div>

      <div id="import-errors" style="margin-bottom:16px;"></div>

      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn btn-secondary" onclick="window.location.hash='#/certificates'">Cancelar</button>
        <button class="btn btn-primary" id="import-submit-btn" style="margin-left:0">Importar certificado</button>
      </div>
    </div>

    <div id="import-result-area"></div>
  `;

  attachSingleEvents();
}

function attachSingleEvents(): void {
  const zone = document.getElementById('upload-zone-single');
  const fileInput = document.getElementById('cert-file-input') as HTMLInputElement;

  // Click to upload
  zone?.addEventListener('click', () => fileInput?.click());

  // Drag and drop
  zone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone?.addEventListener('dragleave', () => {
    zone.classList.remove('dragover');
  });
  zone?.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const files = (e as DragEvent).dataTransfer?.files;
    if (files && files[0]) handleFileSelect(files[0]);
  });

  // File input change
  fileInput?.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) {
      handleFileSelect(fileInput.files[0]);
    }
  });

  // Submit
  document.getElementById('import-submit-btn')?.addEventListener('click', () => {
    submitSingleImport();
  });
}

let selectedFile: File | null = null;

function handleFileSelect(file: File): void {
  selectedFile = file;
  const nameEl = document.getElementById('file-name');
  if (nameEl) nameEl.textContent = `Arquivo selecionado: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;

  // Show password field for PKCS#12
  const isPkcs12 = /\.(p12|pfx)$/i.test(file.name);
  const pwRow = document.getElementById('pkcs12-password-row');
  if (pwRow) pwRow.style.display = isPkcs12 ? 'block' : 'none';

  // Show preview for PEM files
  if (/\.(pem|crt)$/i.test(file.name)) {
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      const previewArea = document.getElementById('cert-preview-area');
      if (previewArea && content.includes('-----BEGIN CERTIFICATE-----')) {
        previewArea.innerHTML = `
          <div class="cert-preview">
            <div class="cert-preview-title">Preview do certificado</div>
            <div class="code-block" style="max-height:150px;overflow-y:auto;font-size:11px;">${escapeHtml(content.substring(0, 500))}${content.length > 500 ? '...' : ''}</div>
          </div>
        `;
      }
    };
    reader.readAsText(file);
  }
}

async function submitSingleImport(): Promise<void> {
  const owner = (document.getElementById('import-owner') as HTMLInputElement)?.value.trim();
  const application = (document.getElementById('import-application') as HTMLInputElement)?.value.trim();
  const environment = (document.getElementById('import-environment') as HTMLSelectElement)?.value;
  const zone = (document.getElementById('import-zone') as HTMLInputElement)?.value.trim();
  const ca = (document.getElementById('import-ca') as HTMLInputElement)?.value.trim();
  const description = (document.getElementById('import-description') as HTMLInputElement)?.value.trim();
  const errorsEl = document.getElementById('import-errors');

  // Validate
  const errors: string[] = [];
  if (!selectedFile) errors.push('Selecione um arquivo de certificado');
  if (!owner) errors.push('Owner é obrigatório');
  if (!environment || !['dev', 'hml', 'prd'].includes(environment)) errors.push('Environment é obrigatório (dev, hml, prd)');

  if (errors.length > 0) {
    if (errorsEl) {
      errorsEl.innerHTML = errors.map(e =>
        `<div style="color:var(--crit);font-family:var(--mono);font-size:12px;margin-bottom:4px;">⚠ ${escapeHtml(e)}</div>`
      ).join('');
    }
    return;
  }
  if (errorsEl) errorsEl.innerHTML = '';

  const metadata: Record<string, string> = { owner: owner!, environment: environment! };
  if (application) metadata.application = application;
  if (zone) metadata.zone = zone;
  if (ca) metadata.ca_provider = ca;
  if (description) metadata.description = description;

  const resultArea = document.getElementById('import-result-area');

  try {
    const isPkcs12 = /\.(p12|pfx)$/i.test(selectedFile!.name);
    if (isPkcs12) {
      const password = (document.getElementById('pkcs12-password') as HTMLInputElement)?.value || '';
      await importPKCS12(selectedFile!, password, metadata);
    } else {
      await importPEM(selectedFile!, metadata);
    }

    if (resultArea) {
      resultArea.innerHTML = `
        <div class="import-result success">
          <div style="color:var(--ok);font-weight:600;margin-bottom:8px;">✓ Certificado importado com sucesso</div>
          <div style="font-size:12px;color:var(--text-dim);">O certificado foi adicionado ao inventário.</div>
          <button class="btn btn-primary" style="margin-top:12px;margin-left:0;" onclick="window.location.hash='#/certificates'">Ver inventário</button>
        </div>
      `;
    }
  } catch (err) {
    if (resultArea) {
      resultArea.innerHTML = `
        <div class="import-result error">
          <div style="color:var(--crit);font-weight:600;margin-bottom:8px;">✗ Erro ao importar certificado</div>
          <div style="font-size:12px;color:var(--text-dim);">${escapeHtml(String(err))}</div>
          <div style="margin-top:8px;font-size:12px;color:var(--text-dim);">Verifique se o arquivo está no formato correto (PEM ou PKCS#12).</div>
        </div>
      `;
    }
  }
}

function renderBulkTab(): void {
  const content = document.getElementById('import-content');
  if (!content) return;

  content.innerHTML = `
    <div class="form-card">
      <div class="policy-note">
        <span>ℹ</span>
        <div><strong>Import CSV em lote:</strong> Faça upload de um CSV com colunas: CN, SANs, Owner, Environment, CA, Tags. Uma linha por certificado.</div>
      </div>

      <div class="form-row">
        <label class="form-label">Arquivo CSV</label>
        <div class="upload-zone" id="upload-zone-csv">
          <div class="upload-icon">📊</div>
          <div class="upload-text">Arraste o CSV aqui ou clique para selecionar</div>
          <div class="upload-hint">Apenas .csv</div>
          <input type="file" id="csv-file-input" accept=".csv" style="display:none">
        </div>
        <div id="csv-file-name" style="font-family:var(--mono);font-size:12px;color:var(--text-dim);margin-top:4px;"></div>
      </div>

      <div id="csv-errors" style="margin-bottom:16px;"></div>

      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn btn-secondary" onclick="window.location.hash='#/certificates'">Cancelar</button>
        <button class="btn btn-primary" id="csv-submit-btn" style="margin-left:0">Importar CSV</button>
      </div>
    </div>

    <div id="csv-result-area"></div>
  `;

  attachBulkEvents();
}

let selectedCsvFile: File | null = null;

function attachBulkEvents(): void {
  const zone = document.getElementById('upload-zone-csv');
  const fileInput = document.getElementById('csv-file-input') as HTMLInputElement;

  zone?.addEventListener('click', () => fileInput?.click());

  zone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone?.addEventListener('dragleave', () => {
    zone.classList.remove('dragover');
  });
  zone?.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const files = (e as DragEvent).dataTransfer?.files;
    if (files && files[0]) handleCsvSelect(files[0]);
  });

  fileInput?.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) {
      handleCsvSelect(fileInput.files[0]);
    }
  });

  document.getElementById('csv-submit-btn')?.addEventListener('click', () => {
    submitBulkImport();
  });
}

function handleCsvSelect(file: File): void {
  const errorsEl = document.getElementById('csv-errors');
  if (!/\.csv$/i.test(file.name)) {
    if (errorsEl) errorsEl.innerHTML = `<div style="color:var(--crit);font-family:var(--mono);font-size:12px;">⚠ Apenas arquivos CSV são suportados</div>`;
    selectedCsvFile = null;
    return;
  }
  if (errorsEl) errorsEl.innerHTML = '';
  selectedCsvFile = file;
  const nameEl = document.getElementById('csv-file-name');
  if (nameEl) nameEl.textContent = `Arquivo selecionado: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
}

async function submitBulkImport(): Promise<void> {
  const errorsEl = document.getElementById('csv-errors');
  const resultArea = document.getElementById('csv-result-area');

  if (!selectedCsvFile) {
    if (errorsEl) errorsEl.innerHTML = `<div style="color:var(--crit);font-family:var(--mono);font-size:12px;">⚠ Selecione um arquivo CSV</div>`;
    return;
  }

  try {
    const result: ImportResultDTO = await importCSV(selectedCsvFile);

    if (resultArea) {
      const hasErrors = result.failed > 0;
      resultArea.innerHTML = `
        <div class="import-result ${hasErrors ? 'error' : 'success'}">
          <div class="import-stat">
            <div class="import-stat-item">
              <div class="import-stat-value" style="color:var(--ok)">${result.imported}</div>
              <div class="import-stat-label">Importados</div>
            </div>
            <div class="import-stat-item">
              <div class="import-stat-value" style="color:var(--crit)">${result.failed}</div>
              <div class="import-stat-label">Erros</div>
            </div>
          </div>
          ${hasErrors ? `
            <div class="import-errors">
              ${result.errors.map(e =>
                `<div class="import-error-row">Linha ${e.index}: ${escapeHtml(e.message)}</div>`
              ).join('')}
            </div>
          ` : ''}
          <button class="btn btn-primary" style="margin-top:12px;margin-left:0;" onclick="window.location.hash='#/certificates'">Ver inventário</button>
        </div>
      `;
    }
  } catch (err) {
    if (resultArea) {
      resultArea.innerHTML = `
        <div class="import-result error">
          <div style="color:var(--crit);font-weight:600;margin-bottom:8px;">✗ Erro ao importar CSV</div>
          <div style="font-size:12px;color:var(--text-dim);">${escapeHtml(String(err))}</div>
        </div>
      `;
    }
  }
}
