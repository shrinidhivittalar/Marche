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

  markPaid(id: string, razorpayPaymentId: string, razorpaySignature: string): Promise<Payment> {
    return this.prisma.client.payment.update({
      where: { id },
      data: {
        status: 'PAID',
        razorpayPaymentId,
        razorpaySignature,
        paidAt: new Date(),
      },
    });
  }

  markFailed(id: string): Promise<Payment> {
    return this.prisma.client.payment.update({
      where: { id },
      data: { status: 'FAILED' },
    });
  }
}
