import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

// Falls back to logging the link when RESEND_API_KEY isn't set, so local
// dev never needs a real Resend account. Set RESEND_API_KEY + EMAIL_FROM
// to send for real (see apps/api/.env.example).
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;
  private readonly frontendOrigin: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.from = process.env.EMAIL_FROM ?? 'Marché <onboarding@resend.dev>';
    this.frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
  }

  async sendVerificationEmail(email: string, rawToken: string): Promise<void> {
    const link = `${this.frontendOrigin}/auth/verify-email?token=${rawToken}`;
    await this.send(
      email,
      'Verify your Marché account',
      `<p>Welcome to Marché. Click the link below to verify your email address:</p><p><a href="${link}">${link}</a></p><p>This link expires in 24 hours.</p>`,
      `[dev] Verification link for ${email}: ${link}`,
    );
  }

  async sendPasswordResetEmail(email: string, rawToken: string): Promise<void> {
    const link = `${this.frontendOrigin}/auth/reset-password?token=${rawToken}`;
    await this.send(
      email,
      'Reset your Marché password',
      `<p>We received a request to reset your Marché password. Click the link below to choose a new one:</p><p><a href="${link}">${link}</a></p><p>If you didn't request this, you can safely ignore this email. This link expires in 1 hour.</p>`,
      `[dev] Password reset link for ${email}: ${link}`,
    );
  }

  private async send(
    to: string,
    subject: string,
    html: string,
    devLogMessage: string,
  ): Promise<void> {
    if (!this.resend) {
      this.logger.log(devLogMessage);
      return;
    }

    const { data, error } = await this.resend.emails.send({ from: this.from, to, subject, html });
    if (error) {
      // Never let a downed email provider block registration/reset flows —
      // log it and let the caller carry on; the token still exists in the DB.
      this.logger.error(`Failed to send email to ${to}: ${error.message}`);
      return;
    }
    this.logger.log(`Sent "${subject}" to ${to} (Resend id: ${data?.id})`);
  }
}
