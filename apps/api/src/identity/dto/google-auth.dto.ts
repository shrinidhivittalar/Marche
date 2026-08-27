import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class GoogleAuthDto {
  @ApiProperty({ description: "Google's ID token (JWT) from the frontend's Google sign-in flow" })
  @IsString()
  @MinLength(1)
  idToken!: string;
}
