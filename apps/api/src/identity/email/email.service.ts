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

  // Sent to the existing account holder when someone submits their address to
  // /auth/register. Registration no longer tells the caller that an address is
  // taken (auth.service.ts), so this is how the one person entitled to know
  // finds out — and it doubles as a warning if they did not do it themselves.
  // It deliberately contains no link and no token: it is a notification, not
  // an action, and the account it concerns is unchanged.
  async sendDuplicateRegistrationEmail(email: string): Promise<void> {
    const signInLink = `${this.frontendOrigin}/auth/signin`;
    await this.send(
      email,
      'Someone tried to sign up with your Marché email',
      `<p>We received a sign-up request using this email address, but you already have a Marché account, so no new account was created and nothing has changed.</p><p>If this was you, just <a href="${signInLink}">sign in</a> instead — or use the "Forgot password" link if you cannot remember your password.</p><p>If it wasn't you, you can safely ignore this email.</p>`,
      `[dev] Duplicate registration attempt for ${email}`,
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
