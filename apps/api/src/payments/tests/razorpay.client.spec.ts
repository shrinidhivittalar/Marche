import { createHmac } from 'crypto';
import { InternalServerErrorException } from '@nestjs/common';
import { RazorpayClient } from '../razorpay/razorpay.client';

const KEY_ID = 'rzp_test_key';
const KEY_SECRET = 'test_key_secret';
const WEBHOOK_SECRET = 'test_webhook_secret';

function build() {
  process.env.RAZORPAY_KEY_ID = KEY_ID;
  process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  const client = new RazorpayClient();
  // orders.create/fetch are the only SDK calls this client makes — replace
  // them directly rather than mocking the whole Razorpay constructor.
  const ordersCreate = jest.fn();
  (client as unknown as { client: { orders: { create: typeof ordersCreate } } }).client.orders = {
    create: ordersCreate,
  } as never;
  return { client, ordersCreate };
}

// Mirrors the SDK's normalizeError() shape for a response that did reach
// Razorpay (node_modules/razorpay/dist/api.js).
function httpError(statusCode: number, message = 'error') {
  return { statusCode, error: { description: message } };
}

// Mirrors what happens when the response never comes back at all (timeout,
// DNS failure, connection reset) — normalizeError() itself throws a plain
// TypeError in that case, with no statusCode attached.
function networkError(message = 'network blip') {
  return new TypeError(message);
}

describe('RazorpayClient', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('createOrder retry', () => {
    it('retries on a transient failure and succeeds', async () => {
      const { client, ordersCreate } = build();
      ordersCreate
        .mockRejectedValueOnce(networkError())
        .mockResolvedValueOnce({ id: 'order_1', amount: 95000, currency: 'INR' });

      const order = await client.createOrder(950, 'connection_1');

      expect(order).toEqual({ id: 'order_1', amount: 95000, currency: 'INR' });
      expect(ordersCreate).toHaveBeenCalledTimes(2);
    });

    it('exhausts retries and throws after repeated transient failures', async () => {
      const { client, ordersCreate } = build();
      ordersCreate.mockRejectedValue(networkError());

      await expect(client.createOrder(950, 'connection_1')).rejects.toThrow(
        InternalServerErrorException,
      );
      // 1 initial attempt + 2 retries = 3 total calls.
      expect(ordersCreate).toHaveBeenCalledTimes(3);
    });

    it('does not retry a definitive 4xx rejection', async () => {
      const { client, ordersCreate } = build();
      ordersCreate.mockRejectedValue(httpError(400, 'bad request'));

      await expect(client.createOrder(950, 'connection_1')).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(ordersCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('verifyPaymentSignature', () => {
    it('accepts a correctly signed order_id|payment_id pair', () => {
      const { client } = build();
      const orderId = 'order_1';
      const paymentId = 'pay_1';
      const signature = createHmac('sha256', KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      expect(client.verifyPaymentSignature(orderId, paymentId, signature)).toBe(true);
    });

    it('rejects a tampered signature', () => {
      const { client } = build();
      const orderId = 'order_1';
      const paymentId = 'pay_1';
      const signature = createHmac('sha256', KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');
      const tampered = signature.slice(0, -1) + (signature.at(-1) === '0' ? '1' : '0');

      expect(client.verifyPaymentSignature(orderId, paymentId, tampered)).toBe(false);
    });

    it('rejects a signature of the wrong length without throwing', () => {
      const { client } = build();
      expect(client.verifyPaymentSignature('order_1', 'pay_1', 'not-a-real-signature')).toBe(false);
    });
  });

  describe('verifyWebhookSignature', () => {
    it('accepts a correctly signed webhook body', () => {
      const { client } = build();
      const rawBody = '{"event":"payment.captured"}';
      const signature = createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');

      expect(client.verifyWebhookSignature(rawBody, signature)).toBe(true);
    });

    it('rejects a tampered webhook body', () => {
      const { client } = build();
      const rawBody = '{"event":"payment.captured"}';
      const signature = createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');

      expect(client.verifyWebhookSignature('{"event":"payment.tampered"}', signature)).toBe(false);
    });
  });
});
