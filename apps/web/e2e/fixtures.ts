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

// Drives the shared DatePicker (packages/ui/src/components/DatePicker.tsx) —
// a Calendar in a popover, not a native <input type="date">. `testId` is the
// picker's own trigger button; `iso` is a YYYY-MM-DD string. Assumes
// captionLayout="dropdown" (both month and year dropdowns render) — every
// caller of DatePicker in this app sets that for exactly this reason: a
// human or a test can jump straight to any year instead of clicking
// "previous month" dozens of times.
export async function pickDate(page: Page, testId: string, iso: string) {
  const [year, month, day] = iso.split('-').map(Number);
  const monthName = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long' });
  const ordinal =
    day % 10 === 1 && day !== 11
      ? `${day}st`
      : day % 10 === 2 && day !== 12
        ? `${day}nd`
        : day % 10 === 3 && day !== 13
          ? `${day}rd`
          : `${day}th`;

  await page.getByTestId(testId).click();
  await page.getByRole('combobox', { name: 'Choose the Year' }).selectOption(String(year));
  await page.getByRole('combobox', { name: 'Choose the Month' }).selectOption({ label: monthName });
  await page.getByRole('button', { name: new RegExp(`${monthName} ${ordinal}, ${year}`) }).click();
}

export const test = base.extend<{ users: TestState }>({
  users: async ({}, use) => {
    await use(loadState());
  },
});

export { expect };
