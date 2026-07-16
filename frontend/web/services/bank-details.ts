/** Owner bank-transfer receiving-account API calls (backend modules/arena bank details).
 * An arena can hold several accounts; one is the default shown at checkout. */
import { api } from "@/services/api";
import type { BankDetails } from "@/types";

export interface BankDetailsInput {
  label?: string | null;
  bank_name: string;
  account_title: string;
  account_number: string;
  iban?: string | null;
  branch_code?: string | null;
  swift_code?: string | null;
  payment_instructions?: string | null;
  is_default?: boolean;
  is_active?: boolean;
}

export function listOwnerBankDetails(arenaId: string): Promise<BankDetails[]> {
  return api.get<BankDetails[]>(`/owner/arenas/${arenaId}/bank-details`);
}

export function addBankDetails(arenaId: string, input: BankDetailsInput): Promise<BankDetails> {
  return api.post<BankDetails>(`/owner/arenas/${arenaId}/bank-details`, input);
}

export function updateBankDetails(
  arenaId: string,
  bankDetailsId: string,
  input: Partial<BankDetailsInput>,
): Promise<BankDetails> {
  return api.patch<BankDetails>(`/owner/arenas/${arenaId}/bank-details/${bankDetailsId}`, input);
}

export function deleteBankDetails(arenaId: string, bankDetailsId: string): Promise<null> {
  return api.del<null>(`/owner/arenas/${arenaId}/bank-details/${bankDetailsId}`);
}
