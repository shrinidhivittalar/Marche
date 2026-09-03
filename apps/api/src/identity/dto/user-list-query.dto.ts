import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../profiles/dto/pagination-query.dto';
import type { PlatformRole, UserStatus } from '@marche/db';

const USER_STATUSES: UserStatus[] = ['ACTIVE', 'SUSPENDED', 'DISABLED', 'DELETED'];
const PLATFORM_ROLES: PlatformRole[] = ['USER', 'ADMIN', 'SUPER_ADMIN'];

export class UserListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: USER_STATUSES })
  @IsOptional()
  @IsIn(USER_STATUSES)
  status?: UserStatus;

  @ApiPropertyOptional({ enum: PLATFORM_ROLES })
  @IsOptional()
  @IsIn(PLATFORM_ROLES)
  platformRole?: PlatformRole;

  // Case-insensitive substring match against email or name — the only two
  // fields an admin realistically has on hand when looking for one person.
  @ApiPropertyOptional({ description: 'Case-insensitive match against email or name' })
  @IsOptional()
  @IsString()
  search?: string;
}
