import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SearchServicesDto } from '../dto/search-services.dto';

// skills arrives as a comma-separated query string and ends up matched
// against a uuid column. A non-uuid that gets past this DTO becomes a Prisma
// error — a 500 — rather than the 400 the caller deserves, so the boundary
// check is worth pinning down on its own.
function errorsFor(query: Record<string, unknown>): string[] {
  const dto = plainToInstance(SearchServicesDto, query);
  return validateSync(dto).flatMap((error) => Object.values(error.constraints ?? {}));
}

const SKILL_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const OTHER_SKILL_ID = '9c858901-8a57-4791-81fe-4c455b099bc9';

describe('SearchServicesDto skills', () => {
  it('accepts a comma-separated list of skill ids', () => {
    expect(errorsFor({ skills: `${SKILL_ID},${OTHER_SKILL_ID}` })).toEqual([]);
  });

  it('rejects a non-uuid skill id', () => {
    expect(errorsFor({ skills: 'abc' })).toEqual([
      expect.stringContaining('skills must be a UUID'),
    ]);
  });

  it('rejects a list where only one entry is a non-uuid', () => {
    expect(errorsFor({ skills: `${SKILL_ID},abc` })).toHaveLength(1);
  });

  it('leaves the filter optional', () => {
    expect(errorsFor({})).toEqual([]);
  });
});
