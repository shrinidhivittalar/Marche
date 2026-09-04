import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import Razorpay from 'razorpay';
import { createHmac, timingSafeEqual } from 'crypto';

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
}

// The one external call this app makes to Razorpay (orders.create), plus
// the two signature checks that decide whether to trust what comes back —
// wrapped per CLAUDE.md's "wrap all external API calls in a dedicated
// client module" rather than called ad hoc from the service.
//
// Fails loudly on missing keys, same as RedisThrottlerStorage does for
// REDIS_URL: a payments module that silently no-ops when misconfigured
// would let a client believe they paid when nothing was ever charged.
@Injectable()
export class RazorpayClient {
  private static readonly RETRY_DELAYS_MS = [200, 600];
  private readonly logger = new Logger(RazorpayClient.name);
  private readonly client: Razorpay;
  private readonly keySecret: string;
  private readonly webhookSecret: string;
  // Safe to expose — Checkout.js on the frontend needs the public key id to
  // open the payment sheet. The secret (below) never leaves this module.
  readonly keyId: string;

  constructor() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!keyId || !keySecret || !webhookSecret) {
      throw new Error(
        'RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET must all be set — see apps/api/.env.example.',
      );
    }
    this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
    this.keyId = keyId;
    this.keySecret = keySecret;
    this.webhookSecret = webhookSecret;
  }

  /**
   * Amount in rupees (matches Payment.amount / Proposal.proposedPrice
   * elsewhere in this codebase); converted to paise here, since that's the
   * only unit Razorpay's API accepts and nowhere else needs to know that.
   */
  async createOrder(amountRupees: number, receipt: string): Promise<RazorpayOrder> {
    const payload = {
      amount: Math.round(amountRupees * 100),
      currency: 'INR',
      receipt,
    };
    // Money path: a transient network blip shouldn't fail the whole checkout.
    // 3 attempts total (1 initial + 2 retries), short backoff between them.
    // Only retried when the failure looks transient (see isTransientError) —
    // a definitive rejection (bad request, auth failure) fails immediately.
    let lastError: unknown;
    for (let attempt = 0; attempt <= RazorpayClient.RETRY_DELAYS_MS.length; attempt++) {
      try {
        const order = await this.client.orders.create(payload);
        return { id: order.id, amount: Number(order.amount), currency: order.currency };
      } catch (error) {
        lastError = error;
        const isLastAttempt = attempt === RazorpayClient.RETRY_DELAYS_MS.length;
        if (isLastAttempt || !this.isTransientError(error)) {
          break;
        }
        this.logger.warn(
          `Razorpay order creation attempt ${attempt + 1} failed, retrying: ${(error as Error).message}`,
        );
        await this.delay(RazorpayClient.RETRY_DELAYS_MS[attempt] as number);
      }
    }
    this.logger.error(`Razorpay order creation failed: ${(lastError as Error).message}`);
    throw new InternalServerErrorException('Could not start the payment. Please try again.');
  }

  // Razorpay's SDK (node_modules/razorpay/dist/api.js normalizeError) rethrows
  // `{ statusCode, error }` when the request actually reached the server, but
  // throws a plain TypeError with no statusCode when it never got a response
  // at all (timeout, DNS failure, connection reset) — that's the transient
  // case worth retrying. A 5xx response is also worth retrying; a 4xx is a
  // definitive rejection (bad request, auth failure) and isn't.
  private isTransientError(error: unknown): boolean {
    const statusCode = (error as { statusCode?: number })?.statusCode;
    if (typeof statusCode !== 'number') {
      return true;
    }
    return statusCode >= 500;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * The `receipt` an order was created with — for us, always the
   * connectionId (see createOrder's caller, PaymentsService.createOrder).
   * Used only as a reconciliation fallback: retry() repoints
   * Payment.razorpayOrderId at a fresh order, so a webhook that arrives
   * for the now-superseded old order_id no longer matches any row via
   * findByOrderId. The order itself still exists on Razorpay's side
   * regardless of what our own DB forgot, so fetching it back is how we
   * recover which connection it belonged to. Returns null rather than
   * throwing on failure — the webhook handler's existing log-and-drop
   * behavior is an acceptable fallback for the fallback.
   */
  async fetchOrderReceipt(orderId: string): Promise<string | null> {
    try {
      const order = await this.client.orders.fetch(orderId);
      return typeof order.receipt === 'string' ? order.receipt : null;
    } catch (error) {
      this.logger.error(`Razorpay order lookup failed for ${orderId}: ${(error as Error).message}`);
      return null;
    }
  }

  /** The Checkout.js success-callback signature — order_id + payment_id, signed with the key secret. */
  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    return this.hmacHexEquals(`${orderId}|${paymentId}`, signature, this.keySecret);
  }

  /** The async webhook's own signature, signed with the separate webhook secret set in the Razorpay dashboard. */
  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    return this.hmacHexEquals(rawBody, signature, this.webhookSecret);
  }

  // Same HMAC construction as razorpay/dist/utils/razorpay-utils.js
  // (validatePaymentVerification / validateWebhookSignature), computed
  // locally so the comparison can be timing-safe — the SDK's own helpers
  // compare with plain `===`, which is a (largely theoretical, over a
  // rate-limited HTTP endpoint) timing oracle.
  private hmacHexEquals(payload: string, signature: string, secret: string): boolean {
    // Buffer.from(_, 'hex') silently stops at the first non-hex character
    // instead of throwing, so a malformed signature must be rejected by
    // format before it ever reaches the byte-length/timingSafeEqual check.
    if (!/^[0-9a-fA-F]+$/.test(signature)) {
      return false;
    }
    const expectedHex = createHmac('sha256', secret).update(payload).digest('hex');
    const expected = Buffer.from(expectedHex, 'hex');
    const actual = Buffer.from(signature, 'hex');
    // timingSafeEqual throws on length mismatch instead of returning false —
    // check first so a mismatched length is just "not valid", same as any
    // other tampered signature.
    if (expected.length !== actual.length) {
      return false;
    }
    return timingSafeEqual(expected, actual);
  }
}
