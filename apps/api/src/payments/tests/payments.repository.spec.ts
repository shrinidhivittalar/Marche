import { PaymentsRepository } from '../repositories/payments.repository';
import type { PrismaService } from '../../prisma/prisma.service';

// Mirrors proposals.repository.spec.ts's approach: assert the shape of the
// query the repository builds, since that's where the worst bugs in a
// concurrent-write method live — a status test that runs before the write
// instead of inside it.
function build() {
  const payment = {
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const prisma = { client: { payment } } as unknown as PrismaService;

  return { repository: new PaymentsRepository(prisma), payment };
}

describe('PaymentsRepository.markPaid', () => {
  // The mechanism the "Could be better" audit fix rests on. A findUnique
  // followed by an update would let the browser-side verify callback and the
  // Razorpay webhook race each other: both read status !== 'PAID', both
  // write, and whichever writes second — the webhook, with no real
  // signature — silently overwrites the first's audit trail.
  it('carries the status test inside the update, not before it', async () => {
    const { repository, payment } = build();

    await repository.markPaid('payment_1', 'pay_1', 'sig_1');

    const [call] = payment.updateMany.mock.calls;
    expect(call[0].where).toEqual({ id: 'payment_1', status: { not: 'PAID' } });
  });

  it('reports zero rows moved so the caller loses the race cleanly', async () => {
    const { repository, payment } = build();
    // What Postgres reports to whichever of verifyCallback / handleWebhookEvent
    // loses the race: the row no longer matches status != 'PAID', because the
    // winner already wrote it.
    payment.updateMany.mockResolvedValue({ count: 0 });

    await expect(repository.markPaid('payment_1', 'pay_1', 'sig_1')).resolves.toBe(0);
  });

  it('writes the given payment id, signature and paidAt', async () => {
    const { repository, payment } = build();

    await repository.markPaid('payment_1', 'pay_1', 'sig_1');

    const { data } = payment.updateMany.mock.calls[0][0];
    expect(data).toMatchObject({
      status: 'PAID',
      razorpayPaymentId: 'pay_1',
      razorpaySignature: 'sig_1',
    });
    expect(data.paidAt).toBeInstanceOf(Date);
  });
});
