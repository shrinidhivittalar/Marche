import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsString, Matches, MinLength } from 'class-validator';
import { PASSWORD_PATTERN, PASSWORD_PATTERN_MESSAGE } from './password.constants';

export type RegisterableRole = 'CLIENT' | 'PROVIDER';

export class RegisterDto {
  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 10, example: 'Str0ngPassword' })
  @IsString()
  @MinLength(10, { message: 'Password must be at least 10 characters long' })
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_PATTERN_MESSAGE })
  password!: string;

  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ enum: ['CLIENT', 'PROVIDER'] })
  @IsIn(['CLIENT', 'PROVIDER'])
  role!: RegisterableRole;
}
