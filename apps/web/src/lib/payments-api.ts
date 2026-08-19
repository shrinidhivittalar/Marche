// Client for Payments. Beside the other domain clients for the same reason
// as always — a payment only ever exists on a Connection.
import { apiFetch, toQuery } from './api-fetch';
import type { Page } from './marketplace-api';

type Envelope<T> = {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
};

function normalisePage<T>(res: Envelope<T>): Page<T> {
  return { items: res.data, ...res.pagination };
}

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

export interface ApiPaymentWithConnection {
  id: string;
  amount: string;
  currency: string;
  status: PaymentStatus;
  paidAt: string | null;
  createdAt: string;
  connection: {
    id: string;
    job: { id: string; title: string; categoryId: string; category: { id: string; name: string } };
    clientProfile: { id: string; displayName: string };
    providerProfile: { id: string; displayName: string };
  };
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

  /** A client's own payments made, or a provider's own payments received. */
  mine: (token: string, page = 1, limit = 50) =>
    apiFetch<Envelope<ApiPaymentWithConnection>>(
      `/payments/me${toQuery({ page, limit })}`,
      token,
    ).then(normalisePage),
};
