import { validateRequiredEnv } from '../env.validation';

const REQUIRED_KEYS = [
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
  'FRONTEND_ORIGIN',
  'CORS_ORIGINS',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
];

function fullEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of REQUIRED_KEYS) env[key] = `test-value-${key}`;
  return { ...env, ...overrides };
}

describe('validateRequiredEnv', () => {
  it('does not throw when every required variable is set (non-production, no REDIS_URL)', () => {
    expect(() => validateRequiredEnv(fullEnv())).not.toThrow();
  });

  it.each(REQUIRED_KEYS)('throws naming %s when it is missing', (key) => {
    const env = fullEnv({ [key]: undefined });
    expect(() => validateRequiredEnv(env)).toThrow(new RegExp(key));
  });

  it('throws naming a variable that is set but blank', () => {
    const env = fullEnv({ JWT_ACCESS_SECRET: '   ' });
    expect(() => validateRequiredEnv(env)).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('lists every missing variable in a single error, not just the first', () => {
    const env = fullEnv({ DATABASE_URL: undefined, RAZORPAY_KEY_ID: undefined });
    let error: Error | undefined;
    try {
      validateRequiredEnv(env);
    } catch (e) {
      error = e as Error;
    }
    expect(error?.message).toMatch(/DATABASE_URL/);
    expect(error?.message).toMatch(/RAZORPAY_KEY_ID/);
  });

  it('does not require optional variables like SMTP_HOST or GROQ_API_KEY', () => {
    const env = fullEnv({ SMTP_HOST: undefined, GROQ_API_KEY: undefined });
    expect(() => validateRequiredEnv(env)).not.toThrow();
  });

  describe('REDIS_URL', () => {
    it('is not required outside production', () => {
      const env = fullEnv({ NODE_ENV: 'development', REDIS_URL: undefined });
      expect(() => validateRequiredEnv(env)).not.toThrow();
    });

    it('is not required when NODE_ENV is unset', () => {
      const env = fullEnv({ NODE_ENV: undefined, REDIS_URL: undefined });
      expect(() => validateRequiredEnv(env)).not.toThrow();
    });

    it('is not required in test', () => {
      const env = fullEnv({ NODE_ENV: 'test', REDIS_URL: undefined });
      expect(() => validateRequiredEnv(env)).not.toThrow();
    });

    it('is required when NODE_ENV=production', () => {
      const env = fullEnv({ NODE_ENV: 'production', REDIS_URL: undefined });
      expect(() => validateRequiredEnv(env)).toThrow(/REDIS_URL/);
    });

    it('does not throw in production when REDIS_URL is set', () => {
      const env = fullEnv({ NODE_ENV: 'production', REDIS_URL: 'redis://localhost:6379' });
      expect(() => validateRequiredEnv(env)).not.toThrow();
    });

    it('treats a blank REDIS_URL as missing in production', () => {
      const env = fullEnv({ NODE_ENV: 'production', REDIS_URL: '   ' });
      expect(() => validateRequiredEnv(env)).toThrow(/REDIS_URL/);
    });
  });
});
