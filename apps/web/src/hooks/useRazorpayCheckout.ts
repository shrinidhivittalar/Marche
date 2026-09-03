import { useState } from 'react';
import { paymentsApi } from '../lib/payments-api';
import { loadRazorpayCheckout } from '../lib/loadRazorpayCheckout';

// The Razorpay checkout flow (load the SDK, create the order, open the
// widget, verify on success) used to be copy-pasted into ContractDetailPage
// and ProposalDetailPage — same shape, same order of calls, drifting apart
// a little more each time either one got a fix. This is the one copy.
//
// `formatError` and `onVerified` are the only things that actually varied
// between the two call sites (their fallback error copy, and what happens
// after a verified payment — refetch vs. refetch, but for different
// resources), so those are the parameters. Everything else — the options
// shape, when verify runs, the dismiss handler — is not configurable on
// purpose: it was never supposed to differ.
export interface UseRazorpayCheckoutOptions {
  token: string;
  connectionId: string;
  /** Shown in the Razorpay widget, e.g. `Booking: ${job.title}`. */
  description: string;
  prefillName?: string;
  /** Called after a successful verify — typically a payment-status refetch. */
  onVerified: () => Promise<void> | void;
  /** `phase` distinguishes the order-creation failure from the verify failure. */
  formatError: (err: unknown, phase: 'start' | 'verify') => string;
}

export interface UseRazorpayCheckoutResult {
  paying: boolean;
  error: string | null;
  pay: () => Promise<void>;
}

export function useRazorpayCheckout({
  token,
  connectionId,
  description,
  prefillName,
  onVerified,
  formatError,
}: UseRazorpayCheckoutOptions): UseRazorpayCheckoutResult {
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    setPaying(true);
    setError(null);
    try {
      await loadRazorpayCheckout();
      const order = await paymentsApi.createOrder(token, connectionId);

      if (!window.Razorpay) {
        throw new Error('Payment checkout failed to load.');
      }
      new window.Razorpay({
        key: order.razorpayKeyId,
        amount: order.amountPaise,
        currency: order.currency,
        order_id: order.razorpayOrderId,
        name: 'Marché',
        description,
        prefill: { name: prefillName },
        theme: { color: '#166534' },
        handler: async (response) => {
          try {
            await paymentsApi.verify(token, connectionId, {
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            await onVerified();
          } catch (err) {
            setError(formatError(err, 'verify'));
          } finally {
            setPaying(false);
          }
        },
        modal: { ondismiss: () => setPaying(false) },
      }).open();
    } catch (err) {
      setError(formatError(err, 'start'));
      setPaying(false);
    }
  };

  return { paying, error, pay };
}
