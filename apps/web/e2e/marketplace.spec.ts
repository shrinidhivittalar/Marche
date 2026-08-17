import { test, expect, signIn } from './fixtures';
import { chooseServiceCategory } from './journeys';
import type { Page } from '@playwright/test';

// Module 3 (Marketplace) through the browser against the real API.
//
// The lifecycle test is the one that matters: a draft must be invisible,
// publishing must make it findable, and unpublishing must hide it again.
// Everything else in the module exists to serve that.
//
// Grouped by the role each block runs as, because test.use applies per
// describe — and because "who is acting" is the thing being tested.

const uniqueTitle = (label: string) => `E2E ${label} ${Date.now()}`;

async function createService(page: Page, title: string) {
  await page.goto('/provider/services');
  await expect(page.getByTestId('create-service-card')).toBeVisible({ timeout: 40_000 });

  await page.getByTestId('service-title').fill(title);
  await page
    .getByTestId('service-description')
    .fill('A listing created by the end-to-end suite, long enough to pass validation.');
  await chooseServiceCategory(page);
  await page.getByTestId('service-price').fill('25000');
  await page.getByTestId('service-delivery').fill('7');
  await page.getByTestId('create-service').click();

  await expect(page.getByTestId('services-success')).toBeVisible({ timeout: 30_000 });
}

async function searchFor(page: Page, term: string) {
  await page.goto('/marketplace');
  await page.getByTestId('filter-q').fill(term);
  await page.getByTestId('apply-filters').click();
}

test.describe('marketplace — public browsing', () => {
  test('browsing works without signing in', async ({ page }) => {
    await page.goto('/marketplace');
    await expect(page.getByTestId('browse-page')).toBeVisible();
    await expect(page.getByTestId('results-count')).toBeVisible({ timeout: 40_000 });
  });

  test('the category filter is populated from the seeded taxonomy', async ({ page }) => {
    await page.goto('/marketplace');
    const options = page.getByTestId('filter-category').locator('option');
    await expect.poll(() => options.count(), { timeout: 40_000 }).toBeGreaterThan(5);
  });

  test('filters narrow results and clearing restores them', async ({ page }) => {
    await page.goto('/marketplace');
    await expect(page.getByTestId('results-count')).toBeVisible({ timeout: 40_000 });

    await page.getByTestId('filter-minPrice').fill('99999999');
    await page.getByTestId('apply-filters').click();
    await expect(page.getByTestId('results-empty')).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('clear-filters').click();
    await expect(page.getByTestId('results-count')).toBeVisible({ timeout: 30_000 });
  });

  test('every offered sort is accepted by the API', async ({ page }) => {
    await page.goto('/marketplace');
    for (const sort of ['newest', 'price_low', 'price_high']) {
      await page.getByTestId('filter-sort').selectOption(sort);
      await expect(page.getByTestId('results-error')).toHaveCount(0);
      await expect(page.getByTestId('results-count')).toBeVisible({ timeout: 30_000 });
    }
  });

  test('the UI never offers a sort the API rejects', async ({ page }) => {
    await page.goto('/marketplace');
    const values = await page
      .getByTestId('filter-sort')
      .locator('option')
      .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));

    // rating and relevance are rejected with a 400 until Reviews exists.
    // Offering them would hand the user a button that errors.
    expect(values).not.toContain('rating');
    expect(values).not.toContain('relevance');
    expect(values.sort()).toEqual(['newest', 'price_high', 'price_low']);
  });

  test('an inverted price range surfaces the API error rather than an empty list', async ({
    page,
  }) => {
    await page.goto('/marketplace');
    await page.getByTestId('filter-minPrice').fill('500');
    await page.getByTestId('filter-maxPrice').fill('100');
    await page.getByTestId('apply-filters').click();

    // "No results" here would be a lie — the filter is invalid, not empty.
    await expect(page.getByTestId('results-error')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('results-empty')).toHaveCount(0);
  });

  test('a failing search surfaces an error with a retry', async ({ page }) => {
    await page.route('**/services?*', (route) => route.abort('failed'));
    await page.goto('/marketplace');

    await expect(page.getByTestId('results-error')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('results-retry')).toBeVisible();
  });

  test('a search with no matches shows an empty state, not an error', async ({ page }) => {
    await searchFor(page, 'zzzz-no-such-service-zzzz');
    await expect(page.getByTestId('results-empty')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('results-error')).toHaveCount(0);
  });
});

// The tests below sign in, create a listing, and walk it through publish and
// unpublish with a marketplace search after each — a dozen round trips to a
// hosted database inside one test. The lifecycle test measured 57.8s against
// the default 60s budget, which is not a passing test so much as a race it
// happened to win; it lost that race the moment it ran against a different
// database at the same latency. Same reasoning, and the same number, as
// proposals.spec.ts and notifications.spec.ts.
test.describe('marketplace — as a provider', () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ page, users }) => {
    await signIn(page, users.provider);
  });

  test('a draft is private, a published service is findable, unpublishing hides it', async ({
    page,
  }) => {
    const title = uniqueTitle('lifecycle');
    await createService(page, title);

    // Draft: the owner sees it and its status, the public does not.
    const owned = page.locator(`[data-service-title="${title}"]`);
    await expect(owned).toHaveAttribute('data-service-status', 'DRAFT');

    await searchFor(page, title);
    await expect(page.getByTestId('results-empty')).toBeVisible({ timeout: 30_000 });

    // Publish, then it must appear.
    await page.goto('/provider/services');
    const card = page.locator(`[data-service-title="${title}"]`);
    await expect(card).toBeVisible({ timeout: 40_000 });
    await card.getByTestId(/^publish-/).click();
    await expect(page.getByTestId('services-success')).toBeVisible({ timeout: 30_000 });

    await searchFor(page, title);
    await expect(page.getByTestId('service-card')).toHaveCount(1, { timeout: 30_000 });

    // Unpublish, then it must disappear again.
    await page.goto('/provider/services');
    const published = page.locator(`[data-service-title="${title}"]`);
    await expect(published).toBeVisible({ timeout: 40_000 });
    await published.getByTestId(/^unpublish-/).click();
    await expect(page.getByTestId('services-success')).toBeVisible({ timeout: 30_000 });

    await searchFor(page, title);
    await expect(page.getByTestId('results-empty')).toBeVisible({ timeout: 30_000 });
  });

  test('provider discovery returns one row per provider, not per listing', async ({
    page,
    users,
  }) => {
    await createService(page, uniqueTitle('dedup-a'));
    await createService(page, uniqueTitle('dedup-b'));

    await page.goto('/provider/services');
    await expect
      .poll(() => page.getByTestId(/^publish-/).count(), { timeout: 40_000 })
      .toBeGreaterThanOrEqual(2);

    // Re-queried between clicks: the list re-renders after each mutation,
    // so a handle taken before the first click goes stale.
    await page
      .getByTestId(/^publish-/)
      .first()
      .click();
    await expect(page.getByTestId('services-success')).toBeVisible({ timeout: 30_000 });
    await page
      .getByTestId(/^publish-/)
      .first()
      .click();
    await expect(page.getByTestId('services-success')).toBeVisible({ timeout: 30_000 });

    await page.goto('/marketplace');
    await page.getByTestId('mode-providers').click();
    await page.getByTestId('apply-filters').click();

    const cards = page.locator(`[data-provider-name="${users.provider.name}"]`);
    await expect(cards).toHaveCount(1, { timeout: 30_000 });
  });

  test('a service with a missing title is rejected with the API message', async ({ page }) => {
    await page.goto('/provider/services');
    await expect(page.getByTestId('create-service-card')).toBeVisible({ timeout: 40_000 });

    await page.getByTestId('service-description').fill('Long enough description to be valid here.');
    await chooseServiceCategory(page);
    await page.getByTestId('service-price').fill('1000');
    await page.getByTestId('service-delivery').fill('3');
    await page.getByTestId('create-service').click();

    await expect(page.getByTestId('services-error')).toBeVisible({ timeout: 30_000 });
  });

  test('a negative price is rejected', async ({ page }) => {
    await page.goto('/provider/services');
    await expect(page.getByTestId('create-service-card')).toBeVisible({ timeout: 40_000 });

    await page.getByTestId('service-title').fill(uniqueTitle('negative-price'));
    await page.getByTestId('service-description').fill('Long enough description to be valid here.');
    await chooseServiceCategory(page);
    await page.getByTestId('service-price').fill('-500');
    await page.getByTestId('service-delivery').fill('3');
    await page.getByTestId('create-service').click();

    await expect(page.getByTestId('services-error')).toBeVisible({ timeout: 30_000 });
  });
});

test.describe('marketplace — as a different provider', () => {
  test("one provider never sees another provider's listings", async ({ page, users }) => {
    await signIn(page, users.otherProvider);
    await page.goto('/provider/services');
    await expect(page.getByTestId('my-services-page')).toBeVisible({ timeout: 40_000 });

    // The other provider created listings in the block above. None may
    // appear here — /services/me is scoped to the caller's own profile.
    await expect(page.locator('[data-service-title^="E2E lifecycle"]')).toHaveCount(0);
    await expect(page.locator('[data-service-title^="E2E dedup"]')).toHaveCount(0);
  });
});

test.describe('marketplace — as a client', () => {
  test.beforeEach(async ({ page, users }) => {
    await signIn(page, users.client);
  });

  test('a client cannot reach the service management page', async ({ page }) => {
    await page.goto('/provider/services');
    // Either the role guard redirects, or the page refuses. What must not
    // happen is a client being shown create controls that always 403.
    await expect(page.getByTestId('create-service-card')).toHaveCount(0);
  });

  test('a client can still browse the marketplace', async ({ page }) => {
    await page.goto('/marketplace');
    await expect(page.getByTestId('browse-page')).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId('results-count')).toBeVisible({ timeout: 40_000 });
  });
});
