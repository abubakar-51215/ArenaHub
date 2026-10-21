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

/** Adding an account always needs a code (it's always a new payout destination): this
 * always resolves to null, which means "a 6-digit code was sent, call verifyBankDetailsChange". */
export function addBankDetails(
  arenaId: string,
  input: BankDetailsInput,
): Promise<BankDetails | null> {
  return api.post<BankDetails | null>(`/owner/arenas/${arenaId}/bank-details`, input);
}

/** Null means a code was sent (the account number, title or bank changed) — call
 * verifyBankDetailsChange. A real record means it applied at once (a pure default/active switch). */
export function updateBankDetails(
  arenaId: string,
  bankDetailsId: string,
  input: Partial<BankDetailsInput>,
): Promise<BankDetails | null> {
  return api.patch<BankDetails | null>(
    `/owner/arenas/${arenaId}/bank-details/${bankDetailsId}`,
    input,
  );
}

/** Removing an account always needs a code. */
export function deleteBankDetails(arenaId: string, bankDetailsId: string): Promise<null> {
  return api.del<null>(`/owner/arenas/${arenaId}/bank-details/${bankDetailsId}`);
}

export function verifyBankDetailsChange(
  arenaId: string,
  code: string,
): Promise<BankDetails | null> {
  return api.post<BankDetails | null>(`/owner/arenas/${arenaId}/bank-details/verify`, { code });
}
