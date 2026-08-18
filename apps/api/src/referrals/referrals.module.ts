import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module';
import { EmailModule } from '../email/email.module';
import { ReferralsController } from './controllers/referrals.controller';
import { ReferralsRepository } from './repositories/referrals.repository';
import { ReferralsService } from './services/referrals.service';

// Exported so IdentityModule can inject ReferralsService and call
// handleUserJoined at registration time — the same "downstream module
// exports the write AuthService needs" shape ProfilesModule already has.
@Module({
  imports: [ProfilesModule, EmailModule],
  controllers: [ReferralsController],
  providers: [ReferralsRepository, ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
