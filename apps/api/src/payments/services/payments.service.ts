import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConnectionsService } from '../../proposals/services/connections.service';
import { ConnectionsRepository } from '../../proposals/repositories/connections.repository';
import { ProfilesRepository } from '../../profiles/repositories/profiles.repository';
import {
  getOwnProfileOrThrow,
  assertOwnership,
  hasCapability,
} from '../../profiles/profile-access.util';
import { paginate, type Paginated } from '../../marketplace/pagination';
import { NotificationsService } from '../../notifications/services/notifications.service';
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

// Postgres' unique-violation code, surfaced by Prisma.
const UNIQUE_VIOLATION = 'P2002';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === UNIQUE_VIOLATION
  );
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
    private readonly connectionsRepository: ConnectionsRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Notifies the provider once, only for whichever caller's markPaid call
  // actually flipped the row to PAID (see PaymentsRepository.markPaid's
  // conditional UPDATE) — the callback/webhook race's loser gets 0 rows
  // affected and must not double-notify.
  private async notifyProviderPaid(connectionId: string, amount: string): Promise<void> {
    const connection = await this.connectionsRepository.findById(connectionId);
    if (!connection) return;
    const providerUserId = await this.profilesRepository.findUserIdById(
      connection.providerProfileId,
    );
    if (!providerUserId) return;
    await this.notificationsService.paymentReceived(providerUserId, {
      connectionId,
      jobTitle: connection.job.title,
      amount,
    });
  }

  /**
   * Starts (or resumes) payment for a connection. Client-only — the party
   * who owes the money is the only one who can open a checkout for it.
   *
   * Self-dealing is inherited, not separately checked here (Module 01
   * Slice 2, module1-implementation-contract.md §6.2): every Connection
   * this can be created from already cannot have equal
   * clientProfileId/providerProfileId (the DB CHECK constraint plus
   * ProposalsService.accept's own invariant), so a self-dealing payment
   * cannot be constructed. This comment documents that inherited
   * guarantee for reviewability — it is not asking for new code.
   */
  async createOrder(userId: string, connectionId: string): Promise<CreatedOrder> {
    const connection = await this.getOwnConnectionAsClient(userId, connectionId);

    const existing = await this.paymentsRepository.findByConnectionId(connectionId);
    if (existing?.status === 'PAID') {
      throw new ConflictException('This connection has already been paid for');
    }

    // Negotiated price wins when one exists (PriceNegotiationsService) —
    // proposedPrice stays the original offer regardless, so this is the one
    // place that decides which figure is actually charged.
    const amount = Number(connection.proposal.agreedPrice ?? connection.proposal.proposedPrice);
    const order = await this.razorpay.createOrder(amount, connectionId);

    // Retrying an abandoned/failed checkout updates the one row rather than
    // violating Payment.connectionId's unique constraint with a second row.
    if (existing) {
      await this.paymentsRepository.retry(existing.id, order.id);
    } else {
      try {
        await this.paymentsRepository.create({
          connectionId,
          amount: amount.toFixed(2),
          razorpayOrderId: order.id,
        });
      } catch (error) {
        // The check above handles the ordinary sequential case. This handles
        // the real one: two simultaneous createOrder calls for the same
        // connection both pass that check before either writes, and only
        // the database can decide between them.
        if (isUniqueViolation(error)) {
          throw new ConflictException(
            'A payment order is already being processed for this connection',
          );
        }
        throw error;
      }
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
    const updated = await this.paymentsRepository.markPaid(
      payment.id,
      razorpayPaymentId,
      razorpaySignature,
    );
    if (updated > 0) {
      await this.notifyProviderPaid(connectionId, payment.amount.toString());
    }
    return (await this.paymentsRepository.findByConnectionId(connectionId))!;
  }

  /**
   * Razorpay's async webhook. Signature already verified by the controller
   * (needs the raw body, which only it has); this just applies the event.
   * Already-PAID rows are a silent no-op — a webhook can arrive more than
   * once.
   *
   * Unknown orders get one recovery attempt before being treated as
   * genuinely not ours: retry() (PaymentsRepository) repoints
   * Payment.razorpayOrderId at a fresh order on every retried checkout,
   * so a webhook for the now-superseded old order_id no longer matches
   * anything via findByOrderId — even though the charge itself is real
   * (e.g. a customer completing payment against a still-open earlier
   * checkout tab). The order still exists on Razorpay's side regardless
   * of what our own DB forgot, and every order this app ever creates is
   * given `receipt: connectionId` (see createOrder), so fetching the
   * stale order back tells us which connection it was for.
   */
  async handleWebhookEvent(event: string, orderId: string, paymentId: string): Promise<void> {
    let payment = await this.paymentsRepository.findByOrderId(orderId);
    if (!payment) {
      const connectionId = await this.razorpay.fetchOrderReceipt(orderId);
      payment = connectionId
        ? await this.paymentsRepository.findByConnectionId(connectionId)
        : null;
    }
    if (!payment) {
      this.logger.warn(`Webhook for unknown Razorpay order ${orderId}`);
      return;
    }
    if (payment.status === 'PAID') return;

    if (event === 'payment.captured') {
      const updated = await this.paymentsRepository.markPaid(payment.id, paymentId, '');
      if (updated > 0) {
        await this.notifyProviderPaid(payment.connectionId, payment.amount.toString());
      }
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

    // Capability-aware, not role-exclusive (Module 01 Slice 2) — but still a
    // single-view branch, not a merged client+provider view: no user can
    // hold both capabilities through any real flow yet (capability
    // activation ships in a later slice), so a merged view has nothing to
    // exercise it and would be speculative. Revisit this branch when
    // capability activation lands — see
    // module1-implementation-contract.md §2.4.
    const [data, total] = hasCapability(profile.user, 'CLIENT')
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
