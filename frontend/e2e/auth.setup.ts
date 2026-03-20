/**
 * Authentication Setup Project
 *
 * Creates reusable storageState for other tests.
 * Authenticates through the real login flow so the frontend test suite stays
 * isolated from backend source imports and direct database access.
 */

import { expect, test as setup } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';
const TEST_USER_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@pmsync.local';
const TEST_USER_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'TestPassword123!';

setup('authenticate', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'pmsync:cookie-consent',
      JSON.stringify({ necessary: true, analytics: false, marketing: false }),
    );
  });

  await page.goto('/auth/login', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 30_000 });
  await page.fill('input[name="email"], input[type="email"]', TEST_USER_EMAIL);
  await page.fill('input[name="password"], input[type="password"]', TEST_USER_PASSWORD);
  await page.click('button[type="submit"]');

  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 30_000 });

  // If user hasn't completed onboarding, walk through the wizard via UI
  if (page.url().includes('/onboarding')) {
    // Wait for the onboarding page to fully load
    await page.waitForLoadState('networkidle');

    // Check if we need to accept Terms & Privacy (Step 1)
    const tosCheckbox = page.getByRole('checkbox').first();
    if (await tosCheckbox.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Accept TOS checkbox
      await tosCheckbox.check({ force: true });
      // Accept Privacy Policy checkbox
      const ppCheckbox = page.getByRole('checkbox').nth(1);
      await ppCheckbox.check({ force: true });

      // The wizard shows "Get Started" for already-onboarded users who only
      // need legal acceptance, or "Continue" for the full onboarding flow.
      const getStartedBtn = page.getByRole('button', { name: /get started/i });
      const continueBtn = page.getByRole('button', { name: /continue/i });

      if (await getStartedBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await getStartedBtn.click();
      } else if (await continueBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await continueBtn.click();
      }
    }

    // Step 2: Name confirm -- just click Continue (pre-filled)
    const nameHeading = page.getByText('Confirm Your Name');
    if (await nameHeading.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await page.getByRole('button', { name: /continue/i }).click();
    }

    // Step 3: Workspace -- click Continue
    const wsText = page.getByText(/workspace is ready|Create Your Workspace/i);
    if (await wsText.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await page.getByRole('button', { name: /continue/i }).click();
    }

    // Step 4: Email provider -- skip
    const skipEmail = page.getByRole('button', { name: /skip for now/i });
    if (await skipEmail.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await skipEmail.click();
    }

    // Step 5: Avatar -- skip
    const skipAvatar = page.getByRole('button', { name: /skip/i });
    if (await skipAvatar.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await skipAvatar.click();
    }

    // Step 6: Security -- click "Get Started" to finish
    const getStartedFinal = page.getByRole('button', { name: /get started/i });
    if (await getStartedFinal.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await getStartedFinal.click();
    }

    // Wait for redirect to dashboard
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    console.log(`after onboarding wizard, URL is: ${page.url()}`);
  }

  await expect(page).toHaveURL(/\/dashboard/);
  await page.context().storageState({ path: authFile });
});
