import { useQuery } from '@tanstack/react-query';
import { fetchDashboardSnapshot } from '@/services/dashboardApi';
import type { DashboardSnapshot } from '@certificado-digital/shared';

/**
 * TanStack Query hook for fetching the dashboard snapshot.
 *
 * Provides KPI metrics, heatmap data, and critical alerts.
 * Auto-refresh is intentionally NOT enabled here (added in chunk #11).
 */
export function useDashboardSnapshot() {
  return useQuery<DashboardSnapshot>({
    queryKey: ['dashboard', 'snapshot'],
    queryFn: fetchDashboardSnapshot,
  });
}
