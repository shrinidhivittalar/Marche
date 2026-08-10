import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';

const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/;
const MAX_SOCIAL_LINKS = 10;
const MAX_SOCIAL_LINK_KEY_LENGTH = 30;
const MAX_SOCIAL_LINK_URL_LENGTH = 300;

// class-validator has no built-in decorator for "bounded map of URLs", and
// this is the only place that shape appears — a one-off inline check is
// simpler than a generic map validator nobody else needs.
function IsSocialLinks(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSocialLinks',
      target: object.constructor,
      propertyName,
      options: {
        message:
          `socialLinks must have at most ${MAX_SOCIAL_LINKS} entries, ` +
          `each with a short key and a valid URL value`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown) {
          if (value === undefined) return true;
          if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

          const entries = Object.entries(value as Record<string, unknown>);
          if (entries.length > MAX_SOCIAL_LINKS) return false;

          return entries.every(([key, url]) => {
            if (
              typeof key !== 'string' ||
              key.length === 0 ||
              key.length > MAX_SOCIAL_LINK_KEY_LENGTH
            ) {
              return false;
            }
            if (typeof url !== 'string' || url.length > MAX_SOCIAL_LINK_URL_LENGTH) {
              return false;
            }
            return /^https?:\/\/.+/i.test(url);
          });
        },
      },
    });
  };
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: 'Lowercase, alphanumeric + hyphens, 3-30 chars' })
  @IsOptional()
  @IsString()
  @Matches(USERNAME_PATTERN, {
    message: 'username must be lowercase alphanumeric with optional hyphens',
  })
  username?: string;

  // MinLength(1) as well as MaxLength: module2.md lists Display Name as
  // required, but without a minimum an update could blank it out, leaving
  // an unnamed profile in search results and on the public page.
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  headline?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string;

  // An uploaded file, not a pasted link. Null clears the picture, which is
  // a real state — a profile without one still works.
  @ApiPropertyOptional({ description: 'Id of an uploaded image, or null to remove' })
  @IsOptional()
  @IsUUID()
  avatarMediaId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({
    description: 'Arbitrary key-value social links, e.g. { "linkedin": "https://..." }',
  })
  @IsOptional()
  @IsObject()
  @IsSocialLinks()
  socialLinks?: Record<string, string>;

  @ApiPropertyOptional({ enum: ['PUBLIC', 'PRIVATE'] })
  @IsOptional()
  @IsIn(['PUBLIC', 'PRIVATE'])
  visibility?: 'PUBLIC' | 'PRIVATE';
}
