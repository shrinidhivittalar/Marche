import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';

export type RegisterableRole = 'CLIENT' | 'PROVIDER';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsIn(['CLIENT', 'PROVIDER'])
  role!: RegisterableRole;
}
