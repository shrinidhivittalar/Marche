import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Capability, PlatformRole, UserRole } from '@marche/db';
import { UsersRepository } from '../repositories/users.repository';

export interface JwtPayload {
  sub: string;
  role: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  // Legacy scalar role. Still populated and still read by every
  // authorization check that hasn't migrated to platformRole/capabilities
  // yet — see module1-migration-plan.md §2.2. Not removed in this slice;
  // User.role itself is untouched in the database. Typed as UserRole (not
  // string) so this value satisfies AuthorizableUser in
  // profile-access.util.ts without a cast.
  role: UserRole;
  // Module 01 Slice 2. Loaded fresh from the database on every request,
  // exactly like `status` already was — never trusted from the JWT payload
  // itself (module1-implementation-contract.md §2.5, §4).
  platformRole: PlatformRole;
  capabilities: Capability[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly usersRepository: UsersRepository) {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET must be set');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.usersRepository.findById(payload.sub);
    if (!user || user.status !== 'ACTIVE' || user.deletedAt) {
      throw new UnauthorizedException('Account is not active');
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      platformRole: user.platformRole,
      capabilities: user.capabilities.map((c) => c.capability),
    };
  }
}
