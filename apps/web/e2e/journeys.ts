import { expect, signIn } from './fixtures';
import type { Browser, Page } from '@playwright/test';
import type { TestUser } from './test-users';

// Steps shared by more than one spec. Extracted when Module 5 needed the
// same "publish a requirement" setup Module 4 already had — a second copy of
// a five-step wizard walk is a second thing to fix when a step changes.

export const uniqueTitle = (label: string) => `E2E ${label} ${Date.now()}`;

export const DESCRIPTION =
  'A requirement created by the end-to-end suite, long enough to pass the twenty character minimum.';

/**
 * A page signed in as the given user, in its own browser context.
 *
 * Separate contexts rather than clearing cookies between roles: the app
 * keeps the last role in localStorage, so a shared context can carry a
 * stale role into the next sign-in and bounce a provider off their own
 * routes before the refresh settles.
 */
export async function pageAs(browser: Browser, user: TestUser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, user);
  return page;
}

/**
 * Walks the five-step wizard and stops on the review step without
 * publishing. Dates are left empty on purpose: they are optional on the API,
 * and driving the custom date and time widgets would test those components
 * rather than this flow.
 */
export async function fillWizard(page: Page, title: string) {
  await page.goto('/client/jobs/new/manual');

  // Step 1 — category, from the seeded taxonomy rather than a hardcoded list.
  // A real Select: the option list only exists in the DOM once the trigger
  // opens it.
  await page.getByTestId('category-select').click();
  const firstCategory = page.locator('[data-testid^="category-"]').first();
  await expect(firstCategory).toBeVisible({ timeout: 40_000 });
  await firstCategory.click();
  await page.getByTestId('wizard-next').click();

  // Step 2 — title.
  await page.getByTestId('job-title-input').fill(title);
  await page.getByTestId('wizard-next').click();

  // Step 3 — description.
  await page.getByTestId('job-description-input').fill(DESCRIPTION);
  await page.getByTestId('wizard-next').click();

  // Step 4 — logistics. Everything here is optional.
  await page.getByTestId('job-location-input').fill('Bandra, Mumbai');
  await page.getByTestId('wizard-next').click();

  // Step 5 — budget and review.
  await page.getByTestId('job-budget-input').fill('25000');
}

export async function publishRequirement(page: Page, title: string) {
  await fillWizard(page, title);
  await page.getByTestId('publish-job').click();

  // Landing on the detail page with a real id is the success signal.
  await expect(page.getByTestId('job-title')).toHaveText(title, { timeout: 40_000 });
  await expect(page.getByTestId('job-status')).toHaveAttribute('data-status', 'PUBLISHED');
}

/** The requirement id, read from the URL after publishing. */
export function requirementIdFrom(page: Page): string {
  const id = new URL(page.url()).pathname.split('/').pop();
  if (!id) throw new Error(`No requirement id in ${page.url()}`);
  return id;
}

/**
 * Picks a category on the service form.
 *
 * The control is a ShadCN/Radix select, not a native one (it became a
 * `<button role="combobox">` in e663e32, which replaced the native form
 * controls on the provider screens), so selectOption cannot drive it.
 *
 * Keyboard rather than clicking the option: the field sits low on the form,
 * so the popover opens upward and its earlier options are positioned off the
 * top of the viewport — Playwright retries the click until it times out on an
 * element it can see but not reach. Arrow-and-enter is also what a keyboard
 * user does, and it moves the list itself rather than the page.
 *
 * Which category is not something these tests care about — they need a valid
 * one, from the seeded taxonomy, the same way the old `{ index: 1 }` did.
 */
export async function chooseServiceCategory(page: Page) {
  const trigger = page.getByTestId('service-category');
  await trigger.click();
  await expect(page.getByRole('option').first()).toBeVisible({ timeout: 30_000 });

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');

  // The placeholder is still the trigger's text if nothing was taken, and a
  // silently empty category fails later as a confusing validation error
  // instead of here.
  await expect(trigger).not.toHaveText(/Choose a category/, { timeout: 10_000 });
}
