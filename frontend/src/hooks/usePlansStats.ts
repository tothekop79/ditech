import { useQuery } from '@tanstack/react-query';
import { plansApi, type PlansStats } from '../api/plans';

/** filter params accepted by both the plans list and /stats */
export type PlansStatsFilters = Record<string, string | undefined>;

/**
 * Counts for the current filter, aggregated by the server.
 *
 * Kept separate from the list query on purpose: the list is paginated, so
 * counting its rows only ever describes one page. This describes the whole
 * filtered set.
 */
export function usePlansStats(filters: PlansStatsFilters) {
  return useQuery<PlansStats>({
    queryKey: ['plans-stats', filters],
    queryFn: () => plansApi.stats(filters),
  });
}
