import { test, expect, signIn } from './fixtures';
import type { Page } from '@playwright/test';
import { uniqueTitle, pageAs, publishRequirement, requirementIdFrom } from './journeys';

// Module 5 (Proposals) through the browser against the real API.
//
// The journey test is the one module5.md calls out and the one that matters:
// a client publishes, a provider proposes, the client accepts, and the
// requirement is filled. That completes the two-sided marketplace — Module 4
// got as far as a provider opening a requirement, and this is the rest.
//
// Everything else here defends a rule that fails silently if it breaks: a
// provider reading another provider's offer, a duplicate slipping through, a
// losing proposal left looking live after someone else was hired.
//
// Deliberately NOT here: the concurrency guarantees. Playwright cannot
// reliably fire two genuinely simultaneous acceptances, and a race test that
// quietly runs sequentially passes while proving nothing. Those live in
// apps/api/src/proposals/tests/acceptance.integration-spec.ts, against the
// real database.

const COVER =
  'A proposal from the end-to-end suite, written long enough to clear the twenty character minimum.';

// Longer than the 60s default, and not arbitrarily: every step here is a
// real round trip to a hosted database that answers in one to four seconds,
// and the hiring journey needs a five-step wizard, two signed-in contexts, a
// submission, an acceptance and three verification loads. The default budget
// expires mid-assertion and reports a missing element, which reads as a
// product bug and is not one.
test.describe.configure({ timeout: 180_000 });

/** Publishes a requirement as the client and returns its id. */
async function publishAsClient(page: Page, title: string): Promise<string> {
  await publishRequirement(page, title);
  return requirementIdFrom(page);
}

/**
 * Submits a proposal as an already-signed-in provider.
 *
 * Navigates straight to the form rather than going through discovery: that
 * path is Module 4's and is covered by its own journey test. Repeating it
 * here would make every proposal test fail whenever search changed.
 */
async function submitProposal(
  provider: Page,
  jobId: string,
  { price = '20000', days = '5' }: { price?: string; days?: string } = {},
) {
  await provider.goto(`/provider/submit-proposal/${jobId}`);
  await provider.getByTestId('proposal-price-input').fill(price);
  await provider.getByTestId('proposal-days-input').fill(days);
  await provider.getByTestId('proposal-message-input').fill(COVER);
  await provider.getByTestId('submit-proposal').click();
}

// ---------------------------------------------------------------------------
// The core workflow
// ---------------------------------------------------------------------------

test.describe('module 5 — the hiring journey', () => {
  test('a provider proposes, the client accepts, and the requirement is filled', async ({
    page,
    browser,
    users,
  }) => {
    const title = uniqueTitle('hire');

    await signIn(page, users.client);
    const jobId = await publishAsClient(page, title);

    // Switch sides. A different account in a different context, so this
    // exercises the real ownership rules rather than a UI toggle.
    const provider = await pageAs(browser, users.provider);
    await submitProposal(provider, jobId);

    // Landing on the provider's own proposal is the success signal.
    await expect(provider.getByTestId('proposal-status')).toHaveAttribute(
      'data-status',
      'SUBMITTED',
      { timeout: 40_000 },
    );

    // Back to the client: the proposal reaches the requirement it was made
    // against, which is the handover the whole module exists for.
    await page.goto(`/client/jobs/${jobId}`);
    const row = page.getByTestId('proposal-row').filter({ hasText: users.provider.name });
    await expect(row).toBeVisible({ timeout: 40_000 });
    await row.click();

    await page.getByTestId('hire-provider').click();
    await page.getByTestId('confirm-hire').click();

    await expect(page.getByTestId('proposal-status')).toHaveAttribute('data-status', 'ACCEPTED', {
      timeout: 40_000,
    });

    // The other half of the transaction: accepting fills the requirement.
    // Asserted from the client's own requirement page rather than trusting
    // the proposal screen's own copy.
    await page.goto(`/client/jobs/${jobId}`);
    await expect(page.getByTestId('job-status')).toHaveAttribute('data-status', 'FILLED', {
      timeout: 40_000,
    });

    // And the provider sees it, without being told by anything but the data.
    await provider.reload();
    await expect(provider.getByTestId('proposal-status')).toHaveAttribute(
      'data-status',
      'ACCEPTED',
      { timeout: 40_000 },
    );

    await provider.context().close();
  });

  test('a client can decline a proposal, and the requirement stays open', async ({
    page,
    browser,
    users,
  }) => {
    const title = uniqueTitle('decline');

    await signIn(page, users.client);
    const jobId = await publishAsClient(page, title);

    const provider = await pageAs(browser, users.provider);
    await submitProposal(provider, jobId);
    await expect(provider.getByTestId('proposal-status')).toBeVisible({ timeout: 40_000 });

    await page.goto(`/client/jobs/${jobId}`);
    const row = page.getByTestId('proposal-row').filter({ hasText: users.provider.name });
    await expect(row).toBeVisible({ timeout: 40_000 });
    await row.click();

    await page.getByTestId('decline-proposal').click();
    await expect(page.getByTestId('proposal-status')).toHaveAttribute('data-status', 'REJECTED', {
      timeout: 40_000,
    });

    // Declining everyone is valid and must not fill the requirement — there
    // is nobody hired.
    await page.goto(`/client/jobs/${jobId}`);
    await expect(page.getByTestId('job-status')).toHaveAttribute('data-status', 'PUBLISHED');

    await provider.context().close();
  });

  test('accepting one proposal declines the competition', async ({ page, browser, users }) => {
    const title = uniqueTitle('competition');

    await signIn(page, users.client);
    const jobId = await publishAsClient(page, title);

    const winner = await pageAs(browser, users.provider);
    await submitProposal(winner, jobId, { price: '20000' });
    await expect(winner.getByTestId('proposal-status')).toBeVisible({ timeout: 40_000 });

    const loser = await pageAs(browser, users.otherProvider);
    await submitProposal(loser, jobId, { price: '30000' });
    await expect(loser.getByTestId('proposal-status')).toBeVisible({ timeout: 40_000 });

    await page.goto(`/client/jobs/${jobId}`);
    await expect(page.getByTestId('proposal-row')).toHaveCount(2, { timeout: 40_000 });

    await page.getByTestId('proposal-row').filter({ hasText: users.provider.name }).click();
    await page.getByTestId('hire-provider').click();
    await page.getByTestId('confirm-hire').click();
    await expect(page.getByTestId('proposal-status')).toHaveAttribute('data-status', 'ACCEPTED', {
      timeout: 40_000,
    });

    // The rule worth testing through the browser: the losing provider is not
    // left believing they are still in the running. This is the part of the
    // acceptance transaction a client never sees.
    await loser.reload();
    await expect(loser.getByTestId('proposal-status')).toHaveAttribute('data-status', 'REJECTED', {
      timeout: 40_000,
    });

    await winner.context().close();
    await loser.context().close();
  });
});

// ---------------------------------------------------------------------------
// Rules that fail silently if they break
// ---------------------------------------------------------------------------

test.describe('module 5 — one proposal per provider per requirement', () => {
  test('a second proposal on the same requirement is refused', async ({ page, browser, users }) => {
    const title = uniqueTitle('duplicate');

    await signIn(page, users.client);
    const jobId = await publishAsClient(page, title);

    const provider = await pageAs(browser, users.provider);
    await submitProposal(provider, jobId);
    await expect(provider.getByTestId('proposal-status')).toBeVisible({ timeout: 40_000 });

    await submitProposal(provider, jobId);

    // The server's own wording, shown rather than replaced with a generic
    // failure — a provider needs to know why.
    await expect(provider.getByTestId('proposal-error')).toContainText(/already proposed/i, {
      timeout: 40_000,
    });

    await provider.context().close();
  });

  test('withdrawing is final — the provider cannot propose again', async ({
    page,
    browser,
    users,
  }) => {
    const title = uniqueTitle('withdraw');

    await signIn(page, users.client);
    const jobId = await publishAsClient(page, title);

    const provider = await pageAs(browser, users.provider);
    await submitProposal(provider, jobId);
    await expect(provider.getByTestId('proposal-status')).toBeVisible({ timeout: 40_000 });

    await provider.getByTestId('withdraw-proposal').click();
    await provider.getByTestId('confirm-withdraw').click();
    await expect(provider.getByTestId('proposal-status')).toHaveAttribute(
      'data-status',
      'WITHDRAWN',
      { timeout: 40_000 },
    );

    // The consequence of the unique constraint being absolute. The message
    // must name it: "you already have a proposal" reads as a bug to someone
    // looking at their own withdrawn one.
    await submitProposal(provider, jobId);
    await expect(provider.getByTestId('proposal-error')).toContainText(/withdrew/i, {
      timeout: 40_000,
    });

    await provider.context().close();
  });

  test('a withdrawn proposal stays visible to the client, marked', async ({
    page,
    browser,
    users,
  }) => {
    const title = uniqueTitle('withdrawn-visible');

    await signIn(page, users.client);
    const jobId = await publishAsClient(page, title);

    const provider = await pageAs(browser, users.provider);
    await submitProposal(provider, jobId);
    await expect(provider.getByTestId('proposal-status')).toBeVisible({ timeout: 40_000 });
    await provider.getByTestId('withdraw-proposal').click();
    await provider.getByTestId('confirm-withdraw').click();
    await expect(provider.getByTestId('proposal-status')).toHaveAttribute(
      'data-status',
      'WITHDRAWN',
      { timeout: 40_000 },
    );

    // Not filtered out. One the client has already read must not silently
    // disappear from the list they are deciding from.
    await page.goto(`/client/jobs/${jobId}`);
    const row = page.getByTestId('proposal-row').filter({ hasText: users.provider.name });
    await expect(row).toBeVisible({ timeout: 40_000 });
    await expect(row).toHaveAttribute('data-status', 'WITHDRAWN');

    await provider.context().close();
  });
});

test.describe('module 5 — proposals nobody else may reach', () => {
  test("a provider cannot open another provider's proposal", async ({ page, browser, users }) => {
    const title = uniqueTitle('idor');

    await signIn(page, users.client);
    const jobId = await publishAsClient(page, title);

    const author = await pageAs(browser, users.provider);
    await submitProposal(author, jobId);
    await expect(author.getByTestId('proposal-status')).toBeVisible({ timeout: 40_000 });
    const proposalId = new URL(author.url()).pathname.split('/').pop() as string;

    // A real id, guessed by another provider. The UUID is not authorization.
    const stranger = await pageAs(browser, users.otherProvider);
    await stranger.goto(`/provider/proposals/${proposalId}`);

    await expect(stranger.getByText(/proposal not found/i)).toBeVisible({ timeout: 40_000 });
    await expect(stranger.getByTestId('proposal-status')).toHaveCount(0);
    // Nothing of the offer leaks into the error state.
    await expect(stranger.getByText(COVER)).toHaveCount(0);

    await author.context().close();
    await stranger.context().close();
  });

  // A client reading another client's proposal is NOT tested here, and
  // deliberately. App.tsx gates /client/* to clients, so the only account
  // that could attempt it is the one client the fixtures create — who owns
  // the requirement, making the attempt legitimate. Adding a second client
  // just to drive a browser to a 403 would test the router, not the rule.
  // The rule itself is covered where it is enforced: getProposalOnOwnJob in
  // proposals.service.spec.ts, and the 403 in proposals.e2e.spec.ts.
});

test.describe('module 5 — requirements that cannot receive proposals', () => {
  test('a cancelled requirement refuses a proposal', async ({ page, browser, users }) => {
    const title = uniqueTitle('cancelled');

    await signIn(page, users.client);
    const jobId = await publishAsClient(page, title);

    await page.goto('/client/jobs');
    const row = page.getByTestId('requirement-row').filter({ hasText: title });
    await expect(row).toBeVisible({ timeout: 40_000 });
    await row.getByTestId('requirement-cancel').click();
    await expect(row).toHaveAttribute('data-status', 'CANCELLED', { timeout: 30_000 });

    // The form is reachable by URL, so this is the real check. It reads the
    // public requirement route, which stops returning a cancelled
    // requirement at all — so the provider gets "not found", deliberately
    // indistinguishable from one that never existed.
    const provider = await pageAs(browser, users.provider);
    await provider.goto(`/provider/submit-proposal/${jobId}`);

    // By role: the empty state's heading and its description both say this,
    // because the API's own 404 message is what fills the description.
    await expect(provider.getByRole('heading', { name: /requirement not found/i })).toBeVisible({
      timeout: 40_000,
    });
    await expect(provider.getByTestId('submit-proposal')).toHaveCount(0);

    await provider.context().close();
  });

  test('a filled requirement refuses a second proposal', async ({ page, browser, users }) => {
    const title = uniqueTitle('filled');

    await signIn(page, users.client);
    const jobId = await publishAsClient(page, title);

    const hired = await pageAs(browser, users.provider);
    await submitProposal(hired, jobId);
    await expect(hired.getByTestId('proposal-status')).toBeVisible({ timeout: 40_000 });

    await page.goto(`/client/jobs/${jobId}`);
    await page.getByTestId('proposal-row').first().click();
    await page.getByTestId('hire-provider').click();
    await page.getByTestId('confirm-hire').click();
    await expect(page.getByTestId('proposal-status')).toHaveAttribute('data-status', 'ACCEPTED', {
      timeout: 40_000,
    });

    // A different provider, arriving after the hire. This is the ordinary,
    // non-racing version of the case the integration tests cover: the
    // requirement's state is read now, not as discovery last showed it.
    const late = await pageAs(browser, users.otherProvider);
    await late.goto(`/provider/submit-proposal/${jobId}`);

    // Same rule as a cancelled one: filled requirements leave discovery, so
    // the public route no longer serves it.
    await expect(late.getByRole('heading', { name: /requirement not found/i })).toBeVisible({
      timeout: 40_000,
    });
    await expect(late.getByTestId('submit-proposal')).toHaveCount(0);

    await hired.context().close();
    await late.context().close();
  });
});
