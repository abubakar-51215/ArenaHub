/** Player-facing equipment rental API calls. */
import { api } from '../lib/api';
import type { Equipment } from '../types';

export function listArenaEquipment(arenaId: string): Promise<Equipment[]> {
  return api.get<Equipment[]>(`/arenas/${arenaId}/equipment`);
}
