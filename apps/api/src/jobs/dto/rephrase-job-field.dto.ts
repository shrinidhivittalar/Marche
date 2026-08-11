import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import type { RephraseField } from '../../ai/ai.service';

export class RephraseJobFieldDto {
  @ApiProperty({ enum: ['title', 'description'] })
  @IsIn(['title', 'description'])
  field!: RephraseField;

  // Capped at the description limit (job.dto.ts) since this DTO serves
  // both fields; the AI service prompt is what actually keeps a rephrased
  // title short.
  @ApiProperty({ maxLength: 5000 })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  text!: string;
}
