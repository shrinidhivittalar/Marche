import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConnectionsService } from '../../proposals/services/connections.service';
import { ProfilesRepository } from '../../profiles/repositories/profiles.repository';
import { getOwnProfileOrThrow, assertOwnership } from '../../profiles/profile-access.util';
import { paginate, type Paginated } from '../../marketplace/pagination';
import {
  PaymentsRepository,
  type PaymentWithConnection,
} from '../repositories/payments.repository';
import { RazorpayClient } from '../razorpay/razorpay.client';
import type { Payment } from '@marche/db';
import type { PaginationQueryDto } from '../../profiles/dto/pagination-query.dto';

export interface CreatedOrder {
  razorpayOrderId: string;
  amountPaise: number;
  currency: string;
  razorpayKeyId: string;
}

// Client pays the full agreed amount at hire time (module5-completion.md's
// neighbour decision, same "at hire" trigger — see schema.prisma's comment
// on Payment). One Payment row per connection; a retried/abandoned checkout
// reuses that row rather than piling up orphaned Razorpay orders.
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly paymentsRepository: PaymentsRepository,
    private readonly connectionsService: ConnectionsService,
    private readonly profilesRepository: ProfilesRepository,
    private readonly razorpay: RazorpayClient,
  ) {}

  /**
   * Starts (or resumes) payment for a connection. Client-only — the party
   * who owes the money is the only one who can open a checkout for it.
   */
  async createOrder(userId: string, connectionId: string): Promise<CreatedOrder> {
    const connection = await this.getOwnConnectionAsClient(userId, connectionId);

    const existing = await this.paymentsRepository.findByConnectionId(connectionId);
    if (existing?.status === 'PAID') {
      throw new ConflictException('This connection has already been paid for');
    }

    const amount = Number(connection.proposal.proposedPrice);
    const order = await this.razorpay.createOrder(amount, connectionId);

    // Retrying an abandoned/failed checkout updates the one row rather than
    // violating Payment.connectionId's unique constraint with a second row.
    if (existing) {
      await this.paymentsRepository.retry(existing.id, order.id);
    } else {
      await this.paymentsRepository.create({
        connectionId,
        amount: amount.toFixed(2),
        razorpayOrderId: order.id,
      });
    }

    return {
      razorpayOrderId: order.id,
      amountPaise: order.amount,
      currency: order.currency,
      razorpayKeyId: this.razorpay.keyId,
    };
  }

  /**
   * The Checkout.js success-callback path: fast confirmation for the UI.
   * The webhook (handleWebhook, below) is the actual source of truth and
   * covers the case where the browser never gets to call this at all — a
   * closed tab or dropped connection right after a successful charge.
   */
  async verifyCallback(
    userId: string,
    connectionId: string,
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
  ): Promise<Payment> {
    await this.getOwnConnectionAsClient(userId, connectionId);

    const payment = await this.paymentsRepository.findByConnectionId(connectionId);
    if (!payment || payment.razorpayOrderId !== razorpayOrderId) {
      throw new BadRequestException('No matching payment order for this connection');
    }
    if (payment.status === 'PAID') {
      return payment; // Idempotent — a duplicate callback just confirms what already happened.
    }

    const valid = this.razorpay.verifyPaymentSignature(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    );
    if (!valid) {
      throw new BadRequestException('Payment signature could not be verified');
    }

    // Lost the race to the webhook (already PAID by the time this UPDATE
    // ran) — same idempotent outcome as the early return above, just
    // discovered a moment later. Re-read rather than trust the pre-write
    // `payment` value, which is now stale.
    await this.paymentsRepository.markPaid(payment.id, razorpayPaymentId, razorpaySignature);
    return (await this.paymentsRepository.findByConnectionId(connectionId))!;
  }

  /**
   * Razorpay's async webhook. Signature already verified by the controller
   * (needs the raw body, which only it has); this just applies the event.
   * Unknown orders and already-PAID rows are both silently no-ops — a
   * webhook can arrive more than once, and one for an order this app never
   * created isn't this endpoint's problem.
   */
  async handleWebhookEvent(event: string, orderId: string, paymentId: string): Promise<void> {
    const payment = await this.paymentsRepository.findByOrderId(orderId);
    if (!payment) {
      this.logger.warn(`Webhook for unknown Razorpay order ${orderId}`);
      return;
    }
    if (payment.status === 'PAID') return;

    if (event === 'payment.captured') {
      await this.paymentsRepository.markPaid(payment.id, paymentId, '');
    } else if (event === 'payment.failed') {
      await this.paymentsRepository.markFailed(payment.id);
    }
  }

  /** Either party to the connection may check payment status. */
  async getStatus(userId: string, connectionId: string): Promise<Payment | null> {
    await this.connectionsService.findById(userId, connectionId); // party check
    return this.paymentsRepository.findByConnectionId(connectionId);
  }

  /**
   * The caller's own payment history — what a client has paid, or what a
   * provider has been paid, depending on which side of the marketplace
   * their profile is on. Backs Transactions, Weekly Summary and Budgets on
   * the client side, and Finances on the provider side; all four are views
   * over this one list rather than separate reads.
   */
  async listMine(
    userId: string,
    pagination: PaginationQueryDto,
  ): Promise<Paginated<PaymentWithConnection>> {
    const profile = await getOwnProfileOrThrow(this.profilesRepository, userId);
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] =
      profile.user.role === 'CLIENT'
        ? await Promise.all([
            this.paymentsRepository.listForClient(profile.id, skip, limit),
            this.paymentsRepository.countForClient(profile.id),
          ])
        : await Promise.all([
            this.paymentsRepository.listForProvider(profile.id, skip, limit),
            this.paymentsRepository.countForProvider(profile.id),
          ]);

    return paginate(data, total, page, limit);
  }

  private async getOwnConnectionAsClient(userId: string, connectionId: string) {
    const myProfile = await getOwnProfileOrThrow(this.profilesRepository, userId);
    const connection = await this.connectionsService.findById(userId, connectionId); // party check
    assertOwnership(connection.clientProfileId, myProfile.id);
    return connection;
  }
}
