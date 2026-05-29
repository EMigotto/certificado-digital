import { useQuery } from '@tanstack/react-query';
import { fetchDashboardSnapshot } from '@/services/dashboardApi';
import type { DashboardSnapshot } from '@certificado-digital/shared';

/**
 * TanStack Query hook for fetching the dashboard snapshot.
 *
 * Provides KPI metrics, heatmap data, and critical alerts.
 * Auto-refreshes every 60 seconds to match the prototype's "Auto-refresh 60s" label.
 */
export function useDashboardSnapshot() {
  return useQuery<DashboardSnapshot>({
    queryKey: ['dashboard', 'snapshot'],
    queryFn: fetchDashboardSnapshot,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
