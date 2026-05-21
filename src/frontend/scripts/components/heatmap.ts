/**
 * Heatmap component for dashboard expiration calendar (AC 27-28).
 * 30-column × 3-row grid (90 cells) color-coded by intensity.
 */

import type { HeatmapData } from '../api.js';

function intensityClass(count: number): string {
  if (count === 0) return '';
  if (count <= 1) return 'l1';
  if (count <= 3) return 'l2';
  if (count <= 5) return 'l3';
  if (count <= 8) return 'l4';
  return 'l5';
}

function formatDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function renderHeatmap(data: HeatmapData): string {
  const cells: string[] = [];
  for (let i = 0; i < 90; i++) {
    const count = data.cells[i] || 0;
    const cls = intensityClass(count);
    const dateStr = formatDate(i);
    cells.push(
      `<div class="heat-cell ${cls}" data-day="${i}" data-count="${count}" data-date="${dateStr}" title="${count} certificado(s) expiram em ${dateStr}"></div>`,
    );
  }

  return `
    <div class="panel">
      <div class="panel-head">
        <div>
          <div class="panel-title">Expirações nos próximos 90 dias</div>
          <div class="panel-sub" style="margin-top:4px">Cada célula = 1 dia · intensidade = qtd. de certificados</div>
        </div>
        <div class="panel-sub">90d → 1d</div>
      </div>
      <div class="heatmap" id="heatmap">${cells.join('')}</div>
      <div class="heatmap-axis">
        <span>Hoje</span>
        <span>+30d</span>
        <span>+60d</span>
        <span>+90d</span>
      </div>
      <div class="heatmap-legend">
        <span>Menos</span>
        <div class="legend-cell" style="background:var(--surface-2)"></div>
        <div class="legend-cell l1"></div>
        <div class="legend-cell l2"></div>
        <div class="legend-cell l3"></div>
        <div class="legend-cell l4"></div>
        <div class="legend-cell l5"></div>
        <span>Mais</span>
      </div>
    </div>`;
}

/**
 * Attach tooltip behavior to heatmap cells after render.
 */
export function attachHeatmapTooltip(): void {
  const heatmap = document.getElementById('heatmap');
  if (!heatmap) return;

  let tooltip: HTMLDivElement | null = null;

  heatmap.addEventListener('mouseover', (e) => {
    const cell = (e.target as HTMLElement).closest('.heat-cell') as HTMLElement | null;
    if (!cell) return;

    const count = cell.dataset.count || '0';
    const date = cell.dataset.date || '';

    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.className = 'heat-tooltip';
      document.body.appendChild(tooltip);
    }
    tooltip.textContent = `${count} certificado(s) expiram em ${date}`;
    tooltip.style.display = 'block';
  });

  heatmap.addEventListener('mousemove', (e) => {
    if (tooltip) {
      tooltip.style.left = `${(e as MouseEvent).clientX + 12}px`;
      tooltip.style.top = `${(e as MouseEvent).clientY - 10}px`;
    }
  });

  heatmap.addEventListener('mouseout', (e) => {
    const cell = (e.target as HTMLElement).closest('.heat-cell');
    if (!cell && tooltip) {
      tooltip.style.display = 'none';
    }
  });

  heatmap.addEventListener('mouseleave', () => {
    if (tooltip) tooltip.style.display = 'none';
  });
}
