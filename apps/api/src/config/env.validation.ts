interface RequiredEnvSpec {
  key: string;
  reason: string;
}

// Vars the app cannot run correctly without, in every environment. Everything
// else (SMTP_*, GROQ_API_KEY, STORAGE_*, MEDIA_*, AUTH_RATE_LIMIT, LOG_LEVEL,
// PORT) is intentionally left unchecked here — each of those already
// degrades gracefully on its own and documents that behaviour where it's
// read (email.service.ts, ai.service.ts, storage.service.ts) and in
// apps/api/.env.example. REDIS_URL is checked separately below — it's
// required in production only, not unconditionally.
const REQUIRED_ENV: RequiredEnvSpec[] = [
  { key: 'DATABASE_URL', reason: 'Prisma cannot connect to Postgres without it.' },
  {
    key: 'JWT_ACCESS_SECRET',
    reason:
      "IdentityModule's JwtModule.register reads this at decoration time, before Nest even " +
      'starts — unset, every signed access token is invalid.',
  },
  {
    key: 'FRONTEND_ORIGIN',
    reason:
      'The one canonical frontend URL used for every emailed link (verification, reset, invites).',
  },
  {
    key: 'CORS_ORIGINS',
    reason:
      'Comma-separated list of browser origins allowed to call the API with credentials — ' +
      'see config/cors-origins.ts. No implicit localhost fallback, in any environment.',
  },
  { key: 'RAZORPAY_KEY_ID', reason: 'PaymentsModule cannot take payments without it.' },
  { key: 'RAZORPAY_KEY_SECRET', reason: 'PaymentsModule cannot take payments without it.' },
  { key: 'RAZORPAY_WEBHOOK_SECRET', reason: 'PaymentsModule cannot verify webhooks without it.' },
];

// Required only when NODE_ENV=production. Outside production,
// RedisThrottlerStorage's existing in-memory fallback is preserved as-is
// (see redis-throttler-storage.ts) — this list exists purely to stop that
// fallback from being reached silently in production, where rate limits
// must be shared across instances and survive redeploys.
const PRODUCTION_ONLY_REQUIRED_ENV: RequiredEnvSpec[] = [
  {
    key: 'REDIS_URL',
    reason:
      'In production the throttler must share limits across instances and survive redeploys — ' +
      "the per-process in-memory fallback (redis-throttler-storage.ts) isn't acceptable there.",
  },
];

/**
 * Fails fast with one clear error listing everything missing, instead of
 * letting each module fail separately on first use (or, in
 * JWT_ACCESS_SECRET's case, not fail at all — just silently sign invalid
 * tokens). Call this before AppModule is imported; see main.ts.
 */
export function validateRequiredEnv(env: NodeJS.ProcessEnv = process.env): void {
  const requiredForThisEnv =
    env.NODE_ENV === 'production'
      ? [...REQUIRED_ENV, ...PRODUCTION_ONLY_REQUIRED_ENV]
      : REQUIRED_ENV;

  const missing = requiredForThisEnv.filter(({ key }) => !env[key]?.trim());
  if (missing.length === 0) return;

  const lines = missing.map(({ key, reason }) => `  - ${key}: ${reason}`);
  throw new Error(
    `Missing required environment variable(s):\n${lines.join('\n')}\n\nSee apps/api/.env.example.`,
  );
}
