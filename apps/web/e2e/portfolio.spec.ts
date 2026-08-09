import { test, expect, signIn } from './fixtures';

// Portfolio had a table, endpoints, validation and no UI whatsoever — the
// surface a client actually judges a provider on. These cover the rule the
// API enforces most strictly: a piece cannot exist without an image.

test.describe('portfolio', () => {
  test.beforeEach(async ({ page, users }) => {
    await signIn(page, users.provider);
    await page.goto('/provider/profile');
    await expect(page.getByTestId('portfolio-card')).toBeVisible({ timeout: 40_000 });
  });

  test('starts empty and tells you an image is required', async ({ page }) => {
    await expect(page.getByTestId('portfolio-empty')).toBeVisible();
    await expect(page.getByTestId('portfolio-image-hint')).toContainText('at least one image');
    // Saying so up front beats letting someone write a description and
    // then be refused by the API.
    await expect(page.getByTestId('add-portfolio')).toBeDisabled();
  });

  test('adds a piece with several images, then removes it', async ({ page }) => {
    const title = `E2E piece ${Date.now()}`;

    await page.getByTestId('portfolio-title').fill(title);
    await page.getByTestId('portfolio-description').fill('A wedding shoot in Coorg.');
    await page.getByTestId('portfolio-category').fill('Wedding');

    await page.getByTestId('portfolio-image-url').fill('https://example.com/one.jpg');
    await page.getByTestId('portfolio-add-image').click();
    await page.getByTestId('portfolio-image-url').fill('https://example.com/two.jpg');
    await page.getByTestId('portfolio-add-image').click();

    await expect(page.getByTestId('portfolio-pending-image')).toHaveCount(2);
    await expect(page.getByTestId('portfolio-image-hint')).toContainText('2 images ready');

    await page.getByTestId('add-portfolio').click();
    await expect(page.getByTestId('profile-success')).toBeVisible({ timeout: 30_000 });

    const item = page.locator(`[data-portfolio-title="${title}"]`);
    await expect(item).toBeVisible();
    await expect(item).toContainText('2 images');

    await item.getByRole('button').click();
    await expect(page.getByTestId('profile-success')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(`[data-portfolio-title="${title}"]`)).toHaveCount(0);
  });

  test('the save button stays disabled until title, description and an image exist', async ({
    page,
  }) => {
    await page.getByTestId('portfolio-title').fill('Only a title');
    await expect(page.getByTestId('add-portfolio')).toBeDisabled();

    await page.getByTestId('portfolio-description').fill('And a description.');
    // Still disabled: the API requires at least one image.
    await expect(page.getByTestId('add-portfolio')).toBeDisabled();

    await page.getByTestId('portfolio-image-url').fill('https://example.com/pic.jpg');
    await page.getByTestId('portfolio-add-image').click();
    await expect(page.getByTestId('add-portfolio')).toBeEnabled();
  });

  test('a non-https image is rejected by the API with its message shown', async ({ page }) => {
    await page.getByTestId('portfolio-title').fill(`E2E insecure ${Date.now()}`);
    await page.getByTestId('portfolio-description').fill('Should not save.');
    await page.getByTestId('portfolio-image-url').fill('http://example.com/insecure.jpg');
    await page.getByTestId('portfolio-add-image').click();
    await page.getByTestId('add-portfolio').click();

    await expect(page.getByTestId('profile-error')).toBeVisible({ timeout: 30_000 });
  });

  test('the same image cannot be added twice', async ({ page }) => {
    await page.getByTestId('portfolio-image-url').fill('https://example.com/same.jpg');
    await page.getByTestId('portfolio-add-image').click();
    await page.getByTestId('portfolio-image-url').fill('https://example.com/same.jpg');
    await page.getByTestId('portfolio-add-image').click();

    await expect(page.getByTestId('portfolio-pending-image')).toHaveCount(1);
  });
});

// Its own block: the provider beforeEach above would otherwise sign in
// first, and signing in twice in one test leaves the app holding the
// previous role long enough for the /client/ route guard to bounce it.
test.describe('portfolio — as a client', () => {
  test('a client sees no portfolio card', async ({ page, users }) => {
    await signIn(page, users.client);
    await page.goto('/client/profile');
    await expect(page.getByTestId('profile-api-section')).toBeVisible({ timeout: 40_000 });
    // Portfolio is Provider-only, like the other professional sections.
    await expect(page.getByTestId('portfolio-card')).toHaveCount(0);
  });
});
