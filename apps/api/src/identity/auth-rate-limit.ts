// Shared by the IP-keyed @Throttle() on AuthController's routes and the
// email-keyed EmailThrottlerGuard — split out so both can read the same
// override without AuthController and the guard importing each other.
//
// Overridable by an explicit environment variable. This exists for automated
// end-to-end runs, which sign in far more often than any human would and
// otherwise trip the limiter partway through a suite (playwright.config.ts
// sets 500). Refresh tokens are single-use and rotating (auth.service.ts), so
// a test run cannot avoid this by reusing one saved session.
export const DEFAULT_AUTH_RATE_LIMIT = 5;

// The override is parsed defensively because the failure is silent and total:
// `Number('abc')` is NaN and `Number('')` is 0, and @Throttle given either
// stops limiting in any meaningful way. A typo on the Render dashboard would
// therefore switch brute-force protection off with no error and no log line.
// Anything that is not a positive finite count falls back to the default.
//
// No upper clamp. Any ceiling would have to sit above the 500 the e2e suite
// legitimately needs, and 500/min is already far past the point where a limit
// constrains an attacker — so a clamp would buy no protection while adding a
// second number to keep in sync with the test config.
export function resolveAuthRateLimit(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_AUTH_RATE_LIMIT;
  }
  return Math.floor(parsed);
}

export const AUTH_RATE_LIMIT = resolveAuthRateLimit(process.env.AUTH_RATE_LIMIT);
export const AUTH_RATE_LIMIT_TTL_MS = 60_000;
