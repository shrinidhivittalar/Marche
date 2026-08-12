import { test, expect, signIn } from './fixtures';
import type { Page } from '@playwright/test';
import { uniqueTitle, pageAs, publishRequirement, requirementIdFrom } from './journeys';

// Module 6 (Notifications) through the browser against the real API.
//
// The rule worth testing through the browser, for every event, is the same
// one: the right person sees it, it says the right thing, and clicking it
// goes to the right place. That's the part a unit test of NotificationsService
// (apps/api/src/notifications/tests/notifications.service.spec.ts) can't see —
// it proves a row was created with the right recipientUserId, not that the
// person signed in as that user ever finds it.
//
// Read-state rules (mark-as-read, mark-all-read, IDOR) are already covered at
// the API layer in the same spec file. What's missing there, and covered
// here, is that the UI actually calls those endpoints and reflects the
// result — see the "the bell and the page agree" test, which exists because
// an earlier version of this wiring had two independent fetches that didn't.

const COVER =
  'A proposal from the end-to-end suite, written long enough to clear the twenty character minimum.';

// Same reasoning as proposals.spec.ts: every step is a real round trip to a
// hosted database, and several of these tests drive two signed-in contexts
// through a five-step wizard plus a submission and a decision.
test.describe.configure({ timeout: 180_000 });

async function publishAsClient(page: Page, title: string): Promise<string> {
  await publishRequirement(page, title);
  return requirementIdFrom(page);
}

async function submitProposal(provider: Page, jobId: string) {
  await provider.goto(`/provider/submit-proposal/${jobId}`);
  await provider.getByTestId('proposal-price-input').fill('20000');
  await provider.getByTestId('proposal-days-input').fill('5');
  await provider.getByTestId('proposal-message-input').fill(COVER);
  await provider.getByTestId('submit-proposal').click();
  await expect(provider.getByTestId('proposal-status')).toBeVisible({ timeout: 40_000 });
  return new URL(provider.url()).pathname.split('/').pop() as string;
}

/** Opens the bell dropdown and returns its notification items. */
function openBell(page: Page) {
  return page.getByTestId('notifications-bell').click();
}

/**
 * The bell's current unread count, or 0 if the badge isn't rendered at all
 * (it disappears entirely at zero — see Sidebar.tsx).
 *
 * users.client is shared across every test in this file (and beyond — see
 * fixtures.ts), so its unread count is never guaranteed to start at zero:
 * earlier tests in this same run leave their own unread notifications
 * behind. Reading a baseline and asserting the *change* is what the rest of
 * this suite already does for everything else (unique titles, not absolute
 * counts) — this is that same rule applied to a number instead of a row.
 *
 * networkidle first: called right after signIn, before AppContext's
 * fetch-on-mount for the unread count has necessarily resolved. Reading the
 * badge before that lands here reads "0" (not rendered yet) rather than the
 * real accumulated total — a stale baseline that then makes a correct
 * assertion fail against the real, larger number.
 */
async function unreadBadgeCount(page: Page): Promise<number> {
  await page.waitForLoadState('networkidle').catch(() => {});
  const badge = page.getByTestId('notifications-unread-badge');
  if ((await badge.count()) === 0) return 0;
  return Number(await badge.textContent());
}

test.describe('module 6 — the right person gets notified', () => {
  test('a provider submitting a proposal notifies the client, and it opens the offer', async ({
    page,
    browser,
    users,
  }) => {
    const title = uniqueTitle('notif-submit');
    await signIn(page, users.client);
    const jobId = await publishAsClient(page, title);

    const provider = await pageAs(browser, users.provider);
    const proposalId = await submitProposal(provider, jobId);

    await page.reload();
    await openBell(page);
    const item = page.getByTestId('notification-dropdown-item').filter({
      hasText: 'New proposal received',
    });
    await expect(item).toBeVisible({ timeout: 40_000 });
    await expect(item).toHaveAttribute('data-type', 'PROPOSAL_SUBMITTED');
    await expect(item).toHaveAttribute('data-unread', 'true');

    await item.click();
    await expect(page).toHaveURL(new RegExp(`/client/proposals/${proposalId}$`));
    await expect(page.getByTestId('hire-provider')).toBeVisible({ timeout: 40_000 });

    await provider.context().close();
  });

  test('accepting a proposal fires two events for the provider and one for the client', async ({
    page,
    browser,
    users,
  }) => {
    const title = uniqueTitle('notif-accept');
    await signIn(page, users.client);
    const jobId = await publishAsClient(page, title);

    const provider = await pageAs(browser, users.provider);
    await submitProposal(provider, jobId);

    await page.goto(`/client/jobs/${jobId}`);
    await page.getByTestId('proposal-row').first().click();
    await page.getByTestId('hire-provider').click();
    await page.getByTestId('confirm-hire').click();
    await expect(page.getByTestId('proposal-status')).toHaveAttribute('data-status', 'ACCEPTED', {
      timeout: 40_000,
    });
    const proposalId = new URL(page.url()).pathname.split('/').pop() as string;

    // Two distinct events, not one collapsed notification (a locked product
    // decision — see the module6 planning conversation): the acceptance and
    // the connection it opens are different facts.
    await provider.reload();
    await openBell(provider);
    const acceptedItem = provider.getByTestId('notification-dropdown-item').filter({
      hasText: 'Proposal accepted',
    });
    const connectedItem = provider.getByTestId('notification-dropdown-item').filter({
      hasText: 'Connection established',
    });
    await expect(acceptedItem).toBeVisible({ timeout: 40_000 });
    await expect(connectedItem).toBeVisible({ timeout: 40_000 });

    await acceptedItem.click();
    await expect(provider).toHaveURL(new RegExp(`/provider/proposals/${proposalId}$`));

    // The client gets the connection event too — both parties, one event.
    await page.reload();
    await openBell(page);
    await expect(
      page.getByTestId('notification-dropdown-item').filter({ hasText: 'Connection established' }),
    ).toBeVisible({ timeout: 40_000 });

    await provider.context().close();
  });

  test('declining a proposal notifies the provider, and it opens their own view of it', async ({
    page,
    browser,
    users,
  }) => {
    const title = uniqueTitle('notif-reject');
    await signIn(page, users.client);
    const jobId = await publishAsClient(page, title);

    const provider = await pageAs(browser, users.provider);
    const proposalId = await submitProposal(provider, jobId);

    await page.goto(`/client/jobs/${jobId}`);
    await page.getByTestId('proposal-row').first().click();
    await page.getByTestId('decline-proposal').click();
    await expect(page.getByTestId('proposal-status')).toHaveAttribute('data-status', 'REJECTED', {
      timeout: 40_000,
    });

    await provider.reload();
    await openBell(provider);
    const item = provider.getByTestId('notification-dropdown-item').filter({
      hasText: 'Proposal rejected',
    });
    await expect(item).toBeVisible({ timeout: 40_000 });
    await item.click();
    await expect(provider).toHaveURL(new RegExp(`/provider/proposals/${proposalId}$`));

    await provider.context().close();
  });

  test('cancelling a requirement notifies the provider who proposed, not one who never did', async ({
    page,
    browser,
    users,
  }) => {
    const title = uniqueTitle('notif-cancel');
    await signIn(page, users.client);
    const jobId = await publishAsClient(page, title);

    const proposer = await pageAs(browser, users.provider);
    await submitProposal(proposer, jobId);

    // Never proposes — the negative half of this test.
    const bystander = await pageAs(browser, users.otherProvider);

    await page.goto('/client/jobs');
    const row = page.getByTestId('requirement-row').filter({ hasText: title });
    await expect(row).toBeVisible({ timeout: 40_000 });
    await row.getByTestId('requirement-cancel').click();
    await expect(row).toHaveAttribute('data-status', 'CANCELLED', { timeout: 30_000 });

    await proposer.reload();
    await openBell(proposer);
    const item = proposer.getByTestId('notification-dropdown-item').filter({
      hasText: 'Requirement cancelled',
    });
    await expect(item).toBeVisible({ timeout: 40_000 });
    await item.click();
    await expect(proposer).toHaveURL(new RegExp(`/provider/jobs/${jobId}$`));

    // The bystander proposed on nothing, so there is nothing to tell them.
    await bystander.reload();
    await openBell(bystander);
    await expect(bystander.getByTestId('notifications-dropdown-empty')).toBeVisible({
      timeout: 40_000,
    });

    await proposer.context().close();
    await bystander.context().close();
  });
});

test.describe('module 6 — read state', () => {
  test('the bell and the page agree after Mark All as Read', async ({ page, browser, users }) => {
    const title = uniqueTitle('notif-read-state');
    await signIn(page, users.client);
    const before = await unreadBadgeCount(page);
    const jobId = await publishAsClient(page, title);

    const provider = await pageAs(browser, users.provider);
    await submitProposal(provider, jobId);

    await page.reload();
    await expect(page.getByTestId('notifications-unread-badge')).toHaveText(String(before + 1), {
      timeout: 40_000,
    });

    // Client-side navigation, not a second hard reload: the httpOnly
    // refresh-token cookie is single-use and rotating (see fixtures.ts), so
    // a hard reload right after another one races the app's own silent
    // refresh. The rest of this app's screens are reached the same way.
    await openBell(page);
    await page.getByTestId('view-all-notifications').click();
    await expect(page).toHaveURL(/\/notifications$/);

    // .first(), not a text filter: users.client is shared (see
    // unreadBadgeCount above), so an earlier test in this file may have left
    // its own "New proposal received" row behind. Newest first (createdAt
    // DESC) puts the one this test just created at the top.
    const row = page.getByTestId('notification-row').first();
    await expect(row).toHaveAttribute('data-unread', 'true');

    await page.getByTestId('mark-all-read').click();

    // The sidebar's badge and the page's own row share one fetch (see
    // AppContext.tsx's apiNotificationsList) — this is what that sharing is
    // for. No reload; if it needed one, the two would still disagree the
    // instant this test finished clicking.
    await expect(page.getByTestId('notifications-unread-badge')).toHaveCount(0, {
      timeout: 40_000,
    });
    await expect(row).toHaveAttribute('data-unread', 'false');

    await provider.context().close();
  });

  test('marking one notification read leaves the others alone', async ({
    page,
    browser,
    users,
  }) => {
    const titleA = uniqueTitle('notif-single-a');
    const titleB = uniqueTitle('notif-single-b');
    await signIn(page, users.client);
    const before = await unreadBadgeCount(page);
    const jobIdA = await publishAsClient(page, titleA);
    const jobIdB = await publishAsClient(page, titleB);

    const provider = await pageAs(browser, users.provider);
    await submitProposal(provider, jobIdA);
    await submitProposal(provider, jobIdB);

    await page.reload();
    await expect(page.getByTestId('notifications-unread-badge')).toHaveText(String(before + 2), {
      timeout: 40_000,
    });

    await openBell(page);
    await page.getByTestId('view-all-notifications').click();
    await expect(page).toHaveURL(/\/notifications$/);

    // Newest first (createdAt DESC) — one of the two just created, not an
    // older leftover from an earlier test in this file.
    await page.getByTestId('notification-row').first().click();

    await expect(page.getByTestId('notifications-unread-badge')).toHaveText(String(before + 1), {
      timeout: 40_000,
    });

    await provider.context().close();
  });
});
