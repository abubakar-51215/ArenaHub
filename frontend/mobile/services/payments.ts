/** Player-facing payment API calls. */
import { api } from '../lib/api';
import { API_BASE } from '../lib/config';
import { useAuthStore } from '../store/auth';
import type { Page, Payment, PaymentHistoryItem, PaymentInitiateResult, PaymentMethod } from '../types';

export function initiatePayment(
  bookingGroupId: string,
  paymentMethod: PaymentMethod,
): Promise<PaymentInitiateResult> {
  return api.post<PaymentInitiateResult>('/payments/initiate', {
    booking_group_id: bookingGroupId,
    payment_method: paymentMethod,
  });
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

/** Dev-only: simulate a gateway webhook without a real round trip. */
export function simulateConfirm(paymentId: string, success = true): Promise<Payment> {
  return api.post<Payment>(`/payments/${paymentId}/simulate-confirm?success=${success}`);
}
