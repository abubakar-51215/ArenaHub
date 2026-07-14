/** Owner equipment management API calls (backend modules/equipment). */
import { api } from "@/services/api";
import type { Equipment } from "@/types";

export interface EquipmentInput {
  name: string;
  description?: string | null;
  rental_price: string;
  quantity_total: number;
  is_active?: boolean;
}

export function listEquipment(arenaId: string): Promise<Equipment[]> {
  return api.get<Equipment[]>(`/owner/arenas/${arenaId}/equipment`);
}

export function createEquipment(arenaId: string, input: EquipmentInput): Promise<Equipment> {
  return api.post<Equipment>(`/owner/arenas/${arenaId}/equipment`, input);
}

export function updateEquipment(
  equipmentId: string,
  input: Partial<Omit<EquipmentInput, "quantity_total">>,
): Promise<Equipment> {
  return api.patch<Equipment>(`/owner/equipment/${equipmentId}`, input);
}

export function adjustQuantity(equipmentId: string, delta: number): Promise<Equipment> {
  return api.patch<Equipment>(`/owner/equipment/${equipmentId}/quantity`, { delta });
}

export function deleteEquipment(equipmentId: string): Promise<null> {
  return api.del<null>(`/owner/equipment/${equipmentId}`);
}
