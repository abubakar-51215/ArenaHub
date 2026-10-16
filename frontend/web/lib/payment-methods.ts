/**
 * The payment options the UI shows, always these four, in this order and
 * with these labels. `value` is the API's payment_method; `provider` is the
 * backend provider it resolves to (integrations/payments). The mock provider
 * is a development stand-in for the gateways and is never listed.
 */
import type { PaymentMethod } from "@/types";

export const PAYMENT_METHODS: readonly {
  value: PaymentMethod;
  label: string;
  provider: "stripe" | "manual" | "jazzcash" | "easypaisa";
}[] = [
  { value: "card", label: "Card", provider: "stripe" },
  { value: "bank_transfer", label: "Bank transfer", provider: "manual" },
  { value: "jazzcash", label: "JazzCash", provider: "jazzcash" },
  { value: "easypaisa", label: "EasyPaisa", provider: "easypaisa" },
];

export const PAYMENT_METHOD_LABEL = Object.fromEntries(
  PAYMENT_METHODS.map((m) => [m.value, m.label]),
) as Record<PaymentMethod, string>;
