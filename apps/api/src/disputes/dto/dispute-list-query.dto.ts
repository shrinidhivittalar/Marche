import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../profiles/dto/pagination-query.dto';

export type DisputeStatusFilter = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED';
const DISPUTE_STATUSES: DisputeStatusFilter[] = ['OPEN', 'UNDER_REVIEW', 'RESOLVED'];

export class DisputeListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: DISPUTE_STATUSES })
  @IsOptional()
  @IsEnum(DISPUTE_STATUSES)
  status?: DisputeStatusFilter;
}
