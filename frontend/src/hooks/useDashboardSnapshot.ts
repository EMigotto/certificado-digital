/**
 * Hook: useDashboardSnapshot
 *
 * Fetches the full dashboard snapshot (KPIs + heatmap + alerts) with
 * 60-second auto-refresh polling. Pauses polling when the browser tab
 * is inactive to save bandwidth.
 *
 * AC 4.6: Dashboard auto-refreshes every 60 seconds without page reload.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchDashboardSnapshot } from '@/services/dashboardApi';
import type { DashboardSnapshot } from '@certificado-digital/shared';

/** Auto-refresh interval in milliseconds (60 seconds) */
const REFETCH_INTERVAL = 60_000;

export function useDashboardSnapshot() {
  const query = useQuery<DashboardSnapshot, Error>({
    queryKey: ['dashboard', 'snapshot'],
    queryFn: fetchDashboardSnapshot,
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });

  const lastUpdated = query.dataUpdatedAt
    ? new Date(query.dataUpdatedAt)
    : null;

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    lastUpdated,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}
