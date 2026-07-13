/** Court peak-pricing rule API calls (backend modules/court pricing rules). */
import { api } from "@/services/api";
import type { PricingRule } from "@/types";

export interface PricingRuleInput {
  name: string;
  weekday?: number | null;
  start_time: string;
  end_time: string;
  price_multiplier: string;
  is_active?: boolean;
}

export function listPricingRules(courtId: string): Promise<PricingRule[]> {
  return api.get<PricingRule[]>(`/owner/courts/${courtId}/pricing-rules`);
}

export function createPricingRule(courtId: string, input: PricingRuleInput): Promise<PricingRule> {
  return api.post<PricingRule>(`/owner/courts/${courtId}/pricing-rules`, input);
}

export function updatePricingRule(
  courtId: string,
  ruleId: string,
  input: Partial<PricingRuleInput>,
): Promise<PricingRule> {
  return api.patch<PricingRule>(`/owner/courts/${courtId}/pricing-rules/${ruleId}`, input);
}

export function deletePricingRule(courtId: string, ruleId: string): Promise<null> {
  return api.del<null>(`/owner/courts/${courtId}/pricing-rules/${ruleId}`);
}
