import { test, expect, signIn } from './fixtures';
import { chooseServiceCategory } from './journeys';

// Fields and endpoints that existed in the database and API but had no UI,
// so the features were built and unreachable. The visibility test is the
// important one: it proves a business rule from module2.md is now something
// a user can actually exercise, end to end, all the way into search.

test.describe('profile visibility', () => {
  test.beforeEach(async ({ page, users }) => {
    await signIn(page, users.provider);
    await page.goto('/provider/profile');
    await expect(page.getByTestId('profile-api-section')).toBeVisible({ timeout: 40_000 });
  });

  test('defaults to public and explains what each setting does', async ({ page }) => {
    await expect(page.getByTestId('visibility-card')).toBeVisible();
    await expect(page.getByTestId('visibility-explainer')).toContainText(
      'find you in the marketplace',
    );

    await page.getByTestId('visibility-PRIVATE').click();
    // The consequence must be stated: "private" alone does not tell a
    // provider their listings stop appearing in search.
    await expect(page.getByTestId('visibility-explainer')).toContainText(
      'not appear in marketplace search',
    );
  });

  test('going private removes published services from discovery, and public restores them', async ({
    page,
  }) => {
    // Nine steps with a full page load each — create, publish, search, go
    // private, search, go public, search. The default 60s budget covers a
    // single interaction, not a journey this long, and the individual
    // assertions already have their own timeouts to catch a genuine hang.
    test.setTimeout(180_000);

    const title = `E2E visibility ${Date.now()}`;

    // Publish a service while public.
    await page.goto('/provider/services');
    await expect(page.getByTestId('create-service-card')).toBeVisible({ timeout: 40_000 });
    await page.getByTestId('service-title').fill(title);
    await page
      .getByTestId('service-description')
      .fill('A listing used to prove profile visibility reaches marketplace search.');
    await chooseServiceCategory(page);
    await page.getByTestId('service-price').fill('30000');
    await page.getByTestId('service-delivery').fill('5');
    await page.getByTestId('create-service').click();
    await expect(page.getByTestId('services-success')).toBeVisible({ timeout: 30_000 });

    await page
      .locator(`[data-service-title="${title}"]`)
      .getByTestId(/^publish-/)
      .click();
    await expect(page.getByTestId('services-success')).toBeVisible({ timeout: 30_000 });

    const search = async () => {
      await page.goto('/marketplace');
      await page.getByTestId('filter-q').fill(title);
      await page.getByTestId('apply-filters').click();
    };

    await search();
    await expect(page.getByTestId('service-card')).toHaveCount(1, { timeout: 30_000 });

    // Go private — the published listing must vanish from public search.
    await page.goto('/provider/profile');
    await expect(page.getByTestId('visibility-PRIVATE')).toBeVisible({ timeout: 40_000 });
    await page.getByTestId('visibility-PRIVATE').click();
    await page.getByTestId('save-profile').click();
    await expect(page.getByTestId('profile-success')).toBeVisible({ timeout: 30_000 });

    await search();
    await expect(page.getByTestId('results-empty')).toBeVisible({ timeout: 30_000 });

    // Back to public — it must return.
    await page.goto('/provider/profile');
    await expect(page.getByTestId('visibility-PUBLIC')).toBeVisible({ timeout: 40_000 });
    await page.getByTestId('visibility-PUBLIC').click();
    await page.getByTestId('save-profile').click();
    await expect(page.getByTestId('profile-success')).toBeVisible({ timeout: 30_000 });

    await search();
    await expect(page.getByTestId('service-card')).toHaveCount(1, { timeout: 30_000 });
  });
});

test.describe('username and avatar', () => {
  test.beforeEach(async ({ page, users }) => {
    await signIn(page, users.provider);
    await page.goto('/provider/profile');
    await expect(page.getByTestId('profile-api-section')).toBeVisible({ timeout: 40_000 });
  });

  test('setting a username makes the public profile page reachable', async ({ page }) => {
    const username = `e2e-${Date.now()}`;
    await page.getByTestId('input-username').fill(username);
    await page.getByTestId('save-profile').click();
    await expect(page.getByTestId('profile-success')).toBeVisible({ timeout: 30_000 });

    // /u/:username is a real public endpoint that was unreachable for every
    // user until a username could be set.
    const res = await page.request.get(`http://localhost:4310/u/${username}`);
    expect(res.status()).toBe(200);
  });

  test('an invalid username is rejected with the API message', async ({ page }) => {
    await page.getByTestId('input-username').fill('Not A Valid Username!');
    await page.getByTestId('save-profile').click();

    await expect(page.getByTestId('profile-error')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('profile-success')).toHaveCount(0);
  });

  // The two avatar tests that lived here checked a pasted https URL and the
  // API rejecting a non-https one. Both fields are gone: the media pipeline
  // replaced the URL box with an uploader, and the profile now stores a
  // media id rather than a link. There is nothing left to paste.
  //
  // What replaced them cannot be driven here either. Uploading needs object
  // storage, and STORAGE_* is unset in this environment, so a file chosen in
  // the picker fails at the API with "storage is not configured" — a real
  // response to a real gap, not something a test should assert around.
  //
  // So this covers what is true without storage: the uploader is present and
  // starts empty. The upload path itself is verified in
  // module4-e2e-results.md's "not tested" section, deliberately and visibly.
  test('the profile offers an uploader rather than a pasted avatar link', async ({ page }) => {
    await expect(page.getByTestId('image-uploader').first()).toBeVisible();
    await expect(page.getByTestId('input-avatar')).toHaveCount(0);
  });

  test('a profile with no picture is a valid state that saves', async ({ page }) => {
    // A profile without an avatar is deliberately allowed — SetNull on the
    // relation exists for exactly this.
    await expect(page.getByTestId('uploaded-image')).toHaveCount(0);

    await page.getByTestId('save-profile').click();
    await expect(page.getByTestId('profile-success')).toBeVisible({ timeout: 30_000 });
  });
});

test.describe('experience form', () => {
  test.beforeEach(async ({ page, users }) => {
    await signIn(page, users.provider);
    await page.goto('/provider/profile');
    await expect(page.getByTestId('experience-card')).toBeVisible({ timeout: 40_000 });
  });

  // The previous version hardcoded currentlyWorking: true, so a finished
  // role could not be recorded at all.
  test('records a past role with an end date', async ({ page }) => {
    await page.getByTestId('experience-company').fill('Past Studio');
    await page.getByTestId('experience-position').fill('Assistant');
    await page.getByTestId('experience-start').fill('2018-01-01');
    await page.getByTestId('experience-end').fill('2020-06-30');
    await page.getByTestId('add-experience').click();

    const entry = page.getByTestId('experience-item').filter({ hasText: 'Past Studio' });
    await expect(entry).toHaveCount(1);
    await expect(entry).toContainText('2018');
    await expect(entry).toContainText('2020');
  });

  test('a current role shows Present and disables the end date', async ({ page }) => {
    await page.getByTestId('experience-company').fill('Current Studio');
    await page.getByTestId('experience-position').fill('Lead');
    await page.getByTestId('experience-start').fill('2021-03-01');
    await page.getByTestId('experience-current').check();

    // The contradiction the API rejects is made unreachable rather than
    // merely explained afterwards.
    await expect(page.getByTestId('experience-end')).toBeDisabled();

    await page.getByTestId('add-experience').click();
    // Scoped to this entry: the provider accumulates experiences across
    // tests in a run, so the bare testid matches earlier rows too.
    const entry = page.getByTestId('experience-item').filter({ hasText: 'Current Studio' });
    await expect(entry).toHaveCount(1);
    await expect(entry).toContainText('Present');
  });
});

test.describe('service editing', () => {
  test.beforeEach(async ({ page, users }) => {
    await signIn(page, users.provider);
  });

  test('a provider can correct a listing after creating it', async ({ page }) => {
    const original = `E2E editable ${Date.now()}`;
    const corrected = `${original} corrected`;

    await page.goto('/provider/services');
    await expect(page.getByTestId('create-service-card')).toBeVisible({ timeout: 40_000 });
    await page.getByTestId('service-title').fill(original);
    await page.getByTestId('service-description').fill('An initial description that will change.');
    await chooseServiceCategory(page);
    await page.getByTestId('service-price').fill('10000');
    await page.getByTestId('service-delivery').fill('4');
    await page.getByTestId('create-service').click();
    await expect(page.getByTestId('services-success')).toBeVisible({ timeout: 30_000 });

    // Edit it — this path existed in the API from day one with no UI.
    await page
      .locator(`[data-service-title="${original}"]`)
      .getByTestId(/^edit-/)
      .click();
    await page.getByTestId('edit-title').fill(corrected);
    await page.getByTestId('edit-price').fill('12500');
    await page.getByTestId('save-edit').click();
    await expect(page.getByTestId('services-success')).toBeVisible({ timeout: 30_000 });

    await expect(page.locator(`[data-service-title="${corrected}"]`)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator(`[data-service-title="${corrected}"]`)).toContainText('12500');
  });

  test('cancelling an edit leaves the listing untouched', async ({ page }) => {
    const title = `E2E cancel ${Date.now()}`;

    await page.goto('/provider/services');
    await expect(page.getByTestId('create-service-card')).toBeVisible({ timeout: 40_000 });
    await page.getByTestId('service-title').fill(title);
    await page.getByTestId('service-description').fill('A description that must survive a cancel.');
    await chooseServiceCategory(page);
    await page.getByTestId('service-price').fill('8000');
    await page.getByTestId('service-delivery').fill('2');
    await page.getByTestId('create-service').click();
    await expect(page.getByTestId('services-success')).toBeVisible({ timeout: 30_000 });

    await page
      .locator(`[data-service-title="${title}"]`)
      .getByTestId(/^edit-/)
      .click();
    await page.getByTestId('edit-title').fill('discarded title');
    await page.getByTestId('cancel-edit').click();

    await expect(page.locator(`[data-service-title="${title}"]`)).toBeVisible();
    await expect(page.locator('[data-service-title="discarded title"]')).toHaveCount(0);
  });

  test('an invalid edit is rejected with the API message', async ({ page }) => {
    const title = `E2E invalid-edit ${Date.now()}`;

    await page.goto('/provider/services');
    await expect(page.getByTestId('create-service-card')).toBeVisible({ timeout: 40_000 });
    await page.getByTestId('service-title').fill(title);
    await page.getByTestId('service-description').fill('A description long enough to be valid.');
    await chooseServiceCategory(page);
    await page.getByTestId('service-price').fill('9000');
    await page.getByTestId('service-delivery').fill('3');
    await page.getByTestId('create-service').click();
    await expect(page.getByTestId('services-success')).toBeVisible({ timeout: 30_000 });

    await page
      .locator(`[data-service-title="${title}"]`)
      .getByTestId(/^edit-/)
      .click();
    await page.getByTestId('edit-price').fill('-100');
    await page.getByTestId('save-edit').click();

    await expect(page.getByTestId('services-error')).toBeVisible({ timeout: 30_000 });
  });
});
