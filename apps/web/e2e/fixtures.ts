import { test as base, expect, type Page } from '@playwright/test';
import { loadState, type TestState, type TestUser } from './test-users';

// Every test signs in for itself. Sharing a saved cookie jar across tests
// was tried and does not work here, for a good reason: refresh tokens are
// single-use and rotating (auth.service.ts revokes the session on every
// refresh), so a stored jar is dead the moment the first page load consumes
// it. The API's auth rate limit is raised for the test server instead —
// see playwright.config.ts.
//
// Signing in through the real form rather than injecting a token also keeps
// the one flow every other flow depends on under test.
export async function signIn(page: Page, user: TestUser) {
  await page.goto('/auth/signin');
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole('button', { name: /sign in/i }).click();

  // Leaving /auth/signin is the success signal, rather than a fixed wait.
  await expect(page).not.toHaveURL(/\/auth\/signin/, { timeout: 30_000 });
}

export const test = base.extend<{ users: TestState }>({
  users: async ({}, use) => {
    await use(loadState());
  },
});

export { expect };
