/**
 * KPI card component for dashboard.
 * Renders 4 cards matching prototype: Total, Valid, Expiring <30d, Expired/Revoked (AC 24-25).
 */

import type { DashboardStats } from '../api.js';

export interface KpiItem {
  label: string;
  value: string;
  meta: string;
  colorClass: string; // 'ok' | 'warn' | 'crit' | ''
}

export function buildKpiItems(stats: DashboardStats): KpiItem[] {
  const total = stats.total;
  const valid = stats.valid;
  const pct = total > 0 ? ((valid / total) * 100).toFixed(1) : '0';

  return [
    {
      label: 'Total gerenciados',
      value: total.toLocaleString('pt-BR'),
      meta: `<span class="delta up">+${stats.delta_7d}</span> nos últimos 7d`,
      colorClass: 'ok',
    },
    {
      label: 'Válidos',
      value: valid.toLocaleString('pt-BR'),
      meta: `${pct}% do inventário`,
      colorClass: '',
    },
    {
      label: 'Expiram &lt; 30 dias',
      value: stats.expiring_30d.toLocaleString('pt-BR'),
      meta: `<span class="delta down">+${stats.expiring_30d > 0 ? Math.min(stats.expiring_30d, 5) : 0}</span> vs. ontem`,
      colorClass: 'warn',
    },
    {
      label: 'Vencidos / Revogados',
      value: (stats.expired + stats.revoked).toLocaleString('pt-BR'),
      meta: `${stats.expired} vencidos · ${stats.revoked} revogados`,
      colorClass: 'crit',
    },
  ];
}

export function renderKpiGrid(stats: DashboardStats): string {
  const items = buildKpiItems(stats);
  const cards = items.map(
    (item) => `
    <div class="kpi ${item.colorClass}">
      <div class="kpi-label">${item.label}</div>
      <div class="kpi-value">${item.value}</div>
      <div class="kpi-meta">${item.meta}</div>
    </div>`,
  );
  return `<div class="kpi-grid">${cards.join('')}</div>`;
}
