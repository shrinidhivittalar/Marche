import { test, expect, signIn } from './fixtures';
import type { Page } from '@playwright/test';
import { uniqueTitle, pageAs, publishRequirement, requirementIdFrom } from './journeys';

// Disputes, through the browser against the real API: a client raises one
// on a real connection, the provider sees it, and an admin resolves it —
// after which both parties see the resolution instead of the open dispute.
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

test.describe('disputes', () => {
  test('a client raises a dispute, the provider sees it, and an admin resolves it', async ({
    page,
    browser,
    users,
  }) => {
    const title = uniqueTitle('dispute');

    await signIn(page, users.client);
    await publishRequirement(page, title);
    const jobId = requirementIdFrom(page);

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

    await page.goto('/client/jobs');
    await page.getByRole('button', { name: 'All contracts' }).click();
    const contractRow = page.getByTestId('contract-row').filter({ hasText: title });
    await expect(contractRow).toBeVisible({ timeout: 40_000 });
    await contractRow.getByTestId('manage-contract').click();
    const connectionId = requirementIdFrom(page);

    // Raise, as the client.
    await page.getByTestId('raise-dispute').click();
    await page
      .getByTestId('dispute-reason-input')
      .fill('The delivered work did not match the brief.');
    await page
      .getByTestId('dispute-evidence-input')
      .fill('See the message thread from the 5th onward.');
    await page.getByTestId('submit-dispute').click();
    await expect(page.getByTestId('active-dispute')).toHaveAttribute('data-status', 'OPEN', {
      timeout: 40_000,
    });

    // The provider, on their own copy of the same connection, sees it too.
    await provider.goto(`/contracts/${connectionId}`);
    await expect(provider.getByTestId('active-dispute')).toBeVisible({ timeout: 40_000 });
    await expect(provider.getByTestId('raise-dispute')).toHaveCount(0); // one active dispute already

    // An admin resolves it.
    const admin = await pageAs(browser, users.admin);
    await admin.goto('/admin/disputes');
    const disputeCard = admin.getByText('The delivered work did not match the brief.');
    await expect(disputeCard).toBeVisible({ timeout: 40_000 });
    await admin.getByTestId('resolve-dispute').first().click();
    await admin.getByTestId('resolution-input').fill('Provider agreed to a partial refund.');
    await admin.getByRole('button', { name: 'Mark Resolved' }).click();
    await expect(admin.getByText('Provider agreed to a partial refund.')).toBeVisible({
      timeout: 40_000,
    });

    // Both parties now see it resolved instead of active.
    await page.reload();
    await expect(page.getByTestId('active-dispute')).toHaveCount(0);
    await expect(page.getByTestId('raise-dispute')).toBeVisible({ timeout: 40_000 });
    await expect(page.getByText('Provider agreed to a partial refund.')).toBeVisible();

    await provider.context().close();
    await admin.context().close();
  });
});
