import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { UserStatus } from '@marche/db';

// DISABLED and DELETED are deliberately not exposed here: this endpoint is
// scoped to the minimum-viable moderation action (suspend/restore), not a
// general status editor. DISABLED has no defined admin trigger yet and
// DELETED is account-deletion's own concern, not moderation's.
const MODERATION_STATUSES: UserStatus[] = ['ACTIVE', 'SUSPENDED'];

export class UpdateUserStatusDto {
  @ApiProperty({ enum: MODERATION_STATUSES })
  @IsIn(MODERATION_STATUSES)
  status!: UserStatus;
}
