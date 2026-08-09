import { test, expect, signIn } from './fixtures';

// Portfolio had a table, endpoints, validation and no UI whatsoever — the
// surface a client actually judges a provider on. These cover the rule the
// API enforces most strictly: a piece cannot exist without an image.
//
// Rewritten when images became real uploads. The original tests pasted https
// URLs into a text field and asserted the API rejecting a non-https one;
// both the field and the rule are gone, because a portfolio image is now a
// media id and there is nothing to paste.
//
// The upload itself is not driven here. It needs object storage, and
// STORAGE_* is unset in this environment, so a chosen file fails at the API
// with "storage is not configured" — the media module behaving exactly as
// designed. Asserting around that would test the gap rather than the
// feature, so the upload path is recorded as untested in
// module4-e2e-results.md instead of being faked green.
//
// What remains is everything that is still true and still worth defending:
// the API's "at least one image" rule reaching the button, and the fact that
// portfolio is Provider-only.

test.describe('portfolio', () => {
  test.beforeEach(async ({ page, users }) => {
    await signIn(page, users.provider);
    await page.goto('/provider/profile');
    await expect(page.getByTestId('portfolio-card')).toBeVisible({ timeout: 40_000 });
  });

  test('starts empty, with an uploader rather than a URL field', async ({ page }) => {
    await expect(page.getByTestId('portfolio-empty')).toBeVisible();

    // The pasted-link inputs are gone for good.
    await expect(page.getByTestId('portfolio-image-url')).toHaveCount(0);
    await expect(page.getByTestId('portfolio-add-image')).toHaveCount(0);
  });

  test('the save button stays disabled until an image is attached', async ({ page }) => {
    await page.getByTestId('portfolio-title').fill('Only a title');
    await expect(page.getByTestId('add-portfolio')).toBeDisabled();

    await page.getByTestId('portfolio-description').fill('And a description.');
    // Still disabled: the API requires at least one image, and saying so
    // here beats letting someone write a description and then be refused.
    await expect(page.getByTestId('add-portfolio')).toBeDisabled();

    await expect(page.getByTestId('uploaded-image')).toHaveCount(0);
  });

  test('the uploader states its limit before anything is chosen', async ({ page }) => {
    const uploader = page.getByTestId('image-uploader').filter({ hasText: /image/i }).first();
    await expect(uploader).toBeVisible();
    // Capacity is shown up front rather than discovered by hitting it.
    await expect(uploader.getByTestId('uploader-count')).toContainText('0 of');
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
