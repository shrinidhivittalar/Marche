import { test, expect, signIn } from './fixtures';
import { pageAs, publishRequirement, requirementIdFrom, uniqueTitle } from './journeys';

// Regression coverage for the audit finding: MessagesPage auto-opens the
// first conversation on load (so the chat panel isn't empty), but only
// openConversation's explicit click handler used to call markRead — so the
// auto-opened conversation displayed as read while staying unread
// server-side. Fixed by also marking it read when it's opened via the
// no-selection fallback, not just a click.
test.describe.configure({ timeout: 240_000 });

const COVER =
  'A proposal from the end-to-end suite, written long enough to clear the twenty character minimum.';

test.describe('messages', () => {
  test('the auto-opened first conversation is marked read, not just a clicked one', async ({
    page,
    browser,
    users,
  }) => {
    const title = uniqueTitle('messages');

    // Establish a real connection between client and provider.
    await signIn(page, users.client);
    await publishRequirement(page, title);
    const jobId = requirementIdFrom(page);

    const provider = await pageAs(browser, users.provider);
    await provider.goto(`/provider/submit-proposal/${jobId}`);
    await provider.getByTestId('proposal-price-input').fill('20000');
    await provider.getByTestId('proposal-days-input').fill('5');
    await provider.getByTestId('proposal-message-input').fill(COVER);
    await provider.getByTestId('submit-proposal').click();
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

    // Client sends a message — this is what the provider needs to see as
    // unread, then have it clear on its own once their Messages page opens.
    // Also covers a second audit finding: the sender's own active thread
    // panel used to keep showing the pre-send state after sending, because
    // usePolling let ticks overlap the manual post-send refetch and
    // useApiResource's generation guard discarded whichever response landed
    // second — under this dev setup requests routinely take longer than the
    // poll interval, so every response lost the race and the thread never
    // updated. Fixed by having usePolling skip a tick while the previous one
    // is still in flight.
    await page.goto('/messages');
    await expect(page.getByTestId('conversation-row').first()).toBeVisible({ timeout: 40_000 });
    await page.getByTestId('message-input').fill('Looking forward to working together!');
    await page.getByTestId('send-message').click();
    await expect(page.getByTestId('conversation-row').first()).toContainText(
      'Looking forward to working together!',
      { timeout: 20_000 },
    );
    await expect(page.getByTestId('message-bubble').last()).toContainText(
      'Looking forward to working together!',
      { timeout: 10_000 },
    );

    // Confirm the provider actually starts unread, from a screen that
    // doesn't touch Messages at all — before the fix's code path runs.
    await provider.goto('/provider/dashboard');
    await expect(provider.getByTestId('messages-unread-badge')).toBeVisible({ timeout: 40_000 });

    // The provider has exactly one conversation, so it's the one that
    // auto-opens with no click — this is the exact path the bug was in.
    // Never click a conversation row here; openConversation's own markRead
    // call must not be what's exercised.
    await provider.goto('/messages');
    await expect(provider.getByTestId('conversation-row').first()).toBeVisible({
      timeout: 40_000,
    });

    // The fix: without clicking the conversation row, the badge should
    // clear on its own because the auto-opened conversation gets marked
    // read too, not just an explicitly clicked one.
    await expect(provider.getByTestId('messages-unread-badge')).toHaveCount(0, {
      timeout: 20_000,
    });

    await provider.context().close();
  });
});
