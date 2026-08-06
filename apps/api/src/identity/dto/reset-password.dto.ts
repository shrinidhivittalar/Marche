import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';
import { PASSWORD_PATTERN, PASSWORD_PATTERN_MESSAGE } from './password.constants';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Raw token from the password reset email link' })
  @IsString()
  token!: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @MinLength(10, { message: 'Password must be at least 10 characters long' })
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_PATTERN_MESSAGE })
  newPassword!: string;
}
