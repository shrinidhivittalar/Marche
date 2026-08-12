import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
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

// Matches ProviderOnboardingPage's Q1/Q2/Q3 and ClientOnboardingPage's org
// size options exactly — a controlled set, not free text from the client.
const EXPERIENCE_LEVELS = ['NEW', 'SOME_EXPERIENCE', 'EXPERT'] as const;
const PROVIDER_GOALS = ['MAIN_INCOME', 'SIDE_INCOME', 'EXPERIENCE', 'UNDECIDED'] as const;
const WORK_PREFERENCES = ['FIND_OPPORTUNITIES', 'PACKAGE_SERVICES', 'CONTRACT_TO_HIRE'] as const;
const ORG_SIZES = ['Just me', '2 - 9', '10 - 99', '100 - 499', '500 - 4,999', '5,000+'] as const;

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

  // Onboarding-wizard answers (ClientOnboardingPage / ProviderOnboardingPage).
  // Saved so the wizard's questions aren't discarded, but nothing reads them
  // back yet.
  @ApiPropertyOptional({ enum: EXPERIENCE_LEVELS })
  @IsOptional()
  @IsIn(EXPERIENCE_LEVELS)
  experienceLevel?: (typeof EXPERIENCE_LEVELS)[number];

  @ApiPropertyOptional({ enum: PROVIDER_GOALS })
  @IsOptional()
  @IsIn(PROVIDER_GOALS)
  primaryGoal?: (typeof PROVIDER_GOALS)[number];

  @ApiPropertyOptional({ enum: WORK_PREFERENCES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(WORK_PREFERENCES.length)
  @IsIn(WORK_PREFERENCES, { each: true })
  workPreferences?: (typeof WORK_PREFERENCES)[number][];

  @ApiPropertyOptional({ enum: ORG_SIZES })
  @IsOptional()
  @IsIn(ORG_SIZES)
  orgSize?: (typeof ORG_SIZES)[number];

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @IsUrl({ protocols: ['https'], require_protocol: true })
  website?: string;
}
