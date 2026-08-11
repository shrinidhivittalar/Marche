import { refreshCookieOptions } from '../controllers/auth.controller';

// In production the web app and the API are separate origins, so the wrong
// SameSite value here is invisible in development and logs every user out the
// moment their access token expires. Both environments are pinned.
describe('refreshCookieOptions', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('sends the cookie cross-site in production, which needs SameSite=None and Secure together', () => {
    process.env.NODE_ENV = 'production';

    expect(refreshCookieOptions()).toMatchObject({ sameSite: 'none', secure: true });
  });

  it('keeps SameSite=Strict in development, where the frontend is same-site', () => {
    process.env.NODE_ENV = 'development';

    // secure:false as well — a Secure cookie would never be stored over
    // plain-http localhost.
    expect(refreshCookieOptions()).toMatchObject({ sameSite: 'strict', secure: false });
  });

  it('stays httpOnly and scoped to /auth in both environments', () => {
    for (const env of ['production', 'development']) {
      process.env.NODE_ENV = env;

      expect(refreshCookieOptions()).toMatchObject({ httpOnly: true, path: '/auth' });
    }
  });
});
