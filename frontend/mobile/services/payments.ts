/** Player-facing payment API calls. */
import { api } from '../lib/api';
import type { Payment, PaymentInitiateResult, PaymentMethod } from '../types';

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

/** Dev-only: simulate a gateway webhook without a real round trip. */
export function simulateConfirm(paymentId: string, success = true): Promise<Payment> {
  return api.post<Payment>(`/payments/${paymentId}/simulate-confirm?success=${success}`);
}
