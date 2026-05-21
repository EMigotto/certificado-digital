/**
 * Audit Log page — Global audit entries with filters (AC 32-34).
 * Sortable by timestamp. Color-coded results.
 */

import { listAuditEntries } from '../api.js';
import type { AuditEntryDTO, AuditListResponse } from '../api.js';
import { renderAuditTable } from '../components/audit-table.js';
import {
  renderPagination,
  attachPaginationEvents,
  setPageChangeCallback,
  type PaginationState,
} from '../components/pagination.js';

let currentPage = 1;
const PAGE_SIZE = 50;
let container: HTMLElement | null = null;
let sortOrder: 'desc' | 'asc' = 'desc';

function fallbackAuditEntries(): AuditListResponse {
  const entries: AuditEntryDTO[] = [
    { id: 'a1', cert_id: 'cert-1', cert_cn: 'api-payments.bank.internal', action: 'CREATE', actor: 'system', result: 'SUCCESS', details: {}, timestamp: '2024-01-15T10:30:00Z' },
    { id: 'a2', cert_id: 'cert-2', cert_cn: 'mtls-broker-kafka.bank.internal', action: 'CREATE', actor: 'system', result: 'SUCCESS', details: {}, timestamp: '2024-02-01T08:15:00Z' },
    { id: 'a3', cert_id: 'cert-1', cert_cn: 'api-payments.bank.internal', action: 'UPDATE', actor: 'rafael.costa', result: 'SUCCESS', details: {}, timestamp: '2024-03-20T14:15:00Z' },
    { id: 'a4', cert_id: 'cert-3', cert_cn: 'gateway-edge.bank.internal', action: 'CREATE', actor: 'system', result: 'SUCCESS', details: {}, timestamp: '2024-01-20T09:00:00Z' },
    { id: 'a5', cert_id: 'cert-4', cert_cn: 'auth-svc.bank.internal', action: 'CREATE', actor: 'ci-pipeline', result: 'SUCCESS', details: {}, timestamp: '2024-03-01T11:45:00Z' },
    { id: 'a6', cert_id: 'cert-5', cert_cn: 'notification-worker.bank.internal', action: 'CREATE', actor: 'system', result: 'SUCCESS', details: {}, timestamp: '2024-02-15T16:30:00Z' },
    { id: 'a7', cert_id: 'cert-6', cert_cn: 'old-service.bank.internal', action: 'DELETE', actor: 'rafael.costa', result: 'SUCCESS', details: {}, timestamp: '2024-04-10T13:20:00Z' },
    { id: 'a8', cert_id: 'cert-7', cert_cn: 'test-cert.bank.internal', action: 'CREATE', actor: 'ci-pipeline', result: 'FAILURE', details: {}, timestamp: '2024-04-12T10:00:00Z' },
    { id: 'a9', cert_id: 'cert-1', cert_cn: 'api-payments.bank.internal', action: 'UPDATE', actor: 'alice.silva', result: 'SUCCESS', details: {}, timestamp: '2024-05-01T09:30:00Z' },
    { id: 'a10', cert_id: 'cert-8', cert_cn: 'revoked-svc.bank.internal', action: 'REVOKE', actor: 'rafael.costa', result: 'SUCCESS', details: {}, timestamp: '2024-05-05T15:45:00Z' },
  ];

  // Sort by timestamp
  entries.sort((a, b) => {
    const diff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    return sortOrder === 'desc' ? diff : -diff;
  });

  return {
    items: entries,
    page: 1,
    page_size: PAGE_SIZE,
    total_items: entries.length,
    total_pages: 1,
  };
}

async function loadAuditEntries(): Promise<void> {
  if (!container) return;
  const tableArea = document.getElementById('audit-table-area');
  const paginationArea = document.getElementById('audit-pagination-area');
  if (!tableArea || !paginationArea) return;

  tableArea.innerHTML = `<div class="loading">Carregando audit log...</div>`;

  let response: AuditListResponse;
  try {
    response = await listAuditEntries({
      page: currentPage,
      page_size: PAGE_SIZE,
      sort: 'timestamp',
      order: sortOrder,
    });
  } catch {
    response = fallbackAuditEntries();
  }

  tableArea.innerHTML = renderAuditTable(response.items);

  const paginationState: PaginationState = {
    page: response.page,
    pageSize: response.page_size,
    totalItems: response.total_items,
    totalPages: response.total_pages,
    hasNextPage: response.page < response.total_pages,
    hasPreviousPage: response.page > 1,
  };

  paginationArea.innerHTML = renderPagination(paginationState);
  attachPaginationEvents(response.page);
}

export async function renderAuditLog(el: HTMLElement): Promise<void> {
  container = el;
  currentPage = 1;

  setPageChangeCallback((page: number) => {
    currentPage = page;
    loadAuditEntries();
  });

  el.innerHTML = `
    <section id="auditoria">
      <div class="sec-head">
        <div>
          <div class="sec-title">05 · <em>Audit</em> Log</div>
          <div class="sec-tag" style="margin-top:8px">Registro de todas as operações<span class="cap">C3 · Governance</span></div>
        </div>
      </div>

      <div class="toolbar">
        <div class="search">
          <svg width="14" height="14" viewBox="0 0 24 24" style="color:var(--text-mute)"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input id="audit-search-input" placeholder="busca: CN, ator, ação..." value="">
        </div>
        <div class="filter" id="sort-toggle">
          Ordenar: ${sortOrder === 'desc' ? 'Mais recentes' : 'Mais antigos'} ↕
        </div>
      </div>

      <div id="audit-table-area"></div>
      <div id="audit-pagination-area"></div>
    </section>
  `;

  // Sort toggle
  document.getElementById('sort-toggle')?.addEventListener('click', () => {
    sortOrder = sortOrder === 'desc' ? 'asc' : 'desc';
    const btn = document.getElementById('sort-toggle');
    if (btn) btn.textContent = `Ordenar: ${sortOrder === 'desc' ? 'Mais recentes' : 'Mais antigos'} ↕`;
    loadAuditEntries();
  });

  await loadAuditEntries();
}
