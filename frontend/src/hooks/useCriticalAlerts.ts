/**
 * Hook: useCriticalAlerts
 *
 * Fetches the top critical alerts for the dashboard with 60-second
 * auto-refresh polling. Pauses polling when the browser tab is inactive.
 *
 * AC 4.6: Dashboard auto-refreshes every 60 seconds without page reload.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchCriticalAlerts } from '@/services/dashboardApi';
import type { CriticalAlert } from '@certificado-digital/shared';

/** Auto-refresh interval in milliseconds (60 seconds) */
const REFETCH_INTERVAL = 60_000;

export function useCriticalAlerts(limit = 5) {
  const query = useQuery<CriticalAlert[], Error>({
    queryKey: ['dashboard', 'criticalAlerts', limit],
    queryFn: () => fetchCriticalAlerts(limit),
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}
