import { test, expect, signIn } from './fixtures';
import { prisma } from './test-users';

// Saved Talent, through the browser against the real API: a client saves a
// provider from their public profile, sees them in the Saved Talent list,
// and unsaving removes them again. The provider's real Profile id comes
// straight from the database — there is no UI path from a fresh account to
// "a provider's profile page" that doesn't depend on Marketplace search
// already working, which is covered by its own suite (marketplace.spec.ts).
test.describe('saved talent', () => {
  test('a client can save a provider from their profile, and unsave again', async ({
    page,
    users,
  }) => {
    const db = prisma();
    const providerProfile = await db.profile.findUniqueOrThrow({
      where: { userId: users.provider.id },
    });

    await signIn(page, users.client);
    await page.goto(`/profile/${providerProfile.id}`);
    await expect(page.getByTestId('toggle-save-provider')).toHaveText('Save', { timeout: 40_000 });

    await page.getByTestId('toggle-save-provider').click();
    await expect(page.getByTestId('toggle-save-provider')).toHaveText('Saved', { timeout: 40_000 });

    await page.goto('/client/freelancers/saved');
    await expect(page.getByText(users.provider.name)).toBeVisible({ timeout: 40_000 });

    // Unsaving from the profile page removes it from the list too.
    await page.goto(`/profile/${providerProfile.id}`);
    await page.getByTestId('toggle-save-provider').click();
    await expect(page.getByTestId('toggle-save-provider')).toHaveText('Save', { timeout: 40_000 });

    await page.goto('/client/freelancers/saved');
    await expect(page.getByText(users.provider.name)).toHaveCount(0);

    await db.$disconnect();
  });
});
