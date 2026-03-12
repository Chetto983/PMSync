/**
 * Onboarding Wizard E2E Test
 *
 * Proves all 6 onboarding steps complete against a real backend using
 * test@pmsync.local which has onboardingComplete: false by default.
 *
 * ONCE-PER-SEED: The POST /onboarding/complete endpoint permanently sets
 * onboardingComplete: true. Re-run requires: `cd backend && npx prisma db seed`
 */

import { test, expect } from '@playwright/test';
import { authenticator } from 'otplib';

const ONBOARDING_USER_EMAIL = 'test@pmsync.local';
const ONBOARDING_USER_PASSWORD = 'UserPassword123!';
const ONBOARDING_AUTH_FILE = 'playwright/.auth/onboarding-user.json';

test.describe('Onboarding wizard', () => {
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    // Set cookie consent to prevent consent banner from blocking UI
    await page.addInitScript(() => {
      localStorage.setItem(
        'pmsync:cookie-consent',
        JSON.stringify({ necessary: true, analytics: false, marketing: false }),
      );
    });

    await page.goto('/auth/login', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    // Wait for the login form to be interactive
    await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 30_000 });
    await page.fill('input[name="email"], input[type="email"]', ONBOARDING_USER_EMAIL);
    await page.fill('input[name="password"], input[type="password"]', ONBOARDING_USER_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(onboarding|dashboard)/, { timeout: 30_000 });

    // Guard: if middleware sent us to /dashboard, onboardingComplete is already true.
    // No reset API exists — only `cd backend && npx prisma db seed` can reset it.
    if (page.url().includes('/dashboard')) {
      await ctx.close();
      test.skip(
        true,
        'test@pmsync.local already completed onboarding — run `cd backend && npx prisma db seed` to reset',
      );
      return;
    }

    await ctx.storageState({ path: ONBOARDING_AUTH_FILE });
    await ctx.close();
  });

  test('completes full onboarding wizard', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: ONBOARDING_AUTH_FILE });
    const page = await ctx.newPage();

    // Set cookie consent in this context too
    await page.addInitScript(() => {
      localStorage.setItem(
        'pmsync:cookie-consent',
        JSON.stringify({ necessary: true, analytics: false, marketing: false }),
      );
    });

    await page.goto('/onboarding', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/onboarding/);

    // ---------------------------------------------------------------
    // Step 1: Legal consent — TOS + Privacy Policy checkboxes
    // ---------------------------------------------------------------
    // Wait for the legal consent form to render (loading skeleton disappears)
    await expect(page.getByText('Terms & Privacy').first()).toBeVisible({ timeout: 15_000 });

    // Check TOS checkbox
    const tosCheckbox = page.getByRole('checkbox').first();
    await tosCheckbox.check({ force: true });

    // Check Privacy Policy checkbox
    const ppCheckbox = page.getByRole('checkbox').nth(1);
    await ppCheckbox.check({ force: true });

    // Click Continue
    await page.getByRole('button', { name: /continue/i }).click();

    // ---------------------------------------------------------------
    // Step 2: Name confirm — pre-filled with Test User
    // ---------------------------------------------------------------
    await expect(page.getByText('Confirm Your Name')).toBeVisible({ timeout: 10_000 });

    // Name fields should be pre-filled; just click Continue
    const firstNameInput = page.getByLabel(/first name/i);
    await expect(firstNameInput).toHaveValue('Test');

    const lastNameInput = page.getByLabel(/last name/i);
    await expect(lastNameInput).toHaveValue('User');

    await page.getByRole('button', { name: /continue/i }).click();

    // ---------------------------------------------------------------
    // Step 3: Workspace — user already has tenant, shows "ready" state
    // ---------------------------------------------------------------
    // The test user is seeded with a tenantId, so the workspace step
    // shows "Your workspace is ready" with a Continue button
    await expect(
      page.getByText(/workspace is ready|Create Your Workspace/i),
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /continue/i }).click();

    // ---------------------------------------------------------------
    // Step 4: Email provider — skip (no OAuth mock needed)
    // ---------------------------------------------------------------
    // Wait for auto-connect attempt to finish (spinner disappears)
    await expect(page.getByText(/connect your email|skip for now/i)).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: /skip for now/i }).click();

    // ---------------------------------------------------------------
    // Step 5: Avatar — skip
    // ---------------------------------------------------------------
    await expect(page.getByText('Add Your Photo')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /skip/i }).click();

    // ---------------------------------------------------------------
    // Step 6: MFA setup — enable TOTP via intercepted response
    // ---------------------------------------------------------------
    await expect(page.getByText('Secure Your Account')).toBeVisible({ timeout: 10_000 });

    // Set up route intercept BEFORE triggering enable to capture totpURI
    let totpUri = '';
    await page.route('**/two-factor/enable', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      totpUri = body.totpURI ?? '';
      await route.fulfill({ response });
    });

    // Click the Authenticator App card to start TOTP setup
    await page.getByText('Authenticator App').first().click();

    // Enter password phase
    await expect(page.getByLabel(/enter your password/i)).toBeVisible({ timeout: 10_000 });
    await page.getByLabel(/enter your password/i).fill(ONBOARDING_USER_PASSWORD);

    // Click Continue to submit password and trigger two-factor/enable
    await page.getByRole('button', { name: /continue/i }).click();

    // Wait for the QR code / verify phase to appear
    await expect(page.getByLabel(/enter 6-digit code/i)).toBeVisible({ timeout: 15_000 });

    // Generate TOTP code as late as possible (codes expire every 30s)
    expect(totpUri).toBeTruthy();
    const secret = new URL(totpUri).searchParams.get('secret')!;
    expect(secret).toBeTruthy();
    const code = authenticator.generate(secret);

    // Fill the OTP input
    await page.getByLabel(/enter 6-digit code/i).fill(code);

    // Click Verify
    await page.getByRole('button', { name: /verify/i }).click();

    // After verification succeeds, backup codes phase appears
    await expect(page.getByText(/backup codes/i)).toBeVisible({ timeout: 15_000 });

    // Click Continue to go back to choose screen
    await page.getByRole('button', { name: /continue/i }).click();

    // Now we should be back on the choose screen with TOTP configured
    await expect(page.getByText(/authenticator app configured/i)).toBeVisible({
      timeout: 10_000,
    });

    // Click "Get Started" (finish button on last step)
    await page.getByRole('button', { name: /get started/i }).click();

    // ---------------------------------------------------------------
    // Wizard completion — redirect to /dashboard
    // ---------------------------------------------------------------
    await page.waitForURL('**/dashboard**', { timeout: 30_000 });
    await expect(page).toHaveURL(/\/dashboard/);

    await ctx.close();
  });
});
