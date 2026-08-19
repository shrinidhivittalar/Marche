import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Payment } from '@marche/db';

@Injectable()
export class PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByConnectionId(connectionId: string): Promise<Payment | null> {
    return this.prisma.client.payment.findUnique({ where: { connectionId } });
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
