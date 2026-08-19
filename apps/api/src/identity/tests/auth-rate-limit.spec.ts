import { DEFAULT_AUTH_RATE_LIMIT, resolveAuthRateLimit } from '../auth-rate-limit';

// AUTH_RATE_LIMIT is set by hand on the hosting dashboard and by the e2e
// config. The dangerous case is not a wrong number but an unusable one: it
// would disable brute-force protection with no error anywhere, so every
// unusable value has to land on the safe default instead.
describe('resolveAuthRateLimit', () => {
  it('uses the safe default when the variable is unset', () => {
    expect(resolveAuthRateLimit(undefined)).toBe(DEFAULT_AUTH_RATE_LIMIT);
  });

  it.each(['abc', '', '   ', 'NaN', 'Infinity', '0', '-1', '0.4'])(
    'falls back to the default for the unusable value %p',
    (raw) => {
      expect(resolveAuthRateLimit(raw)).toBe(DEFAULT_AUTH_RATE_LIMIT);
    },
  );

  it('honours a deliberate positive override, including the 500 the e2e suite sets', () => {
    expect(resolveAuthRateLimit('20')).toBe(20);
    expect(resolveAuthRateLimit('500')).toBe(500);
  });

  it('floors a fractional override rather than handing a fraction to the throttler', () => {
    expect(resolveAuthRateLimit('5.9')).toBe(5);
  });
});
