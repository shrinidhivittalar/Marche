import { ApiHideProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

// Exactly one of the two. Both would be ambiguous — which wins if they name
// different skills? — and neither is a request that says nothing.
@ValidatorConstraint({ name: 'skillIdOrName' })
class SkillIdOrName implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const { skillId, name } = args.object as AddSkillDto;
    return Boolean(skillId) !== Boolean(name);
  }

  defaultMessage(): string {
    return 'Send either skillId (to pick a listed skill) or name (to add your own), not both';
  }
}

export class AddSkillDto {
  @ApiPropertyOptional({ description: 'Id of a skill from the platform list' })
  @IsOptional()
  @IsUUID()
  skillId?: string;

  /**
   * A skill the provider typed themselves.
   *
   * The platform list was seeded and closed to user input, on the reasoning
   * that free text fragments ("Photography" / "photography" / "photo") and
   * quietly breaks the filters that depend on it. That reasoning holds for
   * *matching*, not for *entry* — a provider whose craft is not on the list
   * had no way to say what they do.
   *
   * So a typed skill is matched case-insensitively against the list first
   * and only creates a row when nothing matches. Fragmentation is prevented
   * where it would actually happen, rather than by refusing the input.
   */
  @ApiPropertyOptional({ description: 'A skill of your own, if it is not on the list' })
  @IsOptional()
  @Transform(({ value }) =>
    // Collapsed, not just trimmed: "event   planning" and "event planning"
    // are the same skill, and only one of them should ever be stored.
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name?: string;

  /**
   * Carrier for the pair rule above, and nothing else.
   *
   * The rule cannot hang off skillId or name: both are optional, and
   * `@IsOptional()` makes class-validator skip *every* validator on a
   * property that was not sent. Attached to either one, a body of `{}` —
   * the case the rule exists to catch — validated clean and reached the
   * service with neither field set. A property that is always defined is
   * always visited, so the rule now fires for all four combinations.
   */
  @ApiHideProperty()
  @Validate(SkillIdOrName)
  readonly skillIdOrName: boolean = true;
}
