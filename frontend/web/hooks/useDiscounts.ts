/** TanStack Query hooks for owner discount-code management. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type DiscountCodeInput,
  createDiscount,
  deleteDiscount,
  listDiscounts,
  updateDiscount,
} from "@/services/discounts";

const key = (arenaId: string) => ["discounts", arenaId] as const;

export function useDiscounts(arenaId: string | null) {
  return useQuery({
    queryKey: ["discounts", arenaId ?? "none"],
    queryFn: () => listDiscounts(arenaId as string),
    enabled: !!arenaId,
  });
}

export function useCreateDiscount(arenaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DiscountCodeInput) => createDiscount(arenaId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(arenaId) }),
  });
}

export function useUpdateDiscount(arenaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      discountId,
      input,
    }: {
      discountId: string;
      input: Partial<Omit<DiscountCodeInput, "code" | "discount_type">>;
    }) => updateDiscount(arenaId, discountId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(arenaId) }),
  });
}

export function useDeleteDiscount(arenaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (discountId: string) => deleteDiscount(arenaId, discountId),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(arenaId) }),
  });
}
