// Loaded on demand rather than in index.html — most sessions never reach a
// payment, so there's no reason to pull this in on every page load. Cached
// so a client clicking "Pay now" twice (a slow network, an impatient
// double-click) doesn't inject the script tag a second time.
let loadPromise: Promise<void> | null = null;

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

export function loadRazorpayCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = null; // Let a retry try again instead of caching the failure forever.
      reject(
        new Error('Could not load the payment checkout. Check your connection and try again.'),
      );
    };
    document.body.appendChild(script);
  });

  return loadPromise;
}

export interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description: string;
  prefill?: { name?: string; email?: string };
  theme?: { color?: string };
  handler: (response: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void;
  modal?: { ondismiss?: () => void };
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => { open: () => void };
  }
}
