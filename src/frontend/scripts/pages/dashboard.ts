/**
 * Dashboard page — KPIs, heatmap, critical alerts (AC 24-28).
 * Auto-refresh indicator.
 */

import { getDashboardStats, getDashboardHeatmap, getDashboardAlerts } from '../api.js';
import type { DashboardStats, HeatmapData, AlertDTO } from '../api.js';
import { renderKpiGrid } from '../components/kpi-card.js';
import { renderHeatmap, attachHeatmapTooltip } from '../components/heatmap.js';
import { renderAlertList } from '../components/alert-list.js';

// Fallback data for when API is not available
function fallbackStats(): DashboardStats {
  return {
    total: 2847,
    valid: 2798,
    expiring_30d: 23,
    expired: 14,
    revoked: 12,
    delta_7d: 47,
  };
}

function fallbackHeatmap(): HeatmapData {
  const cells: number[] = [];
  for (let i = 0; i < 90; i++) {
    // Generate semi-random distribution matching prototype feel
    const r = Math.sin(i * 0.3) * 3 + Math.cos(i * 0.7) * 2;
    cells.push(Math.max(0, Math.round(r + (i < 10 ? 3 : 0))));
  }
  return { cells };
}

function fallbackAlerts(): AlertDTO[] {
  return [
    { id: '1', common_name: 'api-payments.bank.internal', environment: 'prd', ca_provider: 'Vault PKI', owner: 'time-pagamentos', days_remaining: 2 },
    { id: '2', common_name: 'mtls-broker-kafka.bank.internal', environment: 'prd', ca_provider: 'ACM PCA', owner: 'time-data', days_remaining: 5 },
    { id: '3', common_name: 'gateway-edge.bank.internal', environment: 'prd', ca_provider: 'Vault PKI', owner: 'time-plataforma', days_remaining: 12 },
    { id: '4', common_name: 'auth-svc.bank.internal', environment: 'hml', ca_provider: 'Vault PKI', owner: 'time-iam', days_remaining: 18 },
    { id: '5', common_name: 'notification-worker.bank.internal', environment: 'prd', ca_provider: 'Vault PKI', owner: 'time-comms', days_remaining: 26 },
  ];
}

function formatTime(): string {
  const now = new Date();
  return now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export async function renderDashboard(container: HTMLElement): Promise<void> {
  container.innerHTML = `<div class="loading">Carregando dashboard...</div>`;

  let stats: DashboardStats;
  let heatmap: HeatmapData;
  let alerts: AlertDTO[];

  try {
    [stats, heatmap, alerts] = await Promise.all([
      getDashboardStats(),
      getDashboardHeatmap(),
      getDashboardAlerts(5),
    ]);
  } catch {
    // Use fallback data when API unavailable
    stats = fallbackStats();
    heatmap = fallbackHeatmap();
    alerts = fallbackAlerts();
  }

  // Update nav badges
  const certCount = document.getElementById('nav-cert-count');
  if (certCount) certCount.textContent = stats.total.toLocaleString('pt-BR');
  const expiringCount = document.getElementById('nav-expiring-count');
  if (expiringCount) expiringCount.textContent = String(stats.expiring_30d);

  const lastRefresh = formatTime();

  container.innerHTML = `
    <section id="dashboard">
      <div class="sec-head">
        <div>
          <div class="sec-title">01 · <em>Dashboard</em> de expiração</div>
          <div class="sec-tag" style="margin-top:8px">Tela inicial — heatmap, KPIs e alertas críticos<span class="cap">C3 · Monitoring & Alerts</span></div>
        </div>
        <div class="sec-tag">Auto-refresh 60s · Última: <span id="last-refresh">${lastRefresh}</span></div>
      </div>

      ${renderKpiGrid(stats)}

      <div class="grid-2">
        ${renderHeatmap(heatmap)}
        ${renderAlertList(alerts)}
      </div>
    </section>
  `;

  attachHeatmapTooltip();
}
