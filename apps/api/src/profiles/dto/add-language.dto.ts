import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';

export class AddLanguageDto {
  @ApiProperty()
  @IsString()
  @MaxLength(60)
  language!: string;

  @ApiProperty({ enum: ['BASIC', 'CONVERSATIONAL', 'FLUENT', 'NATIVE'] })
  @IsIn(['BASIC', 'CONVERSATIONAL', 'FLUENT', 'NATIVE'])
  proficiency!: 'BASIC' | 'CONVERSATIONAL' | 'FLUENT' | 'NATIVE';
}
