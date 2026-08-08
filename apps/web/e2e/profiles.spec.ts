import { test, expect, signIn } from './fixtures';

// Module 2 (Profiles) through the browser against the real API.
// Positive cases prove the wiring works; negative cases prove the failures
// are handled rather than swallowed — a screen that silently does nothing
// on a rejected request is worse than one that errors visibly.

test.describe('profile — positive', () => {
  test.beforeEach(async ({ page, users }) => {
    await signIn(page, users.provider);
    await page.goto('/provider/profile');
  });

  test('loads the real profile rather than mock data', async ({ page, users }) => {
    // Longer than the default: this is the first database query of the run
    // and Neon's connection is cold, so it can take well over ten seconds.
    // The app handles it correctly by showing its loading state — this is
    // the test being impatient, not the product being slow in a way a user
    // would see on a warm connection.
    await expect(page.getByTestId('profile-api-section')).toBeVisible({ timeout: 40_000 });
    // Display name is seeded from the registered account name, which is
    // proof the data came from the API and not from the mock fixtures.
    await expect(page.getByTestId('input-displayName')).toHaveValue(users.provider.name);
  });

  test('saves headline, bio and location, and they survive a reload', async ({ page }) => {
    await page.getByTestId('input-headline').fill('Wedding photographer');
    await page.getByTestId('input-bio').fill('Fifteen years photographing weddings across India.');
    await page.getByTestId('input-location').fill('Bengaluru');
    await page.getByTestId('save-profile').click();

    await expect(page.getByTestId('profile-success')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('input-headline')).toHaveValue('Wedding photographer');
    await expect(page.getByTestId('input-location')).toHaveValue('Bengaluru');
  });

  test('updates availability', async ({ page }) => {
    await page.getByTestId('availability-LIMITED').click();
    await expect(page.getByTestId('profile-success')).toBeVisible();
    await expect(page.getByTestId('availability-current')).toContainText('LIMITED');

    await page.reload();
    await expect(page.getByTestId('availability-current')).toContainText('LIMITED');
  });

  test('adds and removes a skill from the seeded taxonomy', async ({ page }) => {
    await expect(page.getByTestId('skills-empty')).toBeVisible();

    const select = page.getByTestId('skill-select');
    const firstSkill = await select.locator('option').nth(1).textContent();
    await select.selectOption({ index: 1 });
    await page.getByTestId('add-skill').click();

    await expect(page.getByTestId(`skill-${firstSkill}`)).toBeVisible();

    await page.getByTestId(`remove-skill-${firstSkill}`).click();
    await expect(page.getByTestId('skills-empty')).toBeVisible();
  });

  test('adds and removes experience', async ({ page }) => {
    await expect(page.getByTestId('experience-empty')).toBeVisible();

    await page.getByTestId('experience-company').fill('Lumina Events');
    await page.getByTestId('experience-position').fill('Lead Photographer');
    await page.getByTestId('experience-start').fill('2020-01-15');
    await page.getByTestId('add-experience').click();

    await expect(page.getByTestId('experience-item')).toHaveCount(1);
    await expect(page.getByTestId('experience-item')).toContainText('Lumina Events');

    await page.getByTestId('experience-item').getByRole('button').click();
    await expect(page.getByTestId('experience-empty')).toBeVisible();
  });

  test('adds and removes education', async ({ page }) => {
    await page.getByTestId('education-institution').fill('NID Ahmedabad');
    await page.getByTestId('education-degree').fill('B.Des');
    await page.getByTestId('add-education').click();

    await expect(page.getByTestId('education-item')).toHaveCount(1);
    await page.getByTestId('education-item').getByRole('button').click();
    await expect(page.getByTestId('education-empty')).toBeVisible();
  });

  test('adds and removes a language with proficiency', async ({ page }) => {
    await page.getByTestId('language-name').fill('Kannada');
    await page.getByTestId('language-proficiency').selectOption('NATIVE');
    await page.getByTestId('add-language').click();

    await expect(page.getByTestId('language-item')).toContainText('Kannada');
    await expect(page.getByTestId('language-item')).toContainText('NATIVE');

    await page.getByTestId('language-item').getByRole('button').click();
    await expect(page.getByTestId('languages-empty')).toBeVisible();
  });
});

test.describe('profile — negative', () => {
  test('a client sees no provider-only sections', async ({ page, users }) => {
    await signIn(page, users.client);
    await page.goto('/client/profile');

    await expect(page.getByTestId('profile-api-section')).toBeVisible();
    // Skills, experience, education and availability are Provider-only in
    // module2.md. Showing a client controls that always 403 would be a
    // dead end dressed up as a feature.
    await expect(page.getByTestId('skills-card')).toHaveCount(0);
    await expect(page.getByTestId('availability-card')).toHaveCount(0);
    await expect(page.getByTestId('experience-card')).toHaveCount(0);
  });

  test('an over-long headline is rejected with the API message shown', async ({ page, users }) => {
    await signIn(page, users.provider);
    await page.goto('/provider/profile');

    await page.getByTestId('input-headline').fill('x'.repeat(500));
    await page.getByTestId('save-profile').click();

    // The failure has to be visible. A silent no-op would leave the user
    // believing their profile saved.
    await expect(page.getByTestId('profile-error')).toBeVisible();
    await expect(page.getByTestId('profile-success')).toHaveCount(0);
  });

  test('an empty display name is rejected', async ({ page, users }) => {
    await signIn(page, users.provider);
    await page.goto('/provider/profile');

    await page.getByTestId('input-displayName').fill('');
    await page.getByTestId('save-profile').click();

    await expect(page.getByTestId('profile-error')).toBeVisible();
  });

  test('a duplicate language is rejected rather than silently added twice', async ({
    page,
    users,
  }) => {
    await signIn(page, users.provider);
    await page.goto('/provider/profile');

    await page.getByTestId('language-name').fill('Tamil');
    await page.getByTestId('add-language').click();
    await expect(page.getByTestId('language-item')).toHaveCount(1);

    await page.getByTestId('language-name').fill('Tamil');
    await page.getByTestId('add-language').click();

    await expect(page.getByTestId('profile-error')).toBeVisible();
    await expect(page.getByTestId('language-item')).toHaveCount(1);
  });

  test('a signed-out visitor is not shown the API-backed profile', async ({ page }) => {
    await page.goto('/provider/profile');
    // No token means every profile call is a 401, so the section must not
    // render at all rather than render broken.
    await expect(page.getByTestId('profile-api-section')).toHaveCount(0);
  });

  test('a failing API surfaces an error with a retry, not a blank screen', async ({
    page,
    users,
  }) => {
    await signIn(page, users.provider);
    await page.route('**/profiles/me', (route) => route.abort('failed'));
    await page.goto('/provider/profile');

    await expect(page.getByTestId('profile-load-error')).toBeVisible();
    await expect(page.getByTestId('profile-retry')).toBeVisible();
  });
});
