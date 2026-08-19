// Client for Payments. Beside the other domain clients for the same reason
// as always — a payment only ever exists on a Connection.
import { apiFetch } from './api-fetch';

export type PaymentStatus = 'CREATED' | 'PAID' | 'FAILED';

export interface ApiPayment {
  id: string;
  connectionId: string;
  amount: string;
  currency: string;
  status: PaymentStatus;
  paidAt: string | null;
  createdAt: string;
}

export interface CreatedOrder {
  razorpayOrderId: string;
  amountPaise: number;
  currency: string;
  razorpayKeyId: string;
}

export const paymentsApi = {
  createOrder: (token: string, connectionId: string) =>
    apiFetch<CreatedOrder>(`/connections/${connectionId}/payment/order`, token, {
      method: 'POST',
    }),

  verify: (
    token: string,
    connectionId: string,
    body: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
  ) =>
    apiFetch<ApiPayment>(`/connections/${connectionId}/payment/verify`, token, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  status: (token: string, connectionId: string) =>
    apiFetch<ApiPayment | null>(`/connections/${connectionId}/payment`, token),
};
