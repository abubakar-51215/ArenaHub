/** Owner discount-code management API calls (backend modules/arena discounts). */
import { api } from "@/services/api";
import type { DiscountCode, DiscountType } from "@/types";

export interface DiscountCodeInput {
  code: string;
  description?: string | null;
  discount_type: DiscountType;
  discount_value: string;
  min_booking_amount?: string;
  max_uses?: number | null;
  valid_from?: string | null;
  valid_until?: string | null;
  is_active?: boolean;
}

export function listDiscounts(arenaId: string): Promise<DiscountCode[]> {
  return api.get<DiscountCode[]>(`/owner/arenas/${arenaId}/discounts`);
}

export function createDiscount(arenaId: string, input: DiscountCodeInput): Promise<DiscountCode> {
  return api.post<DiscountCode>(`/owner/arenas/${arenaId}/discounts`, input);
}

export function updateDiscount(
  arenaId: string,
  discountId: string,
  input: Partial<Omit<DiscountCodeInput, "code" | "discount_type">>,
): Promise<DiscountCode> {
  return api.patch<DiscountCode>(`/owner/arenas/${arenaId}/discounts/${discountId}`, input);
}

export function deleteDiscount(arenaId: string, discountId: string): Promise<null> {
  return api.del<null>(`/owner/arenas/${arenaId}/discounts/${discountId}`);
}
