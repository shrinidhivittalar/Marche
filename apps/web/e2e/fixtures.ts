import { test as base, expect, type Page } from '@playwright/test';
import { loadState, type TestState, type TestUser } from './test-users';

// Signs in through the real UI rather than injecting a token. The point of
// these tests is that the wiring works end to end, and a fixture that
// shortcut the login form would stop covering the one flow every other
// flow depends on.
export async function signIn(page: Page, user: TestUser) {
  await page.goto('/auth/signin');
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole('button', { name: /sign in/i }).click();

  // The app routes to a role home on success. Waiting for the URL to leave
  // /auth/signin is the signal, rather than a fixed timeout.
  await expect(page).not.toHaveURL(/\/auth\/signin/, { timeout: 20_000 });
}

export const test = base.extend<{ users: TestState }>({
  users: async ({}, use) => {
    await use(loadState());
  },
});

export { expect };
