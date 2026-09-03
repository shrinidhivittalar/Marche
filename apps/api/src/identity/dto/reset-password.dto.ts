import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_PATTERN,
  PASSWORD_PATTERN_MESSAGE,
} from './password.constants';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Raw token from the password reset email link' })
  @IsString()
  token!: string;

  @ApiProperty({ minLength: 10, maxLength: PASSWORD_MAX_LENGTH })
  @IsString()
  @MinLength(10, { message: 'Password must be at least 10 characters long' })
  @MaxLength(PASSWORD_MAX_LENGTH, {
    message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters long`,
  })
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_PATTERN_MESSAGE })
  newPassword!: string;
}
