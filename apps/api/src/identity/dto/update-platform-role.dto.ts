import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { PlatformRole } from '@marche/db';

const PLATFORM_ROLES: PlatformRole[] = ['USER', 'ADMIN', 'SUPER_ADMIN'];

export class UpdatePlatformRoleDto {
  @ApiProperty({ enum: PLATFORM_ROLES })
  @IsIn(PLATFORM_ROLES)
  platformRole!: PlatformRole;
}
