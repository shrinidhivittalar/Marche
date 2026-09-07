import { describe, it, expect } from 'vitest';
import { defaultCategoryData, validateCategoryData } from './CategoryRequirementsFields';
import type { PublicCategoryTemplateField } from '../../lib/category-templates-api';

function field(overrides: Partial<PublicCategoryTemplateField>): PublicCategoryTemplateField {
  return {
    key: 'field1',
    label: 'Field 1',
    type: 'TEXT',
    required: false,
    order: 0,
    options: null,
    validation: null,
    ...overrides,
  };
}

describe('defaultCategoryData', () => {
  it('defaults BOOLEAN fields to false', () => {
    const result = defaultCategoryData([field({ key: 'agree', type: 'BOOLEAN' })]);
    expect(result).toEqual({ agree: false });
  });

  it('defaults MULTI_SELECT fields to an empty array', () => {
    const result = defaultCategoryData([field({ key: 'tags', type: 'MULTI_SELECT' })]);
    expect(result).toEqual({ tags: [] });
  });

  it('does not seed a default for TEXT, NUMBER, SELECT, or DATE fields', () => {
    const result = defaultCategoryData([
      field({ key: 'name', type: 'TEXT' }),
      field({ key: 'count', type: 'NUMBER' }),
      field({ key: 'pick', type: 'SELECT' }),
      field({ key: 'when', type: 'DATE' }),
    ]);
    expect(result).toEqual({});
  });
});

describe('validateCategoryData — TEXT', () => {
  it('flags a required, empty field', () => {
    const f = field({ key: 'name', type: 'TEXT', required: true });
    expect(validateCategoryData([f], { name: '' })).toEqual({ name: 'Field 1 is required.' });
  });

  it('treats a whitespace-only string as unanswered when required', () => {
    const f = field({ key: 'name', type: 'TEXT', required: true });
    expect(validateCategoryData([f], { name: '   ' })).toEqual({ name: 'Field 1 is required.' });
  });

  it('passes an optional empty field', () => {
    const f = field({ key: 'name', type: 'TEXT', required: false });
    expect(validateCategoryData([f], { name: '' })).toEqual({ name: null });
  });

  it('enforces minLength', () => {
    const f = field({ key: 'name', type: 'TEXT', validation: { minLength: 5 } });
    expect(validateCategoryData([f], { name: 'abc' })).toEqual({
      name: 'Field 1 must be at least 5 characters.',
    });
  });

  it('enforces maxLength', () => {
    const f = field({ key: 'name', type: 'TEXT', validation: { maxLength: 3 } });
    expect(validateCategoryData([f], { name: 'abcdef' })).toEqual({
      name: 'Field 1 must be at most 3 characters.',
    });
  });

  it('passes a value within min/max length', () => {
    const f = field({ key: 'name', type: 'TEXT', validation: { minLength: 2, maxLength: 10 } });
    expect(validateCategoryData([f], { name: 'hello' })).toEqual({ name: null });
  });
});

describe('validateCategoryData — NUMBER', () => {
  it('flags a required, empty value', () => {
    const f = field({ key: 'count', type: 'NUMBER', required: true });
    expect(validateCategoryData([f], { count: undefined })).toEqual({
      count: 'Field 1 is required.',
    });
  });

  it('passes an optional empty value', () => {
    const f = field({ key: 'count', type: 'NUMBER', required: false });
    expect(validateCategoryData([f], { count: '' })).toEqual({ count: null });
  });

  it('rejects a non-numeric value', () => {
    const f = field({ key: 'count', type: 'NUMBER' });
    expect(validateCategoryData([f], { count: 'abc' })).toEqual({
      count: 'Field 1 must be a number.',
    });
  });

  it('enforces a minimum', () => {
    const f = field({ key: 'count', type: 'NUMBER', validation: { min: 10 } });
    expect(validateCategoryData([f], { count: 5 })).toEqual({
      count: 'Field 1 must be at least 10.',
    });
  });

  it('enforces a maximum', () => {
    const f = field({ key: 'count', type: 'NUMBER', validation: { max: 10 } });
    expect(validateCategoryData([f], { count: 15 })).toEqual({
      count: 'Field 1 must be at most 10.',
    });
  });

  it('accepts a numeric string within range', () => {
    const f = field({ key: 'count', type: 'NUMBER', validation: { min: 1, max: 10 } });
    expect(validateCategoryData([f], { count: '5' })).toEqual({ count: null });
  });
});

describe('validateCategoryData — BOOLEAN', () => {
  it('never errors, regardless of required or value', () => {
    const f = field({ key: 'agree', type: 'BOOLEAN', required: true });
    expect(validateCategoryData([f], { agree: false })).toEqual({ agree: null });
    expect(validateCategoryData([f], { agree: undefined })).toEqual({ agree: null });
  });
});

describe('validateCategoryData — SELECT', () => {
  const f = field({ key: 'pick', type: 'SELECT', required: true, options: ['a', 'b'] });

  it('flags a required, unselected field', () => {
    expect(validateCategoryData([f], { pick: '' })).toEqual({ pick: 'Field 1 is required.' });
  });

  it('rejects a value outside the option list', () => {
    expect(validateCategoryData([f], { pick: 'z' })).toEqual({
      pick: 'Field 1 has an invalid selection.',
    });
  });

  it('accepts a value in the option list', () => {
    expect(validateCategoryData([f], { pick: 'a' })).toEqual({ pick: null });
  });
});

describe('validateCategoryData — MULTI_SELECT', () => {
  const f = field({
    key: 'tags',
    type: 'MULTI_SELECT',
    required: true,
    options: ['a', 'b', 'c'],
  });

  it('flags a required, empty selection', () => {
    expect(validateCategoryData([f], { tags: [] })).toEqual({ tags: 'Field 1 is required.' });
  });

  it('rejects a selection containing an option outside the list', () => {
    expect(validateCategoryData([f], { tags: ['a', 'z'] })).toEqual({
      tags: 'Field 1 has an invalid selection.',
    });
  });

  it('accepts a selection fully within the option list', () => {
    expect(validateCategoryData([f], { tags: ['a', 'b'] })).toEqual({ tags: null });
  });

  it('treats a non-array value as an empty selection', () => {
    expect(validateCategoryData([f], { tags: 'not-an-array' })).toEqual({
      tags: 'Field 1 is required.',
    });
  });
});

describe('validateCategoryData — DATE', () => {
  it('flags a required, empty value', () => {
    const f = field({ key: 'when', type: 'DATE', required: true });
    expect(validateCategoryData([f], { when: '' })).toEqual({ when: 'Field 1 is required.' });
  });

  it('rejects an unparseable date string', () => {
    const f = field({ key: 'when', type: 'DATE' });
    expect(validateCategoryData([f], { when: 'not-a-date' })).toEqual({
      when: 'Field 1 must be a valid date.',
    });
  });

  it('accepts a valid ISO date string', () => {
    const f = field({ key: 'when', type: 'DATE' });
    expect(validateCategoryData([f], { when: '2026-01-01' })).toEqual({ when: null });
  });

  it('passes an optional empty value', () => {
    const f = field({ key: 'when', type: 'DATE', required: false });
    expect(validateCategoryData([f], { when: undefined })).toEqual({ when: null });
  });
});

describe('validateCategoryData — multiple fields', () => {
  it('returns one entry per field, keyed by field key', () => {
    const fields = [
      field({ key: 'a', type: 'TEXT', required: true }),
      field({ key: 'b', type: 'NUMBER', required: true }),
    ];
    expect(validateCategoryData(fields, { a: 'ok', b: 5 })).toEqual({ a: null, b: null });
    expect(validateCategoryData(fields, { a: '', b: undefined })).toEqual({
      a: 'Field 1 is required.',
      b: 'Field 1 is required.',
    });
  });
});
