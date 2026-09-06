import { Logger } from '@nestjs/common';

// Shared by the IP-keyed @Throttle() on AuthController's routes and the
// email-keyed EmailThrottlerGuard — split out so both can read the same
// override without AuthController and the guard importing each other.
//
// Overridable by an explicit environment variable. This exists for automated
// end-to-end runs, which sign in far more often than any human would and
// otherwise trip the limiter partway through a suite (playwright.config.ts
// sets 500, with NODE_ENV: 'development' — never 'production'). Refresh
// tokens are single-use and rotating (auth.service.ts), so a test run cannot
// avoid this by reusing one saved session.
export const DEFAULT_AUTH_RATE_LIMIT = 5;

const logger = new Logger('AuthRateLimit');

// The override is parsed defensively because the failure is silent and total:
// `Number('abc')` is NaN and `Number('')` is 0, and @Throttle given either
// stops limiting in any meaningful way. A typo on the Render dashboard would
// therefore switch brute-force protection off with no error and no log line.
// Anything that is not a positive finite count falls back to the default.
//
// The override itself is ignored outright in production: the only legitimate
// reason to raise it is the e2e suite, which never runs with
// NODE_ENV=production, so honoring it there only serves an attacker who
// (accidentally or otherwise) gets a high value into Render's env — logged
// loudly rather than silently applied, unlike the parse-failure case above,
// since a misconfigured env var reaching production is itself worth knowing
// about.
export function resolveAuthRateLimit(raw: string | undefined, isProduction: boolean): number {
  if (isProduction) {
    if (raw !== undefined) {
      logger.warn(
        `AUTH_RATE_LIMIT override ('${raw}') is set but ignored in production — ` +
          `only the e2e suite (which never runs with NODE_ENV=production) needs it raised.`,
      );
    }
    return DEFAULT_AUTH_RATE_LIMIT;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_AUTH_RATE_LIMIT;
  }
  return Math.floor(parsed);
}

export const AUTH_RATE_LIMIT = resolveAuthRateLimit(
  process.env.AUTH_RATE_LIMIT,
  process.env.NODE_ENV === 'production',
);
export const AUTH_RATE_LIMIT_TTL_MS = 60_000;
