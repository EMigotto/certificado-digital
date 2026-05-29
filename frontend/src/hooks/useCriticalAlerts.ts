import { useQuery } from '@tanstack/react-query';
import { fetchCriticalAlerts } from '@/services/dashboardApi';

/**
 * TanStack Query hook for critical alerts on the dashboard.
 * Fetches the top N alerts sorted by urgency (fewest days left first).
 */
export function useCriticalAlerts(limit = 5) {
  return useQuery({
    queryKey: ['dashboard', 'criticalAlerts', limit],
    queryFn: () => fetchCriticalAlerts(limit),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
