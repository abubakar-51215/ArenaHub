/** Player-facing payment API calls. */
import { api } from '../lib/api';
import { API_BASE } from '../lib/config';
import { useAuthStore } from '../store/auth';
import type { Page, PayMethodInfo, Payment, PaymentHistoryItem, PaymentInitiateResult, PaymentMethod } from '../types';

export function listPaymentMethods(): Promise<PayMethodInfo[]> {
  return api.get<PayMethodInfo[]>('/payments/methods');
}

export function initiatePayment(
  bookingGroupId: string,
  paymentMethod: PaymentMethod,
  extra: { wallet_number?: string; return_url?: string } = {},
): Promise<PaymentInitiateResult> {
  return api.post<PaymentInitiateResult>('/payments/initiate', {
    booking_group_id: bookingGroupId,
    payment_method: paymentMethod,
    ...extra,
  });
}

/** Pay what is still owed on a confirmed booking. The amount is never sent: the server works it
 * out. The key makes a repeated tap the same request, so the player is never charged twice. */
export function initiateBalancePayment(
  bookingGroupId: string,
  paymentMethod: PaymentMethod,
  idempotencyKey: string,
  extra: { wallet_number?: string; return_url?: string } = {},
): Promise<PaymentInitiateResult> {
  return api.post<PaymentInitiateResult>(
    '/payments/initiate-balance',
    { booking_group_id: bookingGroupId, payment_method: paymentMethod, ...extra },
    { idempotencyKey },
  );
}

/** Development only: stands in for approving (or declining) in the wallet app. */
export function simulatePayment(paymentId: string, success: boolean): Promise<Payment> {
  return api.post<Payment>(`/payments/${paymentId}/simulate-confirm?success=${success}`, {});
}

export function uploadReceipt(paymentId: string, receiptProofUrl: string): Promise<Payment> {
  return api.post<Payment>(`/payments/${paymentId}/receipt`, { receipt_proof_url: receiptProofUrl });
}

export function getPaymentByGroup(bookingGroupId: string): Promise<Payment> {
  return api.get<Payment>(`/payments/by-group/${bookingGroupId}`);
}

export function listMyPayments(): Promise<Page<PaymentHistoryItem>> {
  return api.get<Page<PaymentHistoryItem>>('/payments/my?page_size=50');
}

/** Fetches the receipt PDF bytes — a raw binary fetch since this endpoint
 * returns `application/pdf`, not the JSON envelope the `api` helper expects. */
export async function fetchReceiptPdf(paymentId: string): Promise<Uint8Array> {
  const token = useAuthStore.getState().accessToken;
  const res = await fetch(`${API_BASE}/payments/${paymentId}/receipt.pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error('Could not download the receipt.');
  return new Uint8Array(await res.arrayBuffer());
}
