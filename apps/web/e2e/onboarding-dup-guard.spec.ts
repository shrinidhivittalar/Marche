import { test, expect, signIn } from './fixtures';

// Regression coverage for the audit finding: the onboarding Add buttons
// (Skills/Experience/Education/Languages, all sharing ProfileCards.tsx) were
// disabled only by profile.loading — the GET /profiles/me fetch state — with
// no in-flight flag for the Add mutation itself, so a second Add could fire
// before the first one's POST resolved. Fixed by tracking a shared
// actionPending state around ProviderOnboardingPage.tsx's runAction.
test.describe.configure({ timeout: 120_000 });

test('education Add button disables during the in-flight request', async ({ page, users }) => {
  await signIn(page, users.provider);
  await page.goto('/provider/onboarding');
  await page.getByRole('button', { name: /get started/i }).click();
  await page.getByText('Skip for now').click(); // q1
  await page.getByText('Skip for now').click(); // q2
  await page.getByText('Skip for now').click(); // q3
  await page.getByText('Fill out manually').click(); // profile
  await page.getByText('Skip for now').click(); // skills
  await page.getByText('Skip for now').click(); // title
  await page.getByText('Skip for now').click(); // experience
  await expect(page.getByTestId('education-card')).toBeVisible({ timeout: 20_000 });

  // Force the POST to stay in flight for a moment so the disabled window is
  // actually observable, and count how many add-education requests actually
  // reach the network. EducationCard clears its own institution/degree
  // fields the instant Add is clicked (ProfileCards.tsx), which already
  // blocks a literal same-values double-click since the button also
  // disables on empty fields — the real gap the checklist flagged is a
  // user re-filling the (now-empty) fields and clicking Add again for a
  // second entry before the first request has resolved.
  let addRequests = 0;
  await page.route('**/education', async (route) => {
    if (route.request().method() === 'POST') {
      addRequests += 1;
      await new Promise((r) => setTimeout(r, 1500));
    }
    await route.continue();
  });

  const addButton = page.getByTestId('add-education');
  await page.getByTestId('education-institution').fill('Test University');
  await page.getByTestId('education-degree').fill('BA');
  await addButton.click();
  expect(await addButton.isDisabled()).toBe(true);

  // Fields are now empty again (cleared on click) — refill with a second,
  // different entry and try to submit it while the first is still in flight.
  // Checked with a direct isDisabled() rather than expect().toBeDisabled():
  // the latter retries for up to the config's 10s expect timeout, which
  // would happily "pass" once the first request's later refetch flips
  // profile.loading — masking the actual immediate-after-refill state this
  // is meant to prove.
  await page.getByTestId('education-institution').fill('Second University');
  await page.getByTestId('education-degree').fill('MA');
  expect(await addButton.isDisabled()).toBe(true);
  await addButton.click({ force: true });

  await expect(page.getByTestId('education-item')).toHaveCount(1, { timeout: 10_000 });
  expect(addRequests).toBe(1);
});
