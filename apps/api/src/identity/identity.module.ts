import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './controllers/auth.controller';
import { UsersController } from './controllers/users.controller';
import { AuthService } from './services/auth.service';
import { UsersService } from './services/users.service';
import { UsersRepository } from './repositories/users.repository';
import { SessionsRepository } from './repositories/sessions.repository';
import { VerificationTokensRepository } from './repositories/verification-tokens.repository';
import { PasswordResetsRepository } from './repositories/password-resets.repository';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ProfilesModule } from '../profiles/profiles.module';
import { EmailModule } from '../email/email.module';
import { ReferralsModule } from '../referrals/referrals.module';

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
  controllers: [AuthController, UsersController],
  providers: [
    AuthService,
    UsersService,
    UsersRepository,
    SessionsRepository,
    VerificationTokensRepository,
    PasswordResetsRepository,
    JwtStrategy,
  ],
})
export class IdentityModule {}
