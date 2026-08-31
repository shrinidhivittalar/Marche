import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PaymentsService } from '../services/payments.service';

const CONNECTION = {
  id: 'connection_1',
  clientProfileId: 'profile_client',
  providerProfileId: 'profile_provider',
  proposal: { proposedPrice: '9500' },
};

function build() {
  const paymentsRepository = {
    findByConnectionId: jest.fn().mockResolvedValue(null),
    findByOrderId: jest.fn(),
    create: jest.fn().mockResolvedValue({ id: 'payment_1', status: 'CREATED' }),
    retry: jest.fn().mockResolvedValue({ id: 'payment_1', status: 'CREATED' }),
    markPaid: jest.fn().mockResolvedValue(1),
    markFailed: jest.fn().mockResolvedValue({ id: 'payment_1', status: 'FAILED' }),
    listForClient: jest.fn().mockResolvedValue([]),
    countForClient: jest.fn().mockResolvedValue(0),
    listForProvider: jest.fn().mockResolvedValue([]),
    countForProvider: jest.fn().mockResolvedValue(0),
  };
  const connectionsService = {
    findById: jest.fn().mockResolvedValue(CONNECTION),
  };
  const profilesRepository = {
    findByUserId: jest.fn().mockResolvedValue({
      id: 'profile_client',
      user: { role: 'CLIENT', capabilities: [{ capability: 'CLIENT' }] },
    }),
    findUserIdById: jest.fn().mockResolvedValue('user_provider'),
  };
  const razorpay = {
    keyId: 'rzp_test_key',
    createOrder: jest.fn().mockResolvedValue({ id: 'order_1', amount: 950000, currency: 'INR' }),
    verifyPaymentSignature: jest.fn().mockReturnValue(true),
    verifyWebhookSignature: jest.fn().mockReturnValue(true),
  };
  const connectionsRepository = {
    findById: jest.fn().mockResolvedValue({
      ...CONNECTION,
      job: { title: 'Wedding Photography' },
    }),
  };
  const notificationsService = {
    paymentReceived: jest.fn().mockResolvedValue(undefined),
  };

  const service = new PaymentsService(
    paymentsRepository as never,
    connectionsService as never,
    profilesRepository as never,
    razorpay as never,
    connectionsRepository as never,
    notificationsService as never,
  );

  return {
    service,
    paymentsRepository,
    connectionsService,
    profilesRepository,
    razorpay,
    connectionsRepository,
    notificationsService,
  };
}

describe('PaymentsService', () => {
  describe('createOrder', () => {
    it('creates a Razorpay order for the agreed amount and persists it', async () => {
      const { service, paymentsRepository, razorpay } = build();

      const result = await service.createOrder('user_client', 'connection_1');

      expect(razorpay.createOrder).toHaveBeenCalledWith(9500, 'connection_1');
      expect(paymentsRepository.create).toHaveBeenCalledWith({
        connectionId: 'connection_1',
        amount: '9500.00',
        razorpayOrderId: 'order_1',
      });
      expect(result.razorpayOrderId).toBe('order_1');
      expect(result.razorpayKeyId).toBe('rzp_test_key');
    });

    it('charges the negotiated agreedPrice, not the original proposedPrice, when one was agreed', async () => {
      const { service, connectionsService, razorpay } = build();
      connectionsService.findById.mockResolvedValue({
        ...CONNECTION,
        proposal: { proposedPrice: '9500', agreedPrice: '8200' },
      });

      await service.createOrder('user_client', 'connection_1');

      expect(razorpay.createOrder).toHaveBeenCalledWith(8200, 'connection_1');
    });

    it('rejects a non-client party', async () => {
      const { service, profilesRepository } = build();
      profilesRepository.findByUserId.mockResolvedValue({ id: 'profile_provider' });

      await expect(service.createOrder('user_provider', 'connection_1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('refuses to reopen a connection that is already paid', async () => {
      const { service, paymentsRepository } = build();
      paymentsRepository.findByConnectionId.mockResolvedValue({ id: 'payment_1', status: 'PAID' });

      await expect(service.createOrder('user_client', 'connection_1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('resumes an abandoned checkout by retrying the same row, not creating a second one', async () => {
      const { service, paymentsRepository } = build();
      paymentsRepository.findByConnectionId.mockResolvedValue({
        id: 'payment_1',
        status: 'CREATED',
      });

      await service.createOrder('user_client', 'connection_1');

      expect(paymentsRepository.retry).toHaveBeenCalledWith('payment_1', 'order_1');
      expect(paymentsRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('verifyCallback', () => {
    it('marks the payment paid once the signature checks out and notifies the provider', async () => {
      const { service, paymentsRepository, notificationsService } = build();
      paymentsRepository.findByConnectionId.mockResolvedValue({
        id: 'payment_1',
        status: 'CREATED',
        razorpayOrderId: 'order_1',
        amount: '9500.00',
      });

      await service.verifyCallback('user_client', 'connection_1', 'order_1', 'pay_1', 'sig_1');

      expect(paymentsRepository.markPaid).toHaveBeenCalledWith('payment_1', 'pay_1', 'sig_1');
      expect(notificationsService.paymentReceived).toHaveBeenCalledWith(
        'user_provider',
        expect.objectContaining({ connectionId: 'connection_1', amount: '9500.00' }),
      );
    });

    it('refuses a signature that does not verify, without marking anything paid', async () => {
      const { service, paymentsRepository, razorpay } = build();
      razorpay.verifyPaymentSignature.mockReturnValue(false);
      paymentsRepository.findByConnectionId.mockResolvedValue({
        id: 'payment_1',
        status: 'CREATED',
        razorpayOrderId: 'order_1',
      });

      await expect(
        service.verifyCallback('user_client', 'connection_1', 'order_1', 'pay_1', 'bad_sig'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(paymentsRepository.markPaid).not.toHaveBeenCalled();
    });

    it('is idempotent — a duplicate callback on an already-paid row is a no-op', async () => {
      const { service, paymentsRepository, razorpay } = build();
      paymentsRepository.findByConnectionId.mockResolvedValue({
        id: 'payment_1',
        status: 'PAID',
        razorpayOrderId: 'order_1',
      });

      await service.verifyCallback('user_client', 'connection_1', 'order_1', 'pay_1', 'sig_1');

      expect(razorpay.verifyPaymentSignature).not.toHaveBeenCalled();
      expect(paymentsRepository.markPaid).not.toHaveBeenCalled();
    });

    it('losing the race to the webhook still returns the current, already-PAID row rather than overwriting it', async () => {
      // Regression coverage for the "Could be better" audit finding:
      // verifyCallback and handleWebhookEvent both used to read-then-write
      // with no locking, so the real, browser-verified signature could be
      // clobbered by the webhook's empty one if both fired concurrently.
      // markPaid is now a conditional UPDATE (WHERE status != 'PAID') — the
      // loser's write matches zero rows, which paymentsRepository.markPaid
      // reports back as a count. This simulates that loss: the webhook won
      // in between the CREATED read below and this call, so the conditional
      // UPDATE here affects 0 rows.
      const { service, paymentsRepository, razorpay } = build();
      paymentsRepository.findByConnectionId
        .mockResolvedValueOnce({ id: 'payment_1', status: 'CREATED', razorpayOrderId: 'order_1' })
        .mockResolvedValueOnce({
          id: 'payment_1',
          status: 'PAID',
          razorpayPaymentId: 'pay_webhook',
          razorpaySignature: '',
        });
      paymentsRepository.markPaid.mockResolvedValue(0);

      const result = await service.verifyCallback(
        'user_client',
        'connection_1',
        'order_1',
        'pay_1',
        'sig_1',
      );

      expect(razorpay.verifyPaymentSignature).toHaveBeenCalled();
      expect(paymentsRepository.markPaid).toHaveBeenCalledWith('payment_1', 'pay_1', 'sig_1');
      // Re-read after the conditional write, not the stale pre-write value —
      // reflects the webhook's write, which actually won.
      expect(result.razorpayPaymentId).toBe('pay_webhook');
    });

    it("rejects an order id that does not match the connection's own payment", async () => {
      const { service, paymentsRepository } = build();
      paymentsRepository.findByConnectionId.mockResolvedValue({
        id: 'payment_1',
        status: 'CREATED',
        razorpayOrderId: 'order_1',
      });

      await expect(
        service.verifyCallback('user_client', 'connection_1', 'order_WRONG', 'pay_1', 'sig_1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('handleWebhookEvent', () => {
    it('marks a captured payment paid and notifies the provider', async () => {
      const { service, paymentsRepository, notificationsService } = build();
      paymentsRepository.findByOrderId.mockResolvedValue({
        id: 'payment_1',
        connectionId: 'connection_1',
        status: 'CREATED',
        amount: '9500.00',
      });

      await service.handleWebhookEvent('payment.captured', 'order_1', 'pay_1');

      expect(paymentsRepository.markPaid).toHaveBeenCalledWith('payment_1', 'pay_1', '');
      expect(notificationsService.paymentReceived).toHaveBeenCalledWith(
        'user_provider',
        expect.objectContaining({ connectionId: 'connection_1', amount: '9500.00' }),
      );
    });

    it('does not notify the loser of a markPaid race (0 rows affected)', async () => {
      const { service, paymentsRepository, notificationsService } = build();
      paymentsRepository.findByOrderId.mockResolvedValue({
        id: 'payment_1',
        connectionId: 'connection_1',
        status: 'CREATED',
        amount: '9500.00',
      });
      paymentsRepository.markPaid.mockResolvedValue(0);

      await service.handleWebhookEvent('payment.captured', 'order_1', 'pay_1');

      expect(notificationsService.paymentReceived).not.toHaveBeenCalled();
    });

    it('marks a failed payment failed', async () => {
      const { service, paymentsRepository } = build();
      paymentsRepository.findByOrderId.mockResolvedValue({ id: 'payment_1', status: 'CREATED' });

      await service.handleWebhookEvent('payment.failed', 'order_1', 'pay_1');

      expect(paymentsRepository.markFailed).toHaveBeenCalledWith('payment_1');
    });

    it('is a no-op for an order this app never created', async () => {
      const { service, paymentsRepository } = build();
      paymentsRepository.findByOrderId.mockResolvedValue(null);

      await service.handleWebhookEvent('payment.captured', 'order_unknown', 'pay_1');

      expect(paymentsRepository.markPaid).not.toHaveBeenCalled();
    });

    it('is a no-op for a row already marked paid', async () => {
      const { service, paymentsRepository } = build();
      paymentsRepository.findByOrderId.mockResolvedValue({ id: 'payment_1', status: 'PAID' });

      await service.handleWebhookEvent('payment.captured', 'order_1', 'pay_1');

      expect(paymentsRepository.markPaid).not.toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('is readable by either party, not just the client', async () => {
      const { service, connectionsService, paymentsRepository } = build();
      paymentsRepository.findByConnectionId.mockResolvedValue({ id: 'payment_1', status: 'PAID' });

      const result = await service.getStatus('user_provider', 'connection_1');

      expect(connectionsService.findById).toHaveBeenCalledWith('user_provider', 'connection_1');
      expect(result?.status).toBe('PAID');
    });
  });

  describe('listMine', () => {
    it("reads a client's own payments from the client side of the join", async () => {
      const { service, paymentsRepository } = build();
      paymentsRepository.listForClient.mockResolvedValue([{ id: 'payment_1' }]);
      paymentsRepository.countForClient.mockResolvedValue(1);

      const result = await service.listMine('user_client', { page: 1, limit: 20 });

      expect(paymentsRepository.listForClient).toHaveBeenCalledWith('profile_client', 0, 20);
      expect(paymentsRepository.listForProvider).not.toHaveBeenCalled();
      expect(result.data).toEqual([{ id: 'payment_1' }]);
      expect(result.pagination.total).toBe(1);
    });

    it("reads a provider's own payments from the provider side of the join", async () => {
      const { service, paymentsRepository, profilesRepository } = build();
      profilesRepository.findByUserId.mockResolvedValue({
        id: 'profile_provider',
        user: { role: 'PROVIDER', capabilities: [{ capability: 'PROVIDER' }] },
      });
      paymentsRepository.listForProvider.mockResolvedValue([{ id: 'payment_2' }]);
      paymentsRepository.countForProvider.mockResolvedValue(1);

      const result = await service.listMine('user_provider', { page: 1, limit: 20 });

      expect(paymentsRepository.listForProvider).toHaveBeenCalledWith('profile_provider', 0, 20);
      expect(paymentsRepository.listForClient).not.toHaveBeenCalled();
      expect(result.data).toEqual([{ id: 'payment_2' }]);
    });
  });
});
