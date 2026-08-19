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
    markPaid: jest.fn().mockResolvedValue({ id: 'payment_1', status: 'PAID' }),
    markFailed: jest.fn().mockResolvedValue({ id: 'payment_1', status: 'FAILED' }),
  };
  const connectionsService = {
    findById: jest.fn().mockResolvedValue(CONNECTION),
  };
  const profilesRepository = {
    findByUserId: jest.fn().mockResolvedValue({ id: 'profile_client' }),
  };
  const razorpay = {
    keyId: 'rzp_test_key',
    createOrder: jest.fn().mockResolvedValue({ id: 'order_1', amount: 950000, currency: 'INR' }),
    verifyPaymentSignature: jest.fn().mockReturnValue(true),
    verifyWebhookSignature: jest.fn().mockReturnValue(true),
  };

  const service = new PaymentsService(
    paymentsRepository as never,
    connectionsService as never,
    profilesRepository as never,
    razorpay as never,
  );

  return { service, paymentsRepository, connectionsService, profilesRepository, razorpay };
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
    it('marks the payment paid once the signature checks out', async () => {
      const { service, paymentsRepository } = build();
      paymentsRepository.findByConnectionId.mockResolvedValue({
        id: 'payment_1',
        status: 'CREATED',
        razorpayOrderId: 'order_1',
      });

      await service.verifyCallback('user_client', 'connection_1', 'order_1', 'pay_1', 'sig_1');

      expect(paymentsRepository.markPaid).toHaveBeenCalledWith('payment_1', 'pay_1', 'sig_1');
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
    it('marks a captured payment paid', async () => {
      const { service, paymentsRepository } = build();
      paymentsRepository.findByOrderId.mockResolvedValue({ id: 'payment_1', status: 'CREATED' });

      await service.handleWebhookEvent('payment.captured', 'order_1', 'pay_1');

      expect(paymentsRepository.markPaid).toHaveBeenCalledWith('payment_1', 'pay_1', '');
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
});
