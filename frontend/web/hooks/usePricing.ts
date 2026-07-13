/** TanStack Query hooks for court peak-pricing rules. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createPricingRule,
  deletePricingRule,
  listPricingRules,
  type PricingRuleInput,
  updatePricingRule,
} from "@/services/pricing";

const key = (courtId: string) => ["pricing", courtId] as const;

export function usePricingRules(courtId: string | null) {
  return useQuery({
    queryKey: ["pricing", courtId ?? "none"],
    queryFn: () => listPricingRules(courtId as string),
    enabled: !!courtId,
  });
}

export function useCreatePricingRule(courtId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PricingRuleInput) => createPricingRule(courtId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(courtId) }),
  });
}

export function useUpdatePricingRule(courtId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId, input }: { ruleId: string; input: Partial<PricingRuleInput> }) =>
      updatePricingRule(courtId, ruleId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(courtId) }),
  });
}

export function useDeletePricingRule(courtId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) => deletePricingRule(courtId, ruleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(courtId) }),
  });
}
