import { Injectable, NotFoundException } from '@nestjs/common';
import { UsersRepository } from '../repositories/users.repository';
import { assertEmailVerified } from '../../profiles/profile-access.util';
import type { Capability } from '@marche/db';

// Module 01 Slice 3 — post-registration capability activation
// (module1-implementation-contract.md §2.3). Grant-only: a user who
// registered as one of CLIENT/PROVIDER can later hold the other too,
// without creating a second User or Profile — capabilities are additive
// rows on the one identity they already have.
@Injectable()
export class CapabilitiesService {
  constructor(private readonly usersRepository: UsersRepository) {}

  // Idempotent by construction: UsersRepository.grantCapability returns the
  // existing row on a retried/concurrent activation instead of erroring, so
  // this is always a success response whether the capability was just
  // granted or already held (§2.3, §10).
  async activate(userId: string, capability: Capability): Promise<void> {
    const user = await this.usersRepository.findById(userId);
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }
    // Verified email required per §2.3 — account-active/status is already
    // enforced upstream by JwtAuthGuard/JwtStrategy before this is reached.
    // Module 01 Slice 5: uses the same shared assertEmailVerified as
    // JobsService.publish/ProposalsService.submit/DirectContractsService.create
    // — one verification check, not four copies of the same null check.
    assertEmailVerified(user);
    await this.usersRepository.grantCapability(userId, capability);
  }
}
