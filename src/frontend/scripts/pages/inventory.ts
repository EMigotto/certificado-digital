/**
 * Inventory page — Certificate list with search, filter, pagination (AC 5-18, 30, 45, 49).
 */

import { listCertificates, exportCertificates } from '../api.js';
import type { CertListResponse, CertListParams, CertificateDTO } from '../api.js';
import { renderCertTable } from '../components/cert-table.js';
import {
  renderFilterBar,
  attachFilterEvents,
  setFilterCallback,
  getCurrentFilters,
  getCurrentSearch,
  clearFilters,
  addFilter,
  type ActiveFilter,
} from '../components/filter-bar.js';
import {
  renderPagination,
  attachPaginationEvents,
  setPageChangeCallback,
  type PaginationState,
} from '../components/pagination.js';

let currentPage = 1;
const PAGE_SIZE = 50;
let container: HTMLElement | null = null;

// Fallback data when API is not available
function fallbackCerts(): CertListResponse {
  const certs: CertificateDTO[] = [
    {
      id: 'cert-1', common_name: 'api-payments.bank.internal',
      sans: ['payments-v2', 'payments-canary'], serial: '0x1A2B3C4D',
      issuer: 'Vault PKI Root CA', not_before: '2024-01-15T00:00:00Z',
      not_after: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      algorithm: 'RSA 2048', fingerprint_sha256: 'AB:CD:EF:12:34',
      owner: 'time-pagamentos', application: 'API Payments',
      environment: 'prd', zone: 'bank-prd', ca_provider: 'Vault PKI',
      revoked: false, tags: {}, custom_fields: {}, description: '',
      created_at: '2024-01-15T00:00:00Z', updated_at: '2024-01-15T00:00:00Z',
    },
    {
      id: 'cert-2', common_name: 'mtls-broker-kafka.bank.internal',
      sans: [], serial: '0x2B3C4D5E',
      issuer: 'ACM PCA Root CA', not_before: '2024-02-01T00:00:00Z',
      not_after: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      algorithm: 'ECDSA P-256', fingerprint_sha256: 'EF:12:34:56:78',
      owner: 'time-data', application: 'Kafka Broker',
      environment: 'prd', zone: 'bank-prd', ca_provider: 'ACM PCA',
      revoked: false, tags: {}, custom_fields: {}, description: '',
      created_at: '2024-02-01T00:00:00Z', updated_at: '2024-02-01T00:00:00Z',
    },
    {
      id: 'cert-3', common_name: 'gateway-edge.bank.internal',
      sans: ['gw-1', 'gw-2', 'gw-canary', 'gw-legacy'], serial: '0x3C4D5E6F',
      issuer: 'Vault PKI Root CA', not_before: '2024-01-20T00:00:00Z',
      not_after: new Date(Date.now() + 12 * 86_400_000).toISOString(),
      algorithm: 'RSA 2048', fingerprint_sha256: '34:56:78:9A:BC',
      owner: 'time-plataforma', application: 'Edge Gateway',
      environment: 'prd', zone: 'bank-prd', ca_provider: 'Vault PKI',
      revoked: false, tags: {}, custom_fields: {}, description: '',
      created_at: '2024-01-20T00:00:00Z', updated_at: '2024-01-20T00:00:00Z',
    },
    {
      id: 'cert-4', common_name: 'auth-svc.bank.internal',
      sans: ['auth-internal'], serial: '0x4D5E6F7A',
      issuer: 'Vault PKI Root CA', not_before: '2024-03-01T00:00:00Z',
      not_after: new Date(Date.now() + 18 * 86_400_000).toISOString(),
      algorithm: 'RSA 2048', fingerprint_sha256: '56:78:9A:BC:DE',
      owner: 'time-iam', application: 'Auth Service',
      environment: 'hml', zone: 'bank-hml', ca_provider: 'Vault PKI',
      revoked: false, tags: {}, custom_fields: {}, description: '',
      created_at: '2024-03-01T00:00:00Z', updated_at: '2024-03-01T00:00:00Z',
    },
    {
      id: 'cert-5', common_name: 'notification-worker.bank.internal',
      sans: ['notify-v2'], serial: '0x5E6F7A8B',
      issuer: 'Vault PKI Root CA', not_before: '2024-02-15T00:00:00Z',
      not_after: new Date(Date.now() + 26 * 86_400_000).toISOString(),
      algorithm: 'RSA 2048', fingerprint_sha256: '78:9A:BC:DE:F0',
      owner: 'time-comms', application: 'Notification Worker',
      environment: 'prd', zone: 'bank-prd', ca_provider: 'Vault PKI',
      revoked: false, tags: {}, custom_fields: {}, description: '',
      created_at: '2024-02-15T00:00:00Z', updated_at: '2024-02-15T00:00:00Z',
    },
  ];
  return {
    items: certs,
    page: 1,
    page_size: PAGE_SIZE,
    total_items: certs.length,
    total_pages: 1,
    has_next_page: false,
    has_previous_page: false,
  };
}

function buildParams(): CertListParams {
  const params: CertListParams = {
    page: currentPage,
    page_size: PAGE_SIZE,
  };

  const search = getCurrentSearch();
  if (search) params.q = search;

  const filters = getCurrentFilters();
  for (const f of filters) {
    switch (f.key) {
      case 'expiration': params.expires_before = parseInt(f.value, 10); break;
      case 'environment': params.environment = f.value; break;
      case 'owner': params.owner = f.value; break;
      case 'ca': params.ca = f.value; break;
      case 'status': params.status = f.value; break;
      case 'tag': params.tag = f.value; break;
    }
  }
  return params;
}

async function loadCerts(): Promise<void> {
  if (!container) return;
  const tableArea = document.getElementById('cert-table-area');
  const paginationArea = document.getElementById('cert-pagination-area');
  if (!tableArea || !paginationArea) return;

  tableArea.innerHTML = `<div class="loading">Carregando certificados...</div>`;

  let response: CertListResponse;
  try {
    response = await listCertificates(buildParams());
  } catch {
    response = fallbackCerts();
  }

  // Update nav badges
  const certCount = document.getElementById('nav-cert-count');
  if (certCount) certCount.textContent = response.total_items.toLocaleString('pt-BR');

  tableArea.innerHTML = renderCertTable(response.items);

  const paginationState: PaginationState = {
    page: response.page,
    pageSize: response.page_size,
    totalItems: response.total_items,
    totalPages: response.total_pages,
    hasNextPage: response.has_next_page,
    hasPreviousPage: response.has_previous_page,
  };

  paginationArea.innerHTML = renderPagination(paginationState);
  attachPaginationEvents(response.page);
}

export async function renderInventory(el: HTMLElement, params: Record<string, string> = {}): Promise<void> {
  container = el;
  currentPage = 1;

  // Handle pre-set filters from URL params
  clearFilters();
  if (params._status === 'expiring') {
    addFilter({ key: 'expiration', display: 'expira: < 30d', value: '30' });
  }

  // Set callbacks
  setFilterCallback(() => {
    currentPage = 1;
    loadCerts();
  });

  setPageChangeCallback((page: number) => {
    currentPage = page;
    loadCerts();
  });

  el.innerHTML = `
    <section id="inventario">
      <div class="sec-head">
        <div>
          <div class="sec-title">02 · <em>Inventário</em> centralizado</div>
          <div class="sec-tag" style="margin-top:8px">Lista, busca, filtros<span class="cap">C1 · Inventory</span></div>
        </div>
        <div class="sec-tag" id="inventory-stats">— certificados · — zonas · — CAs</div>
      </div>

      ${renderFilterBar()}

      <div id="cert-table-area"></div>
      <div id="cert-pagination-area"></div>

      <div style="margin-top:16px;display:flex;gap:8px;">
        <button class="btn btn-secondary" id="export-csv-btn">
          <svg width="14" height="14" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Exportar CSV
        </button>
        <button class="btn btn-secondary" id="export-json-btn">
          <svg width="14" height="14" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Exportar JSON
        </button>
      </div>
    </section>
  `;

  attachFilterEvents();

  // Export buttons
  document.getElementById('export-csv-btn')?.addEventListener('click', () => {
    exportCertificates(buildParams(), 'csv');
  });
  document.getElementById('export-json-btn')?.addEventListener('click', () => {
    exportCertificates(buildParams(), 'json');
  });

  await loadCerts();
}
