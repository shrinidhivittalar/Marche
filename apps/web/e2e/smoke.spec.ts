import { test, expect, signIn } from './fixtures';

// Proves the harness works before any behaviour is asserted on it: both
// servers up, the seeded database reachable, and a created account able to
// sign in. If this fails, every other failure in the suite is noise.
test.describe('harness', () => {
  test('the API is up and serving seeded categories', async ({ request }) => {
    const res = await request.get('http://localhost:4310/categories');
    expect(res.status()).toBe(200);
    const categories = await res.json();
    expect(Array.isArray(categories)).toBe(true);
    expect(categories.length).toBeGreaterThan(0);
    expect(categories[0]).toHaveProperty('children');
  });

  test('the web app loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });

  test('a test provider can sign in', async ({ page, users }) => {
    await signIn(page, users.provider);
    await expect(page).not.toHaveURL(/\/auth\/signin/);
  });
});
