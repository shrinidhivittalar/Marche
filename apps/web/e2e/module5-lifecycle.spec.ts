import { test, expect, signIn } from './fixtures';
import type { Page } from '@playwright/test';
import { uniqueTitle, pageAs, publishRequirement, requirementIdFrom } from './journeys';
import { prisma } from './test-users';

// Messaging, connection completion, and reviews — through the browser
// against the real API. Everything downstream of a hire (module5.md's
// second half): a message reaching the other person, a connection moving
// ACTIVE -> COMPLETED, and each party reviewing the other.
//
// One long journey rather than three separate tests: each stage only makes
// sense once the previous one has happened (there is no messaging without a
// connection, no reviewing without COMPLETED), so splitting them would mean
// re-doing the hire three times for no extra coverage.
//
// Deliberately NOT here: the 14-day reveal window (ReviewsService's
// REVEAL_WINDOW_DAYS) and the 3-day auto-complete grace period
// (ConnectionsRepository's AUTO_COMPLETE_GRACE_DAYS) — Playwright cannot
// wait real days, and both are already covered directly in
// reviews.service.spec.ts / proposals.repository.spec.ts. What this suite
// covers instead is the immediate half of "blind until both sides submit":
// visible once the sibling review exists, without waiting on the clock at
// all.
test.describe.configure({ timeout: 240_000 });

const COVER =
  'A proposal from the end-to-end suite, written long enough to clear the twenty character minimum.';

async function submitProposal(provider: Page, jobId: string) {
  await provider.goto(`/provider/submit-proposal/${jobId}`);
  await provider.getByTestId('proposal-price-input').fill('20000');
  await provider.getByTestId('proposal-days-input').fill('5');
  await provider.getByTestId('proposal-message-input').fill(COVER);
  await provider.getByTestId('submit-proposal').click();
}

test.describe('module 5 — messaging, completion and reviews', () => {
  test('a hired connection can message, complete, and both sides can review each other', async ({
    page,
    browser,
    users,
  }) => {
    const title = uniqueTitle('lifecycle');
    const db = prisma();

    await signIn(page, users.client);
    const jobId = await publishRequirement(page, title).then(() => requirementIdFrom(page));

    const provider = await pageAs(browser, users.provider);
    await submitProposal(provider, jobId);
    await expect(provider.getByTestId('proposal-status')).toBeVisible({ timeout: 40_000 });

    await page.goto(`/client/jobs/${jobId}`);
    const proposalRow = page.getByTestId('proposal-row').filter({ hasText: users.provider.name });
    await expect(proposalRow).toBeVisible({ timeout: 40_000 });
    await proposalRow.click();
    await page.getByTestId('hire-provider').click();
    await page.getByTestId('confirm-hire').click();
    await expect(page.getByTestId('proposal-status')).toHaveAttribute('data-status', 'ACCEPTED', {
      timeout: 40_000,
    });

    // Reach the connection this produced through the client's Contracts tab
    // — accepting itself stays on the proposal screen and says nothing
    // about where the connection lives.
    await page.goto('/client/jobs');
    await page.getByRole('button', { name: 'All contracts' }).click();
    const contractRow = page.getByTestId('contract-row').filter({ hasText: title });
    await expect(contractRow).toBeVisible({ timeout: 40_000 });
    await contractRow.getByTestId('manage-contract').click();
    // requirementIdFrom just reads the last URL segment — works for any
    // detail page with an id in its path, not only a requirement's.
    const connectionId = requirementIdFrom(page);
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-status', 'ACTIVE', {
      timeout: 40_000,
    });

    // ---------------------------------------------------------------------
    // Messaging
    // ---------------------------------------------------------------------
    await page.goto('/messages');
    const clientConvo = page.getByTestId('conversation-row').filter({ hasText: title });
    await expect(clientConvo).toBeVisible({ timeout: 40_000 });
    await clientConvo.click();
    await page.getByTestId('message-input').fill('Can you arrive an hour earlier?');
    await page.getByTestId('send-message').click();
    await expect(
      page.getByTestId('message-bubble').filter({ hasText: 'Can you arrive an hour earlier?' }),
    ).toBeVisible({ timeout: 40_000 });

    await provider.goto('/messages');
    const providerConvo = provider.getByTestId('conversation-row').filter({ hasText: title });
    await expect(providerConvo).toBeVisible({ timeout: 40_000 });
    await providerConvo.click();
    await expect(
      provider.getByTestId('message-bubble').filter({ hasText: 'Can you arrive an hour earlier?' }),
    ).toBeVisible({ timeout: 40_000 });
    await provider.getByTestId('message-input').fill('Sure, see you at 5.');
    await provider.getByTestId('send-message').click();

    // The client's page is still open on the thread — reload rather than
    // wait out the poll interval, so the assertion doesn't depend on timing.
    await page.reload();
    await expect(
      page.getByTestId('message-bubble').filter({ hasText: 'Sure, see you at 5.' }),
    ).toBeVisible({ timeout: 40_000 });

    // ---------------------------------------------------------------------
    // Completion
    // ---------------------------------------------------------------------
    // The wizard never sets an event date (journeys.ts's fillWizard leaves
    // it empty), and confirming completion requires one that has passed —
    // not choosable through the date picker's own min-date guard, so this
    // sets it directly, the same way test-users.ts stamps emailVerifiedAt
    // for what the UI itself cannot produce.
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await db.job.update({ where: { id: jobId }, data: { eventDate: yesterday } });

    await page.goto(`/contracts/${connectionId}`);
    await expect(page.getByTestId('confirm-complete')).toBeVisible({ timeout: 40_000 });
    await page.getByTestId('confirm-complete').click();
    await expect(page.getByTestId('connection-status')).toHaveAttribute(
      'data-status',
      'COMPLETED',
      {
        timeout: 40_000,
      },
    );

    // ---------------------------------------------------------------------
    // Reviews
    // ---------------------------------------------------------------------
    await page.getByTestId('review-rating-5').click();
    await page.getByTestId('review-comment-input').fill('Delivered exactly what was promised.');
    await page.getByTestId('submit-review').click();
    await expect(page.getByTestId('my-review')).toHaveAttribute('data-rating', '5', {
      timeout: 40_000,
    });

    const connection = await db.connection.findUniqueOrThrow({
      where: { jobId },
      select: { providerProfileId: true },
    });

    // Blind until both sides review: the provider hasn't reviewed back yet,
    // so the client's review must not be public on the provider's profile.
    await page.goto(`/profile/${connection.providerProfileId}`);
    await expect(page.getByTestId('public-stats-unavailable')).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId('public-rating')).toHaveCount(0);

    // The provider reviews back — both sides have now reviewed, so the
    // client's review becomes visible on the provider's public profile.
    await provider.goto(`/contracts/${connectionId}`);
    await provider.getByTestId('review-rating-4').click();
    await provider.getByTestId('review-comment-input').fill('Clear brief, paid on time.');
    await provider.getByTestId('submit-review').click();
    await expect(provider.getByTestId('my-review')).toHaveAttribute('data-rating', '4', {
      timeout: 40_000,
    });

    await page.goto(`/profile/${connection.providerProfileId}`);
    await expect(page.getByTestId('public-rating')).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId('public-reviews')).toContainText(
      'Delivered exactly what was promised.',
    );

    await provider.context().close();
    await db.$disconnect();
  });
});
