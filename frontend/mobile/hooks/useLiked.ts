import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { showToast } from '@/components/ui/toast';
import { likeArena, listLikedArenas, unlikeArena } from '@/services/arenas';

const KEY = ['liked-ids'];

/** The ids of the arenas this player has liked (the filled hearts). */
export function useLikedIds() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => new Set((await listLikedArenas()).items.map((a) => a.id)),
    staleTime: 60_000,
  });
}

/**
 * Tap a heart: it fills at once (the caller shows the pop and the haptic), and
 * if the server refuses, it is put back and a toast says so. No toast on
 * success.
 */
export function useToggleLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ arenaId, liked }: { arenaId: string; liked: boolean }) =>
      liked ? unlikeArena(arenaId) : likeArena(arenaId),
    onMutate: async ({ arenaId, liked }) => {
      await qc.cancelQueries({ queryKey: KEY });
      const before = qc.getQueryData<Set<string>>(KEY);
      const next = new Set(before ?? []);
      if (liked) next.delete(arenaId);
      else next.add(arenaId);
      qc.setQueryData(KEY, next);
      return { before };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.before) qc.setQueryData(KEY, ctx.before);
      showToast('Could not save. Try again.');
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['liked-arenas'] });
    },
  });
}
