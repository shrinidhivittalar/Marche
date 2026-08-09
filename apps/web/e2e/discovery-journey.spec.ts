import { test, expect, signIn } from './fixtures';

// The journey that decides whether the marketplace works at all: a client
// searches, opens a listing, and looks at who is behind it. Both
// destinations previously either did not exist or rendered mock fixtures,
// so every search led somewhere fake or nowhere.

async function publishService(page: import('@playwright/test').Page, title: string) {
  await page.goto('/provider/services');
  await expect(page.getByTestId('create-service-card')).toBeVisible({ timeout: 40_000 });
  await page.getByTestId('service-title').fill(title);
  await page
    .getByTestId('service-description')
    .fill('Full-day coverage with edited photographs delivered within a week.');
  await page.getByTestId('service-category').selectOption({ index: 1 });
  await page.getByTestId('service-price').fill('42000');
  await page.getByTestId('service-delivery').fill('6');
  await page.getByTestId('service-tags').fill('candid, destination');
  await page.getByTestId('create-service').click();
  await expect(page.getByTestId('services-success')).toBeVisible({ timeout: 30_000 });

  await page
    .locator(`[data-service-title="${title}"]`)
    .getByTestId(/^publish-/)
    .click();
  await expect(page.getByTestId('services-success')).toBeVisible({ timeout: 30_000 });
}

test.describe('discovery journey', () => {
  test('search, open the listing, then open the provider — all real data', async ({
    page,
    users,
  }) => {
    test.setTimeout(180_000);
    const title = `E2E journey ${Date.now()}`;

    await signIn(page, users.provider);

    // Give the provider something to show, so the profile page is not empty.
    await page.goto('/provider/profile');
    await expect(page.getByTestId('profile-api-section')).toBeVisible({ timeout: 40_000 });
    await page.getByTestId('input-headline').fill('Wedding photographer in Bengaluru');
    await page.getByTestId('input-location').fill('Bengaluru');
    await page.getByTestId('save-profile').click();
    await expect(page.getByTestId('profile-success')).toBeVisible({ timeout: 30_000 });

    await publishService(page, title);

    // Search finds it.
    await page.goto('/marketplace');
    await page.getByTestId('filter-q').fill(title);
    await page.getByTestId('apply-filters').click();
    await expect(page.getByTestId('service-card')).toHaveCount(1, { timeout: 30_000 });

    // Opening the card lands on the service, not the provider.
    await page.getByTestId(/^view-service-/).click();
    await expect(page.getByTestId('service-detail-page')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('service-title')).toHaveText(title);
    await expect(page.getByTestId('service-price')).toContainText('42000');
    await expect(page.getByTestId('service-delivery')).toContainText('6 days');
    await expect(page.getByTestId('service-tag-list')).toContainText('candid');
    await expect(page.getByTestId('service-provider-name')).toHaveText(users.provider.name);

    // And from there, the real provider profile.
    await page.getByTestId('service-view-provider').click();
    await expect(page.getByTestId('public-profile-page')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('public-display-name')).toHaveText(users.provider.name);
    await expect(page.getByTestId('public-headline')).toContainText('Wedding photographer');
    await expect(page.getByTestId('public-location')).toContainText('Bengaluru');

    // Statistics are hardcoded zeros server-side until Reviews exists.
    // Rendering "0 completed projects" would read as a fact about this
    // provider rather than a missing feature, so the page says which it is.
    await expect(page.getByTestId('public-stats-unavailable')).toBeVisible();
  });
});

test.describe('service detail — negative', () => {
  test('an unknown service id shows an unavailable message, not a crash', async ({ page }) => {
    await page.goto('/services/3f1c0f9e-0000-4000-8000-000000000000');
    await expect(page.getByTestId('service-detail-error')).toBeVisible({ timeout: 30_000 });
  });

  // A draft 404s exactly as a missing listing does, so nobody can probe for
  // unpublished work by guessing ids.
  test('a draft is not viewable by its direct link', async ({ page, users }) => {
    test.setTimeout(120_000);
    const title = `E2E draft-link ${Date.now()}`;

    await signIn(page, users.provider);
    await page.goto('/provider/services');
    await expect(page.getByTestId('create-service-card')).toBeVisible({ timeout: 40_000 });
    await page.getByTestId('service-title').fill(title);
    await page
      .getByTestId('service-description')
      .fill('A draft that must not be publicly linkable.');
    await page.getByTestId('service-category').selectOption({ index: 1 });
    await page.getByTestId('service-price').fill('5000');
    await page.getByTestId('service-delivery').fill('3');
    await page.getByTestId('create-service').click();
    await expect(page.getByTestId('services-success')).toBeVisible({ timeout: 30_000 });

    const serviceId = await page
      .locator(`[data-service-title="${title}"]`)
      .getByTestId(/^status-/)
      .getAttribute('data-testid');
    const id = (serviceId ?? '').replace('status-', '');

    await page.goto(`/services/${id}`);
    await expect(page.getByTestId('service-detail-error')).toBeVisible({ timeout: 30_000 });
  });

  test('a signed-out visitor cannot read a profile by id', async ({ page }) => {
    await page.goto('/profile/3f1c0f9e-0000-4000-8000-000000000000');
    await expect(page.getByTestId('public-profile-signed-out')).toBeVisible({ timeout: 30_000 });
  });
});
