/** TanStack Query hook for the admin Dashboard overview. */
import { useQuery } from "@tanstack/react-query";

import { fetchDashboardOverview, type OverviewRange } from "@/services/admin-overview";

export function useDashboardOverview(params: { city?: string; range: OverviewRange }) {
  return useQuery({
    queryKey: ["admin-overview", params.city ?? "", params.range],
    queryFn: () => fetchDashboardOverview(params),
  });
}
