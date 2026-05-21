/**
 * Filter bar component for inventory page (AC 10-15, 30).
 * Search input + filter chips (removable) + "+ filtro" button.
 */

export interface ActiveFilter {
  key: string;     // 'expiration' | 'environment' | 'owner' | 'ca' | 'status' | 'tag'
  display: string; // e.g. "expira: < 30d"
  value: string;   // the query param value
}

export type FilterChangeCallback = (filters: ActiveFilter[], searchQuery: string) => void;

let currentFilters: ActiveFilter[] = [];
let currentSearch = '';
let onChange: FilterChangeCallback | null = null;

export function setFilterCallback(cb: FilterChangeCallback): void {
  onChange = cb;
}

export function getCurrentFilters(): ActiveFilter[] {
  return [...currentFilters];
}

export function getCurrentSearch(): string {
  return currentSearch;
}

export function addFilter(filter: ActiveFilter): void {
  // Don't add duplicate
  const existing = currentFilters.find(f => f.key === filter.key && f.value === filter.value);
  if (!existing) {
    currentFilters.push(filter);
    triggerChange();
  }
}

export function removeFilter(index: number): void {
  currentFilters.splice(index, 1);
  triggerChange();
}

export function clearFilters(): void {
  currentFilters = [];
  currentSearch = '';
  triggerChange();
}

function triggerChange(): void {
  if (onChange) onChange([...currentFilters], currentSearch);
  renderFilterBarInPlace();
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

export function renderFilterBar(): string {
  const chips = currentFilters.map(
    (f, i) =>
      `<div class="filter active" data-filter-idx="${i}">${escapeHtml(f.display)} <span class="filter-remove" data-remove-idx="${i}">×</span></div>`,
  );

  return `
    <div class="toolbar" id="filter-toolbar">
      <div class="search">
        <svg width="14" height="14" viewBox="0 0 24 24" style="color:var(--text-mute)"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input id="search-input" placeholder="busca: CN, SAN, serial, owner..." value="${escapeHtml(currentSearch)}">
      </div>
      ${chips.join('')}
      <div class="filter" id="add-filter-btn">+ filtro</div>
      <button class="btn btn-primary" id="import-btn" onclick="window.location.hash='#/import'">
        <svg width="14" height="14" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Emitir certificado
      </button>
    </div>`;
}

function renderFilterBarInPlace(): void {
  const toolbar = document.getElementById('filter-toolbar');
  if (!toolbar) return;
  toolbar.outerHTML = renderFilterBar();
  attachFilterEvents();
}

export function attachFilterEvents(): void {
  // Search input
  const input = document.getElementById('search-input') as HTMLInputElement | null;
  if (input) {
    let debounce: ReturnType<typeof setTimeout>;
    input.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        currentSearch = input.value;
        if (onChange) onChange([...currentFilters], currentSearch);
      }, 300);
    });
  }

  // Remove filter chips
  document.querySelectorAll('.filter-remove').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt((btn as HTMLElement).dataset.removeIdx || '0', 10);
      removeFilter(idx);
    });
  });

  // Add filter button
  const addBtn = document.getElementById('add-filter-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      showFilterMenu();
    });
  }
}

function showFilterMenu(): void {
  // Simple dropdown-style filter menu
  const existing = document.getElementById('filter-menu');
  if (existing) { existing.remove(); return; }

  const menu = document.createElement('div');
  menu.id = 'filter-menu';
  menu.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
    padding: 20px; z-index: 100; min-width: 300px;
  `;

  menu.innerHTML = `
    <div style="font-size:14px;font-weight:600;margin-bottom:16px;">Adicionar filtro</div>
    <div class="form-row">
      <label class="form-label">Tipo</label>
      <select id="filter-type" class="form-input" style="cursor:pointer">
        <option value="expiration">Expiração</option>
        <option value="environment">Ambiente</option>
        <option value="owner">Owner</option>
        <option value="ca">CA Provider</option>
        <option value="status">Status</option>
        <option value="tag">Tag</option>
      </select>
    </div>
    <div class="form-row">
      <label class="form-label">Valor</label>
      <input id="filter-value" class="form-input" placeholder="ex: 30, prd, team-payments...">
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button class="btn btn-secondary" id="filter-cancel">Cancelar</button>
      <button class="btn btn-primary" id="filter-apply" style="margin-left:0">Aplicar</button>
    </div>
  `;

  // Overlay
  const overlay = document.createElement('div');
  overlay.id = 'filter-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);z-index:99;';
  overlay.addEventListener('click', () => { overlay.remove(); menu.remove(); });

  document.body.appendChild(overlay);
  document.body.appendChild(menu);

  document.getElementById('filter-cancel')?.addEventListener('click', () => {
    overlay.remove(); menu.remove();
  });

  document.getElementById('filter-apply')?.addEventListener('click', () => {
    const type = (document.getElementById('filter-type') as HTMLSelectElement).value;
    const value = (document.getElementById('filter-value') as HTMLInputElement).value.trim();
    if (!value) return;

    let display = '';
    switch (type) {
      case 'expiration': display = `expira: < ${value}d`; break;
      case 'environment': display = `env: ${value}`; break;
      case 'owner': display = `owner: ${value}`; break;
      case 'ca': display = `ca: ${value}`; break;
      case 'status': display = `status: ${value}`; break;
      case 'tag': display = `tag: ${value}`; break;
    }
    addFilter({ key: type, display, value });
    overlay.remove(); menu.remove();
  });
}
