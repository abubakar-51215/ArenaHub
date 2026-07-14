/**
 * Fetches a court's slots for a date and keeps them live via the per-court
 * WebSocket channel — patches the matching slot's status in place on each
 * `slot_update` message, and reconnects with a short backoff + full refetch
 * on drop (the backend doesn't replay missed messages).
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { listSlots } from '../services/courts';
import { courtSlotsWsUrl, type SlotUpdateMessage } from '../lib/websocket';
import type { TimeSlot } from '../types';

export function useCourtSlots(courtId: string | undefined, date: string) {
  const queryClient = useQueryClient();
  const queryKey = ['court-slots', courtId, date];
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const query = useQuery({
    queryKey,
    queryFn: () => listSlots(courtId as string, date),
    enabled: !!courtId,
  });

  useEffect(() => {
    if (!courtId) return;
    let ws: WebSocket | null = null;
    let cancelled = false;

    function connect() {
      if (cancelled || !courtId) return;
      ws = new WebSocket(courtSlotsWsUrl(courtId));

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as SlotUpdateMessage;
          if (msg.type !== 'slot_update' || msg.date !== date) return;
          queryClient.setQueryData<TimeSlot[]>(queryKey, (prev) =>
            prev?.map((slot) => (slot.id === msg.slot_id ? { ...slot, status: msg.status } : slot)),
          );
        } catch {
          // Ignore malformed frames.
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        // Reconnect and re-fetch — no message replay on this channel.
        reconnectTimer.current = setTimeout(() => {
          queryClient.invalidateQueries({ queryKey });
          connect();
        }, 2000);
      };
    }

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      ws?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courtId, date]);

  return query;
}
