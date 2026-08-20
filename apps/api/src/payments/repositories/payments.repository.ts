import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Payment, Prisma } from '@marche/db';

// The shape "my payment history" needs: the job it settled, which category
// that job was in (for Budgets, which groups by category), and who the
// other party was. Declared once so listForClient and listForProvider agree
// on it rather than drifting into two near-identical selects.
const PAYMENT_WITH_CONNECTION = {
  id: true,
  amount: true,
  currency: true,
  status: true,
  paidAt: true,
  createdAt: true,
  connection: {
    select: {
      id: true,
      job: {
        select: {
          id: true,
          title: true,
          categoryId: true,
          category: { select: { id: true, name: true } },
        },
      },
      clientProfile: { select: { id: true, displayName: true } },
      providerProfile: { select: { id: true, displayName: true } },
    },
  },
} satisfies Prisma.PaymentSelect;

export type PaymentWithConnection = Prisma.PaymentGetPayload<{
  select: typeof PAYMENT_WITH_CONNECTION;
}>;

@Injectable()
export class PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByConnectionId(connectionId: string): Promise<Payment | null> {
    return this.prisma.client.payment.findUnique({ where: { connectionId } });
  }

  // Every payment the client has made or started making — Transactions,
  // Weekly Summary and Budgets are all views over this same list, grouped
  // differently. CREATED rows are included deliberately: a pending payment
  // is still real state a client would want to see, not just PAID ones.
  listForClient(
    clientProfileId: string,
    skip: number,
    take: number,
  ): Promise<PaymentWithConnection[]> {
    return this.prisma.client.payment.findMany({
      where: { connection: { clientProfileId } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip,
      take,
      select: PAYMENT_WITH_CONNECTION,
    });
  }

  countForClient(clientProfileId: string): Promise<number> {
    return this.prisma.client.payment.count({ where: { connection: { clientProfileId } } });
  }

  // The provider-side mirror — every payment made against a connection they
  // were hired on.
  listForProvider(
    providerProfileId: string,
    skip: number,
    take: number,
  ): Promise<PaymentWithConnection[]> {
    return this.prisma.client.payment.findMany({
      where: { connection: { providerProfileId } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip,
      take,
      select: PAYMENT_WITH_CONNECTION,
    });
  }

  countForProvider(providerProfileId: string): Promise<number> {
    return this.prisma.client.payment.count({ where: { connection: { providerProfileId } } });
  }

  findByOrderId(razorpayOrderId: string): Promise<Payment | null> {
    return this.prisma.client.payment.findUnique({ where: { razorpayOrderId } });
  }

  create(data: {
    connectionId: string;
    amount: string;
    razorpayOrderId: string;
  }): Promise<Payment> {
    return this.prisma.client.payment.create({ data });
  }

  // A retried checkout on a row that never got paid (CREATED, still waiting;
  // or FAILED, the previous attempt didn't go through): points the one row
  // at a new Razorpay order rather than creating a second row, which the
  // connectionId unique constraint wouldn't allow anyway.
  retry(id: string, razorpayOrderId: string): Promise<Payment> {
    return this.prisma.client.payment.update({
      where: { id },
      data: {
        status: 'CREATED',
        razorpayOrderId,
        razorpayPaymentId: null,
        razorpaySignature: null,
        paidAt: null,
      },
    });
  }

  // Conditional UPDATE, same reasoning as ProposalsService.accept's
  // claimFilled / transitionFromSubmitted: the status check travels inside
  // the UPDATE, so the browser-side verify callback and the webhook racing
  // each other are serialised by Postgres on the row — whichever gets there
  // second matches zero rows instead of overwriting the first's write. That
  // matters here specifically because the webhook calls this with an empty
  // signature (it has none to offer); without the guard it could silently
  // blank out a real one the callback had already recorded.
  //
  // Returns the number of rows moved: 1 for whichever call won the race, 0
  // for the other (a no-op, not an error — the row is already PAID either
  // way, which is what both callers actually want).
  async markPaid(
    id: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
  ): Promise<number> {
    const result = await this.prisma.client.payment.updateMany({
      where: { id, status: { not: 'PAID' } },
      data: {
        status: 'PAID',
        razorpayPaymentId,
        razorpaySignature,
        paidAt: new Date(),
      },
    });
    return result.count;
  }

  markFailed(id: string): Promise<Payment> {
    return this.prisma.client.payment.update({
      where: { id },
      data: { status: 'FAILED' },
    });
  }
}
