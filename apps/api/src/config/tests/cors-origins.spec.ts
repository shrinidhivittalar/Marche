import { parseCorsOrigins } from '../cors-origins';

describe('parseCorsOrigins', () => {
  it('returns an empty array when unset', () => {
    expect(parseCorsOrigins(undefined)).toEqual([]);
  });

  it('returns an empty array for an empty string', () => {
    expect(parseCorsOrigins('')).toEqual([]);
  });

  it('parses a single origin', () => {
    expect(parseCorsOrigins('https://marche.app')).toEqual(['https://marche.app']);
  });

  it('splits a comma-separated list', () => {
    expect(parseCorsOrigins('https://marche.app,https://staging.marche.app')).toEqual([
      'https://marche.app',
      'https://staging.marche.app',
    ]);
  });

  it('trims whitespace around each entry', () => {
    expect(parseCorsOrigins(' https://marche.app , https://staging.marche.app ')).toEqual([
      'https://marche.app',
      'https://staging.marche.app',
    ]);
  });

  it('drops empty entries from stray/trailing commas', () => {
    expect(parseCorsOrigins('https://marche.app,,https://staging.marche.app,')).toEqual([
      'https://marche.app',
      'https://staging.marche.app',
    ]);
  });

  it('drops whitespace-only entries', () => {
    expect(parseCorsOrigins('https://marche.app,   ,https://staging.marche.app')).toEqual([
      'https://marche.app',
      'https://staging.marche.app',
    ]);
  });

  it('does not introduce a wildcard for any input', () => {
    const result = parseCorsOrigins('https://marche.app');
    expect(result).not.toContain('*');
  });
});
