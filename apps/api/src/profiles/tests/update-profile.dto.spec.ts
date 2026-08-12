import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateProfileDto } from '../dto/update-profile.dto';

// The onboarding-wizard fields specifically: every question is skippable in
// the UI, so the DTO must accept them all being absent, and each enum must
// match the wizard's own option set exactly — see update-profile.dto.ts's
// comment on EXPERIENCE_LEVELS/PROVIDER_GOALS/WORK_PREFERENCES/ORG_SIZES.

function errorsFor(overrides: Record<string, unknown>): string[] {
  const dto = plainToInstance(UpdateProfileDto, overrides);
  return validateSync(dto).flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('UpdateProfileDto — onboarding answers', () => {
  it('accepts every question skipped', () => {
    expect(errorsFor({})).toEqual([]);
  });

  describe('experienceLevel', () => {
    it.each(['NEW', 'SOME_EXPERIENCE', 'EXPERT'])('accepts %s', (value) => {
      expect(errorsFor({ experienceLevel: value })).toEqual([]);
    });

    it('rejects a value outside the wizard’s options', () => {
      expect(errorsFor({ experienceLevel: 'VERY_EXPERT' }).join(' ')).toMatch(/experienceLevel/);
    });
  });

  describe('primaryGoal', () => {
    it.each(['MAIN_INCOME', 'SIDE_INCOME', 'EXPERIENCE', 'UNDECIDED'])('accepts %s', (value) => {
      expect(errorsFor({ primaryGoal: value })).toEqual([]);
    });

    it('rejects an unknown goal', () => {
      expect(errorsFor({ primaryGoal: 'FUN' }).join(' ')).toMatch(/primaryGoal/);
    });
  });

  describe('workPreferences', () => {
    it('accepts a subset of the options', () => {
      expect(errorsFor({ workPreferences: ['FIND_OPPORTUNITIES', 'CONTRACT_TO_HIRE'] })).toEqual(
        [],
      );
    });

    it('rejects a value outside the wizard’s options', () => {
      expect(errorsFor({ workPreferences: ['FREELANCE_ONLY'] }).join(' ')).toMatch(
        /workPreferences/,
      );
    });

    it('rejects more entries than the option set has, even if each is individually valid', () => {
      // Duplicates each pass IsIn on their own; the cap is what catches this.
      const errors = errorsFor({
        workPreferences: [
          'FIND_OPPORTUNITIES',
          'FIND_OPPORTUNITIES',
          'FIND_OPPORTUNITIES',
          'FIND_OPPORTUNITIES',
        ],
      });
      expect(errors.join(' ')).toMatch(/workPreferences/);
    });
  });

  describe('orgSize', () => {
    it.each(['Just me', '2 - 9', '10 - 99', '100 - 499', '500 - 4,999', '5,000+'])(
      'accepts %s',
      (value) => {
        expect(errorsFor({ orgSize: value })).toEqual([]);
      },
    );

    it('rejects a free-text size', () => {
      expect(errorsFor({ orgSize: 'A few people' }).join(' ')).toMatch(/orgSize/);
    });
  });

  describe('website', () => {
    it('accepts a well-formed https URL', () => {
      expect(errorsFor({ website: 'https://example.com' })).toEqual([]);
    });

    it('rejects a non-URL string', () => {
      // The UI placeholder ("https://") implies a URL is expected — a
      // plain-string field would silently save garbage here.
      expect(errorsFor({ website: 'asdf' }).join(' ')).toMatch(/website/);
    });

    it('rejects http, since https is what is required', () => {
      expect(errorsFor({ website: 'http://example.com' }).join(' ')).toMatch(/website/);
    });

    it('rejects a URL over the length cap', () => {
      const longUrl = `https://example.com/${'a'.repeat(300)}`;
      expect(errorsFor({ website: longUrl }).join(' ')).toMatch(/website/);
    });
  });

  describe('field-level authorization', () => {
    it.each(['experienceLevel', 'primaryGoal', 'workPreferences', 'orgSize', 'website'])(
      'is part of the client-writable allowlist (whitelist mode keeps it, not strips it)',
      (field) => {
        const dto = plainToInstance(UpdateProfileDto, { [field]: 'placeholder' });
        const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
        // Whichever placeholder value fails its own validator, it must not
        // be the generic "should not exist" error whitelist mode raises for
        // a field the DTO never declared.
        expect(errors.flatMap((e) => Object.values(e.constraints ?? {})).join(' ')).not.toMatch(
          /should not exist/,
        );
      },
    );
  });
});
