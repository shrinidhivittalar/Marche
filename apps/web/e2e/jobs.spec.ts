import { test, expect, signIn } from './fixtures';
import type { Browser, Page } from '@playwright/test';
import type { TestUser } from './test-users';

// Module 4 (Jobs / Requirements) through the browser against the real API.
//
// The journey test is the one that matters and is the one module4.md calls
// out: a client posts a requirement, publishes it, and a provider finds it
// and opens it. That is the first half of the two-sided marketplace working
// end to end, with no mock data anywhere in the path.
//
// Everything else here defends a rule that would be invisible if it broke —
// a draft leaking into discovery, a provider reaching the post form, a
// cancelled requirement still being findable.

// NOTE — provider routes are role-gated in App.tsx: anything under
// /provider/ other than the dashboard bounces a non-vendor to their own
// home. That is why every provider step below runs in its own signed-in
// context rather than as a guest.
//
// It also means requirement discovery is unreachable to a signed-out
// visitor even though GET /jobs is deliberately public and the detail page
// already handles a signed-out reader. That mismatch is recorded as a gap
// in module4-e2e-results.md rather than fixed here — changing app-wide
// routing is not Module 4's to decide.

const uniqueTitle = (label: string) => `E2E ${label} ${Date.now()}`;

/**
 * A page signed in as the given user, in its own browser context.
 *
 * Separate contexts rather than clearing cookies between roles: the app
 * keeps the last role in localStorage, so a shared context can carry a
 * stale role into the next sign-in and bounce a provider off their own
 * routes before the refresh settles.
 */
async function pageAs(browser: Browser, user: TestUser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, user);
  return page;
}

const DESCRIPTION =
  'A requirement created by the end-to-end suite, long enough to pass the twenty character minimum.';

/**
 * Walks the five-step wizard and stops on the review step without
 * publishing. Dates are left empty on purpose: they are optional on the API,
 * and driving the custom date and time widgets would test those components
 * rather than this flow.
 */
async function fillWizard(page: Page, title: string) {
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

async function publishRequirement(page: Page, title: string) {
  await fillWizard(page, title);
  await page.getByTestId('publish-job').click();

  // Landing on the detail page with a real id is the success signal.
  await expect(page.getByTestId('job-title')).toHaveText(title, { timeout: 40_000 });
  await expect(page.getByTestId('job-status')).toHaveAttribute('data-status', 'PUBLISHED');
}

// ---------------------------------------------------------------------------
// The core workflow
// ---------------------------------------------------------------------------

test.describe('module 4 — the core client/provider journey', () => {
  test('a client publishes a requirement and a provider finds and opens it', async ({
    page,
    browser,
    users,
  }) => {
    const title = uniqueTitle('journey');

    await signIn(page, users.client);
    await publishRequirement(page, title);

    // Switch sides. A different account in a different context, so this
    // exercises the real visibility rule rather than a UI toggle.
    const provider = await pageAs(browser, users.provider);

    await provider.goto('/provider/search');
    await provider.getByTestId('job-search-input').fill(title);

    const card = provider.getByTestId('job-result').filter({ hasText: title });
    await expect(card).toBeVisible({ timeout: 40_000 });

    await card.click();
    await expect(provider.getByTestId('job-detail-title')).toHaveText(title, { timeout: 30_000 });

    // Where Module 5 takes over.
    await expect(provider.getByTestId('submit-proposal-cta')).toBeVisible();

    await provider.context().close();
  });
});

// ---------------------------------------------------------------------------
// Negative cases — the rules that fail silently if they break
// ---------------------------------------------------------------------------

test.describe('module 4 — requirements that must not be visible', () => {
  test('a draft never appears in provider discovery', async ({ page, browser, users }) => {
    const title = uniqueTitle('draft-hidden');

    await signIn(page, users.client);
    await fillWizard(page, title);
    await page.getByRole('button', { name: /save as draft/i }).click();
    await expect(page.getByText(/draft saved/i)).toBeVisible({ timeout: 30_000 });

    const provider = await pageAs(browser, users.provider);
    await provider.goto('/provider/search');
    await provider.getByTestId('job-search-input').fill(title);

    // Waiting for the count to appear first, so this asserts "searched and
    // found nothing" rather than "the list had not loaded yet".
    await expect(provider.getByTestId('job-result-count')).toBeVisible({ timeout: 40_000 });
    await expect(provider.getByTestId('job-result').filter({ hasText: title })).toHaveCount(0, {
      timeout: 40_000,
    });

    await provider.context().close();
  });

  test('a cancelled requirement leaves discovery', async ({ page, browser, users }) => {
    const title = uniqueTitle('cancelled');

    await signIn(page, users.client);
    await publishRequirement(page, title);

    await page.getByTestId('cancel-requirement').click();
    await expect(page.getByTestId('job-status')).toHaveAttribute('data-status', 'CANCELLED', {
      timeout: 30_000,
    });

    const provider = await pageAs(browser, users.provider);
    await provider.goto('/provider/search');
    await provider.getByTestId('job-search-input').fill(title);

    await expect(provider.getByTestId('job-result-count')).toBeVisible({ timeout: 40_000 });
    await expect(provider.getByTestId('job-result').filter({ hasText: title })).toHaveCount(0, {
      timeout: 40_000,
    });

    await provider.context().close();
  });

  test('a client cannot reach the provider requirement board', async ({ page, users }) => {
    // The role gate in App.tsx, asserted rather than assumed — a client
    // following a provider link lands on their own home instead.
    await signIn(page, users.client);
    await page.goto('/provider/search');

    await expect(page.getByTestId('job-search-input')).toHaveCount(0);
  });
});

test.describe('module 4 — validation the server also enforces', () => {
  test('the wizard refuses to advance past an empty title', async ({ page, users }) => {
    await signIn(page, users.client);
    await page.goto('/client/jobs/new/manual');

    const firstCategory = page.locator('[data-testid^="category-"]').first();
    await expect(firstCategory).toBeVisible({ timeout: 40_000 });
    await firstCategory.click();
    await page.getByTestId('wizard-next').click();

    // Still on the title step, with a reason given.
    await page.getByTestId('wizard-next').click();
    await expect(page.getByText(/title of at least/i)).toBeVisible();
    await expect(page.getByTestId('job-title-input')).toBeVisible();
  });

  test('the wizard refuses a description shorter than the API accepts', async ({ page, users }) => {
    await signIn(page, users.client);
    await page.goto('/client/jobs/new/manual');

    const firstCategory = page.locator('[data-testid^="category-"]').first();
    await expect(firstCategory).toBeVisible({ timeout: 40_000 });
    await firstCategory.click();
    await page.getByTestId('wizard-next').click();

    await page.getByTestId('job-title-input').fill(uniqueTitle('short-desc'));
    await page.getByTestId('wizard-next').click();

    await page.getByTestId('job-description-input').fill('Too short');
    await page.getByTestId('wizard-next').click();

    // Caught in the browser rather than as a 400 after submitting.
    await expect(page.getByText(/description of at least/i)).toBeVisible();
  });

  // Regression: the wizard used to block publishing whenever a maximum was
  // left at zero, because it read that as "less than the minimum" rather
  // than "no upper bound". The API accepts an open-ended range and the card
  // renders it as "From ₹25,000", so only the form was wrong. The mock hid
  // it by pre-filling both fields.
  test('a minimum with no maximum publishes as an open-ended budget', async ({ page, users }) => {
    const title = uniqueTitle('open-budget');

    await signIn(page, users.client);
    await fillWizard(page, title);

    await expect(page.getByTestId('summary-budget')).toHaveText(/From/);
    await page.getByTestId('publish-job').click();

    await expect(page.getByTestId('job-title')).toHaveText(title, { timeout: 40_000 });
    await expect(page.getByTestId('job-status')).toHaveAttribute('data-status', 'PUBLISHED');
  });

  test('the category list is populated from the seeded taxonomy', async ({ page, users }) => {
    await signIn(page, users.client);
    await page.goto('/client/jobs/new/manual');

    const options = page.locator('[data-testid^="category-"]');
    await expect.poll(() => options.count(), { timeout: 40_000 }).toBeGreaterThan(3);
    await expect(page.getByTestId('categories-error')).toHaveCount(0);
  });
});

test.describe('module 4 — provider discovery', () => {
  test('a provider can browse the requirement board', async ({ page, users }) => {
    await signIn(page, users.provider);
    await page.goto('/provider/search');
    await expect(page.getByTestId('job-result-count')).toBeVisible({ timeout: 40_000 });
  });

  test('every offered sort is accepted by the API', async ({ page, users }) => {
    await signIn(page, users.provider);
    await page.goto('/provider/search');
    await expect(page.getByTestId('job-result-count')).toBeVisible({ timeout: 40_000 });

    // "relevance" is deliberately absent from the UI because the API
    // rejects it; this proves the four that remain are all valid.
    for (const sort of ['newest', 'event_date', 'budget_low', 'budget_high']) {
      await page.getByRole('combobox').first().click();
      await page
        .getByRole('option')
        .filter({ hasText: sortLabel(sort) })
        .click();
      await expect(page.getByTestId('job-result-count')).toBeVisible({ timeout: 30_000 });
    }
  });
});

function sortLabel(sort: string): string {
  switch (sort) {
    case 'newest':
      return 'Most Recent';
    case 'event_date':
      return 'Event Date';
    case 'budget_low':
      return 'Budget Low to High';
    default:
      return 'Budget High to Low';
  }
}
