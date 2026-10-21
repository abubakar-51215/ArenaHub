/** TanStack Query hooks for the owner's bank-transfer receiving accounts. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type BankDetailsInput,
  addBankDetails,
  deleteBankDetails,
  listOwnerBankDetails,
  updateBankDetails,
  verifyBankDetailsChange,
} from "@/services/bank-details";

const key = (arenaId: string) => ["bank-details", arenaId] as const;

export function useBankDetails(arenaId: string | null) {
  return useQuery({
    queryKey: key(arenaId ?? "none"),
    queryFn: () => listOwnerBankDetails(arenaId as string),
    enabled: !!arenaId,
  });
}

export function useAddBankDetails(arenaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BankDetailsInput) => addBankDetails(arenaId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(arenaId) }),
  });
}

export function useUpdateBankDetails(arenaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<BankDetailsInput> }) =>
      updateBankDetails(arenaId, id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(arenaId) }),
  });
}

export function useDeleteBankDetails(arenaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteBankDetails(arenaId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(arenaId) }),
  });
}

/** Confirms whatever add/edit/remove is staged for this arena with its emailed code. */
export function useVerifyBankDetailsChange(arenaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => verifyBankDetailsChange(arenaId, code),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(arenaId) }),
  });
}
