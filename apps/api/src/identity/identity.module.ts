import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './controllers/auth.controller';
import { UsersController } from './controllers/users.controller';
import { CapabilitiesController } from './controllers/capabilities.controller';
import { AdminController } from './controllers/admin.controller';
import { AuthService } from './services/auth.service';
import { UsersService } from './services/users.service';
import { CapabilitiesService } from './services/capabilities.service';
import { AdminService } from './services/admin.service';
import { UsersRepository } from './repositories/users.repository';
import { SessionsRepository } from './repositories/sessions.repository';
import { VerificationTokensRepository } from './repositories/verification-tokens.repository';
import { VerificationsRepository } from './repositories/verifications.repository';
import { AuthenticationMethodsRepository } from './repositories/authentication-methods.repository';
import { PasswordResetsRepository } from './repositories/password-resets.repository';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleAuthVerifier } from './google-auth-verifier';
import { ProfilesModule } from '../profiles/profiles.module';
import { EmailModule } from '../email/email.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { EmailThrottlerGuard } from './guards/email-throttler.guard';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET,
    }),
    // AuthService.register creates a Profile for the new user in the same
    // flow — see module2-edge-cases.md's "Profile never created" decision.
    ProfilesModule,
    EmailModule,
    // AuthService.register also tells Referrals a new account joined, so a
    // matching invite can flip to JOINED — see ReferralsService.handleUserJoined.
    ReferralsModule,
  ],
  controllers: [AuthController, UsersController, CapabilitiesController, AdminController],
  providers: [
    AuthService,
    UsersService,
    CapabilitiesService,
    AdminService,
    UsersRepository,
    SessionsRepository,
    VerificationTokensRepository,
    VerificationsRepository,
    AuthenticationMethodsRepository,
    PasswordResetsRepository,
    JwtStrategy,
    EmailThrottlerGuard,
    GoogleAuthVerifier,
  ],
})
export class IdentityModule {}
