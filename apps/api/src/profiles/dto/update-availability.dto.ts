import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional } from 'class-validator';

export class UpdateAvailabilityDto {
  @ApiPropertyOptional({ enum: ['AVAILABLE', 'LIMITED', 'UNAVAILABLE'] })
  @IsOptional()
  @IsIn(['AVAILABLE', 'LIMITED', 'UNAVAILABLE'])
  availabilityStatus?: 'AVAILABLE' | 'LIMITED' | 'UNAVAILABLE';

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  nextAvailableDate?: string;
}
