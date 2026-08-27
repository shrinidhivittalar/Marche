import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';

export interface VerifiedGoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
}

// The one place a Google ID token is trusted. Identity is derived
// exclusively from the verified payload — signature, issuer and audience
// all checked by verifyIdToken itself — never from any field a client
// sends alongside the token (module1-implementation-contract.md §7.2,
// and the explicit instruction not to trust raw Google profile data
// posted from the frontend).
//
// Lazily configured, not boot-required: unlike JWT_ACCESS_SECRET (every
// request needs it) or the Razorpay keys (payments is core), Google
// sign-in is optional — an environment without GOOGLE_CLIENT_ID set keeps
// working for every other auth flow, and only a request that actually
// reaches this verifier fails, at call time, not at app startup.
@Injectable()
export class GoogleAuthVerifier {
  private readonly client: OAuth2Client | null;
  private readonly clientId: string | undefined;

  constructor() {
    this.clientId = process.env.GOOGLE_CLIENT_ID;
    this.client = this.clientId ? new OAuth2Client(this.clientId) : null;
  }

  async verify(idToken: string): Promise<VerifiedGoogleIdentity> {
    if (!this.client || !this.clientId) {
      throw new ServiceUnavailableException('Google sign-in is not configured');
    }

    let payload;
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience: this.clientId });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google credential');
    }

    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Invalid Google credential');
    }

    return {
      sub: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
    };
  }
}
