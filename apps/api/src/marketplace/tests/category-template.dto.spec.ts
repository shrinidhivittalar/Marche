import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateCategoryTemplateDto } from '../dto/category-template.dto';

const VALID_FIELD = {
  key: 'area',
  label: 'Approximate area',
  type: 'NUMBER',
};

function errorsFor(body: Record<string, unknown>): string[] {
  const dto = plainToInstance(CreateCategoryTemplateDto, body);
  return validateSync(dto).flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('CreateCategoryTemplateDto — allowedModes / locationRequired', () => {
  it('accepts a valid, unique set of allowedModes', () => {
    expect(errorsFor({ fields: [VALID_FIELD], allowedModes: ['ONSITE', 'REMOTE'] })).toEqual([]);
  });

  it('rejects a value that is not a real ServiceMode', () => {
    expect(errorsFor({ fields: [VALID_FIELD], allowedModes: ['FLYING'] })).toEqual([
      expect.stringContaining('allowedModes'),
    ]);
  });

  it('rejects a duplicate mode in the same list', () => {
    expect(errorsFor({ fields: [VALID_FIELD], allowedModes: ['ONSITE', 'ONSITE'] })).toEqual([
      expect.stringContaining('allowedModes'),
    ]);
  });

  it('allows allowedModes to be omitted entirely', () => {
    expect(errorsFor({ fields: [VALID_FIELD] })).toEqual([]);
  });

  it('allows an empty allowedModes array', () => {
    expect(errorsFor({ fields: [VALID_FIELD], allowedModes: [] })).toEqual([]);
  });

  it('accepts a boolean locationRequired', () => {
    expect(errorsFor({ fields: [VALID_FIELD], locationRequired: true })).toEqual([]);
  });

  it('rejects a non-boolean locationRequired', () => {
    expect(errorsFor({ fields: [VALID_FIELD], locationRequired: 'yes' })).toEqual([
      expect.stringContaining('locationRequired'),
    ]);
  });

  it('allows locationRequired to be omitted, defaulting downstream to false', () => {
    expect(errorsFor({ fields: [VALID_FIELD] })).toEqual([]);
  });
});
