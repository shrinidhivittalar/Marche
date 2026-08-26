import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

// Every other email here builds its HTML from server-controlled strings and
// ids. The referral invite is the first to interpolate user-authored text
// (a display name, a free-text note) into an email actually read by a third
// party, so it is the first place that text needs escaping before it can go
// anywhere near the markup.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Falls back to logging the link when SMTP_HOST isn't set, so local dev
// never needs a real mail account. Set SMTP_HOST/PORT/USER/PASSWORD +
// EMAIL_FROM to send for real (see apps/api/.env.example).
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;
  private readonly frontendOrigin: string;

  constructor() {
    const host = process.env.SMTP_HOST;
    this.transporter = host
      ? createTransport({
          host,
          port: Number(process.env.SMTP_PORT ?? 587),
          // 465 is implicit TLS; every other port (587, 25) starts
          // unencrypted and upgrades via STARTTLS, which nodemailer does on
          // its own when secure is false.
          secure: Number(process.env.SMTP_PORT ?? 587) === 465,
          auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
            : undefined,
        })
      : null;
    this.from = process.env.EMAIL_FROM ?? 'Marché <no-reply@example.com>';
    // No fallback: FRONTEND_ORIGIN is required and validated at startup (see
    // config/env.validation.ts) — a silent localhost default here would
    // mean emailed verification/reset links point at localhost if that
    // guarantee were ever bypassed.
    this.frontendOrigin = process.env.FRONTEND_ORIGIN as string;
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

  // No token, unlike verification/reset — a referral is matched to its
  // invitee by email address at registration time (ReferralsService), not
  // by a link the recipient clicks through. The link just gets them to the
  // ordinary sign-up form.
  async sendReferralInviteEmail(
    email: string,
    referrerName: string,
    note: string | null,
  ): Promise<void> {
    const link = `${this.frontendOrigin}/auth/signup`;
    // Header value — stripped of newlines so a crafted display name can't
    // inject extra headers into the message.
    const subjectSafeName = referrerName.replace(/[\r\n]/g, ' ');
    const safeName = escapeHtml(referrerName);
    const noteHtml = note ? `<p>Their note to you: "${escapeHtml(note)}"</p>` : '';
    await this.send(
      email,
      `${subjectSafeName} invited you to join Marché`,
      `<p>${safeName} thinks you'd be a great fit for Marché, a marketplace for event ` +
        `services.</p>${noteHtml}<p><a href="${link}">Sign up</a> using this email address to ` +
        `join.</p>`,
      `[dev] Referral invite for ${email} from ${referrerName}: ${link}`,
    );
  }

  private async send(
    to: string,
    subject: string,
    html: string,
    devLogMessage: string,
  ): Promise<void> {
    if (!this.transporter) {
      this.logger.log(devLogMessage);
      return;
    }

    try {
      const info = await this.transporter.sendMail({ from: this.from, to, subject, html });
      this.logger.log(`Sent "${subject}" to ${to} (message id: ${info.messageId})`);
    } catch (error) {
      // Never let a downed SMTP server block registration/reset flows — log
      // it and let the caller carry on; the token still exists in the DB.
      this.logger.error(`Failed to send email to ${to}: ${(error as Error).message}`);
    }
  }
}
