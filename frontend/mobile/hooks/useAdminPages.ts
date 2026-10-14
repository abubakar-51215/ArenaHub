import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';

import type { Page } from '@/types';

/**
 * An admin phone list that loads 50 rows at a time: `items` are all the rows loaded so far, `total` is the count on the
 * server, and `q.fetchNextPage()` (the "Show more" button) brings the next 50. `q.refetch()` reloads every loaded page.
 */
export function useAdminPages<P extends Page<unknown>>(
  queryKey: QueryKey,
  fetchPage: (page: number) => Promise<P>,
  options: { enabled?: boolean } = {},
) {
  const q = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last: P) => (last.page * last.page_size < last.total ? last.page + 1 : undefined),
    retry: 1,
    enabled: options.enabled ?? true,
  });
  const pages = q.data?.pages ?? [];
  const items: P['items'] = pages.flatMap((p) => p.items);
  return { q, pages, items, total: pages[0]?.total ?? 0 };
}
