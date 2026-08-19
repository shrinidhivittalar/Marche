import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module';
import { ProposalsModule } from '../proposals/proposals.module';
import { PaymentsController } from './controllers/payments.controller';
import { PaymentsWebhookController } from './controllers/payments-webhook.controller';
import { PaymentsRepository } from './repositories/payments.repository';
import { PaymentsService } from './services/payments.service';
import { RazorpayClient } from './razorpay/razorpay.client';

// Depends on ProposalsModule for ConnectionsService (party-authorization —
// same reuse Disputes and Reviews already do) and ProfilesModule to resolve
// the caller's own profile id for the client-only checks.
@Module({
  imports: [ProfilesModule, ProposalsModule],
  controllers: [PaymentsController, PaymentsWebhookController],
  providers: [PaymentsRepository, PaymentsService, RazorpayClient],
})
export class PaymentsModule {}
