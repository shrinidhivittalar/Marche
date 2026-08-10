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
