import { api } from './api';
import type { DashboardSnapshot, CriticalAlert } from '@certificado-digital/shared';

/**
 * Fetches the current dashboard snapshot with KPIs, heatmap data, and alerts.
 */
export async function fetchDashboardSnapshot(): Promise<DashboardSnapshot> {
  const { data } = await api.get<DashboardSnapshot>('/dashboard/snapshot');
  return data;
}

/**
 * Fetches the top critical alerts for the dashboard.
 *
 * @param limit - Maximum number of alerts to return (default: 5)
 */
export async function fetchCriticalAlerts(limit = 5): Promise<CriticalAlert[]> {
  const { data } = await api.get<CriticalAlert[]>('/dashboard/critical-alerts', {
    params: { limit },
  });
  return data;
}
