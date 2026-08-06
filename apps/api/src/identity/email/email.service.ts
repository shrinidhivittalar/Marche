import { Injectable, Logger } from '@nestjs/common';

// docs/tech_stack1.0.0.md marks Resend as "Planned" — no email provider is
// wired up yet, so this logs the link a real email would contain. Swap the
// body of these two methods for a Resend call once that's set up; nothing
// else in the Identity module needs to change.
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  async sendVerificationEmail(email: string, rawToken: string): Promise<void> {
    this.logger.log(`[dev] Verification link for ${email}: /auth/verify-email?token=${rawToken}`);
  }

  async sendPasswordResetEmail(email: string, rawToken: string): Promise<void> {
    this.logger.log(`[dev] Password reset link for ${email}: /auth/reset-password?token=${rawToken}`);
  }
}
