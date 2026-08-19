import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import Razorpay from 'razorpay';
import {
  validatePaymentVerification,
  validateWebhookSignature,
} from 'razorpay/dist/utils/razorpay-utils';

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
    try {
      const order = await this.client.orders.create({
        amount: Math.round(amountRupees * 100),
        currency: 'INR',
        receipt,
      });
      return { id: order.id, amount: Number(order.amount), currency: order.currency };
    } catch (error) {
      this.logger.error(`Razorpay order creation failed: ${(error as Error).message}`);
      throw new InternalServerErrorException('Could not start the payment. Please try again.');
    }
  }

  /** The Checkout.js success-callback signature — order_id + payment_id, signed with the key secret. */
  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    return validatePaymentVerification(
      { order_id: orderId, payment_id: paymentId },
      signature,
      this.keySecret,
    );
  }

  /** The async webhook's own signature, signed with the separate webhook secret set in the Razorpay dashboard. */
  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    return validateWebhookSignature(rawBody, signature, this.webhookSecret);
  }
}
