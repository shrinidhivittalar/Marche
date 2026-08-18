import { Module } from '@nestjs/common';
import { EmailService } from './email.service';

// Its own module, not left inside Identity: Referrals sends real invite
// emails too, and EmailService has no Identity-specific dependency (just
// SMTP env vars) — nothing about it belongs to one module more than another.
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
