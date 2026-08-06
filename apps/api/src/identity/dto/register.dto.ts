import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';

export type RegisterableRole = 'CLIENT' | 'PROVIDER';

export class RegisterDto {
  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, example: 'a-strong-password' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password!: string;

  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ enum: ['CLIENT', 'PROVIDER'] })
  @IsIn(['CLIENT', 'PROVIDER'])
  role!: RegisterableRole;
}
