/**
 * Onboarding Wizard E2E Tests (FE-02)
 *
 * Tests all 6 onboarding steps with exhaustive error coverage:
 * - Legal consent validation (both checkboxes required)
 * - Name field validation (empty name error)
 * - Workspace step (ready or create state)
 * - Email provider skip behavior
 * - Avatar skip behavior
 * - MFA setup with TOTP (full happy path)
 * - MFA requirement validation (cannot skip)
 * - Back navigation between steps
 *
 * Uses fresh user registration per test run (timestamped email).
 * No prisma db seed dependency.
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';

function generateTotpCode(secret: string): Promise<string> {
  const instance = new TOTP({
    crypto: new NobleCryptoPlugin(),
    base32: new ScureBase32Plugin(),
    secret,
  });
  return instance.generate();
}

const timestamp = Date.now();
const FRESH_USER_EMAIL = `test+${timestamp}@pmsync.local`;
const FRESH_USER_PASSWORD = 'TestPassword123!';
const FRESH_USER_FIRST_NAME = 'E2ETest';
const FRESH_USER_LAST_NAME = 'User';

/**
 * Inject cookie consent into page context to prevent consent banner
 * from blocking UI interactions.
 */
async function injectCookieConsent(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      'pmsync:cookie-consent',
      JSON.stringify({ necessary: true, analytics: false, marketing: false }),
    );
  });
}

/**
 * Register a fresh user via the auth API and log in via UI.
 * Returns the page landed on after login (/onboarding or /dashboard).
 */
async function registerAndLogin(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await injectCookieConsent(page);

  // Register via API
  const signUpRes = await page.request.post('/api/auth/sign-up/email', {
    data: {
      email: FRESH_USER_EMAIL,
      password: FRESH_USER_PASSWORD,
      name: `${FRESH_USER_FIRST_NAME} ${FRESH_USER_LAST_NAME}`,
    },
  });

  // If registration fails (e.g., email verification required before login),
  // fall back to the sign-in attempt anyway -- the user might already exist.
  if (!signUpRes.ok()) {
    console.warn(`[onboarding] Registration returned ${signUpRes.status()}, attempting login anyway`);
  }

  // Log in via UI
  await page.goto('/auth/login', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 30_000 });
  await page.fill('input[name="email"], input[type="email"]', FRESH_USER_EMAIL);
  await page.fill('input[name="password"], input[type="password"]', FRESH_USER_PASSWORD);
  await page.click('button[type="submit"]');

  await page.waitForURL(/\/(onboarding|dashboard)/, { timeout: 30_000 });
  return page;
}

// Use empty storage state -- tests create their own auth via fresh registration
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Onboarding Wizard', () => {
  /**
   * Helper: navigate to /onboarding with a fresh context.
   * Re-used across tests that need an independent wizard session.
   */
  async function getOnboardingPage(browser: import('@playwright/test').Browser): Promise<{
    page: Page;
    context: BrowserContext;
  }> {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await registerAndLogin(context);

    if (page.url().includes('/dashboard')) {
      await context.close();
      test.skip(true, 'Fresh user already completed onboarding -- cannot test wizard');
      // Unreachable but keeps TS happy
      return { page, context };
    }

    return { page, context };
  }

  test('step 1: legal consent - cannot proceed without accepting both checkboxes', async ({
    browser,
  }) => {
    const { page, context } = await getOnboardingPage(browser);

    try {
      await expect(page).toHaveURL(/\/onboarding/);

      // Wait for the legal consent step to load
      await expect(page.getByText('Terms & Privacy').first()).toBeVisible({ timeout: 15_000 });

      // The submit button should be disabled when no checkboxes are checked
      const submitButton = page.locator('button[type="submit"]');
      await expect(submitButton).toBeDisabled();

      // Check warning text about accepting both documents
      await expect(page.getByText(/must accept both/i)).toBeVisible();

      // Check only TOS -- should still be disabled
      const tosCheckbox = page.getByRole('checkbox').first();
      await tosCheckbox.check({ force: true });
      await expect(submitButton).toBeDisabled();

      // Check Privacy too -- should now be enabled
      const ppCheckbox = page.getByRole('checkbox').nth(1);
      await ppCheckbox.check({ force: true });
      await expect(submitButton).toBeEnabled();
    } finally {
      await context.close();
    }
  });

  test('step 1: legal consent - terms and privacy links are clickable', async ({ browser }) => {
    const { page, context } = await getOnboardingPage(browser);

    try {
      await expect(page.getByText('Terms & Privacy').first()).toBeVisible({ timeout: 15_000 });

      // The "(Read)" links should be visible for both TOS and Privacy Policy
      const readLinks = page.getByText('(Read)');
      await expect(readLinks.first()).toBeVisible();
      await expect(readLinks.nth(1)).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('step 2: name confirm - shows pre-filled name fields', async ({ browser }) => {
    const { page, context } = await getOnboardingPage(browser);

    try {
      // Complete step 1 (legal consent)
      await expect(page.getByText('Terms & Privacy').first()).toBeVisible({ timeout: 15_000 });
      await page.getByRole('checkbox').first().check({ force: true });
      await page.getByRole('checkbox').nth(1).check({ force: true });
      await page.locator('button[type="submit"]').click();

      // Step 2: Name confirm
      await expect(page.getByText('Confirm Your Name')).toBeVisible({ timeout: 10_000 });

      // Name fields should be pre-filled from registration
      const firstNameInput = page.getByLabel(/first name/i);
      const lastNameInput = page.getByLabel(/last name/i);
      await expect(firstNameInput).toBeVisible();
      await expect(lastNameInput).toBeVisible();

      // Verify fields have values (from registration)
      const firstNameValue = await firstNameInput.inputValue();
      const lastNameValue = await lastNameInput.inputValue();
      expect(firstNameValue.length).toBeGreaterThan(0);
      expect(lastNameValue.length).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });

  test('step 2: name confirm - validates empty name fields', async ({ browser }) => {
    const { page, context } = await getOnboardingPage(browser);

    try {
      // Complete step 1
      await expect(page.getByText('Terms & Privacy').first()).toBeVisible({ timeout: 15_000 });
      await page.getByRole('checkbox').first().check({ force: true });
      await page.getByRole('checkbox').nth(1).check({ force: true });
      await page.locator('button[type="submit"]').click();

      // Step 2
      await expect(page.getByText('Confirm Your Name')).toBeVisible({ timeout: 10_000 });

      // Clear first name
      const firstNameInput = page.getByLabel(/first name/i);
      await firstNameInput.clear();

      // Clear last name too
      const lastNameInput = page.getByLabel(/last name/i);
      await lastNameInput.clear();

      // The submit button should be disabled when names are empty
      // (canSubmit = firstName.trim().length > 0 && lastName.trim().length > 0)
      const submitButton = page.locator('button[type="submit"]');
      await expect(submitButton).toBeDisabled();

      // Restore first name and verify button still disabled (last name empty)
      await firstNameInput.fill('TestRestore');
      await expect(submitButton).toBeDisabled();

      // Restore last name too -- button should be enabled
      await lastNameInput.fill('UserRestore');
      await expect(submitButton).toBeEnabled();
    } finally {
      await context.close();
    }
  });

  test('step 3: workspace - shows workspace ready or create state', async ({ browser }) => {
    const { page, context } = await getOnboardingPage(browser);

    try {
      // Complete step 1
      await expect(page.getByText('Terms & Privacy').first()).toBeVisible({ timeout: 15_000 });
      await page.getByRole('checkbox').first().check({ force: true });
      await page.getByRole('checkbox').nth(1).check({ force: true });
      await page.locator('button[type="submit"]').click();

      // Complete step 2
      await expect(page.getByText('Confirm Your Name')).toBeVisible({ timeout: 10_000 });
      await page.locator('button[type="submit"]').click();

      // Step 3: Workspace
      await expect(
        page.getByText(/workspace is ready|Create Your Workspace/i),
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await context.close();
    }
  });

  test('step 4: email provider - can skip', async ({ browser }) => {
    const { page, context } = await getOnboardingPage(browser);

    try {
      // Complete steps 1-3
      await expect(page.getByText('Terms & Privacy').first()).toBeVisible({ timeout: 15_000 });
      await page.getByRole('checkbox').first().check({ force: true });
      await page.getByRole('checkbox').nth(1).check({ force: true });
      await page.locator('button[type="submit"]').click();

      await expect(page.getByText('Confirm Your Name')).toBeVisible({ timeout: 10_000 });
      await page.locator('button[type="submit"]').click();

      await expect(
        page.getByText(/workspace is ready|Create Your Workspace/i),
      ).toBeVisible({ timeout: 10_000 });
      // Workspace step: click Continue if "ready" or create if needed
      await page.getByRole('button', { name: /continue/i }).click();

      // Step 4: Email provider
      await expect(page.getByRole('heading', { name: /connect your email/i })).toBeVisible({
        timeout: 15_000,
      });

      // Click "Skip for now"
      await page.getByRole('button', { name: /skip for now/i }).click();

      // Should advance to step 5 (Avatar)
      await expect(page.getByText('Add Your Photo')).toBeVisible({ timeout: 10_000 });
    } finally {
      await context.close();
    }
  });

  test('step 5: avatar - can skip', async ({ browser }) => {
    const { page, context } = await getOnboardingPage(browser);

    try {
      // Complete steps 1-4 (skip email provider)
      await expect(page.getByText('Terms & Privacy').first()).toBeVisible({ timeout: 15_000 });
      await page.getByRole('checkbox').first().check({ force: true });
      await page.getByRole('checkbox').nth(1).check({ force: true });
      await page.locator('button[type="submit"]').click();

      await expect(page.getByText('Confirm Your Name')).toBeVisible({ timeout: 10_000 });
      await page.locator('button[type="submit"]').click();

      await expect(
        page.getByText(/workspace is ready|Create Your Workspace/i),
      ).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: /continue/i }).click();

      await expect(page.getByRole('heading', { name: /connect your email/i })).toBeVisible({
        timeout: 15_000,
      });
      await page.getByRole('button', { name: /skip for now/i }).click();

      // Step 5: Avatar
      await expect(page.getByText('Add Your Photo')).toBeVisible({ timeout: 10_000 });

      // Click Skip
      await page.getByRole('button', { name: /skip/i }).click();

      // Should advance to step 6 (MFA)
      await expect(page.getByText('Secure Your Account')).toBeVisible({ timeout: 10_000 });
    } finally {
      await context.close();
    }
  });

  test('step 6: MFA setup - finish button requires at least one method', async ({ browser }) => {
    const { page, context } = await getOnboardingPage(browser);

    try {
      // Complete steps 1-5 (skip email + avatar)
      await expect(page.getByText('Terms & Privacy').first()).toBeVisible({ timeout: 15_000 });
      await page.getByRole('checkbox').first().check({ force: true });
      await page.getByRole('checkbox').nth(1).check({ force: true });
      await page.locator('button[type="submit"]').click();

      await expect(page.getByText('Confirm Your Name')).toBeVisible({ timeout: 10_000 });
      await page.locator('button[type="submit"]').click();

      await expect(
        page.getByText(/workspace is ready|Create Your Workspace/i),
      ).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: /continue/i }).click();

      await expect(page.getByRole('heading', { name: /connect your email/i })).toBeVisible({
        timeout: 15_000,
      });
      await page.getByRole('button', { name: /skip for now/i }).click();

      await expect(page.getByText('Add Your Photo')).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: /skip/i }).click();

      // Step 6: MFA
      await expect(page.getByText('Secure Your Account')).toBeVisible({ timeout: 10_000 });

      // The finish/Get Started button should be DISABLED until MFA is configured
      // (canFinish = totpConfigured || passkeyConfigured)
      const finishButton = page.getByRole('button', { name: /get started|continue/i }).last();
      await expect(finishButton).toBeDisabled();

      // Warning about needing at least one method
      await expect(page.getByText(/must configure at least one method/i)).toBeVisible();

      // Authenticator App and Passkey options should be available
      await expect(page.getByText('Authenticator App').first()).toBeVisible();
      await expect(page.getByText('Passkey').first()).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('completes full wizard with MFA setup', async ({ browser }) => {
    const { page, context } = await getOnboardingPage(browser);

    try {
      // Step 1: Legal consent
      await expect(page.getByText('Terms & Privacy').first()).toBeVisible({ timeout: 15_000 });
      await page.getByRole('checkbox').first().check({ force: true });
      await page.getByRole('checkbox').nth(1).check({ force: true });
      await page.locator('button[type="submit"]').click();

      // Step 2: Name confirm
      await expect(page.getByText('Confirm Your Name')).toBeVisible({ timeout: 10_000 });
      await page.locator('button[type="submit"]').click();

      // Step 3: Workspace
      await expect(
        page.getByText(/workspace is ready|Create Your Workspace/i),
      ).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: /continue/i }).click();

      // Step 4: Email provider -- skip
      await expect(page.getByRole('heading', { name: /connect your email/i })).toBeVisible({
        timeout: 15_000,
      });
      await page.getByRole('button', { name: /skip for now/i }).click();

      // Step 5: Avatar -- skip
      await expect(page.getByText('Add Your Photo')).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: /skip/i }).click();

      // Step 6: MFA setup -- enable TOTP via intercepted response
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
      await page.getByLabel(/enter your password/i).fill(FRESH_USER_PASSWORD);

      // Click Continue to submit password and trigger two-factor/enable
      await page.getByRole('button', { name: /continue/i }).click();

      // Wait for the QR code / verify phase to appear
      await expect(page.getByLabel(/enter 6-digit code/i)).toBeVisible({ timeout: 15_000 });

      // Generate TOTP code as late as possible (codes expire every 30s)
      expect(totpUri).toBeTruthy();
      const secret = new URL(totpUri).searchParams.get('secret')!;
      expect(secret).toBeTruthy();
      const code = await generateTotpCode(secret);

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

      // Wizard completion -- redirect to /dashboard
      await page.waitForURL('**/dashboard**', { timeout: 30_000 });
      await expect(page).toHaveURL(/\/dashboard/);
    } finally {
      await context.close();
    }
  });

  test('back navigation works between steps', async ({ browser }) => {
    const { page, context } = await getOnboardingPage(browser);

    try {
      // Complete step 1
      await expect(page.getByText('Terms & Privacy').first()).toBeVisible({ timeout: 15_000 });
      await page.getByRole('checkbox').first().check({ force: true });
      await page.getByRole('checkbox').nth(1).check({ force: true });
      await page.locator('button[type="submit"]').click();

      // Step 2 should be visible
      await expect(page.getByText('Confirm Your Name')).toBeVisible({ timeout: 10_000 });

      // Click Back button
      await page.getByRole('button', { name: /back/i }).click();

      // Step 1 content should be visible again
      await expect(page.getByText('Terms & Privacy').first()).toBeVisible({ timeout: 10_000 });

      // Checkboxes should still be checked (state preserved)
      const tosCheckbox = page.getByRole('checkbox').first();
      await expect(tosCheckbox).toBeChecked();
      const ppCheckbox = page.getByRole('checkbox').nth(1);
      await expect(ppCheckbox).toBeChecked();
    } finally {
      await context.close();
    }
  });

  test('pmsync:onboarding-complete cookie is set after wizard completion', async ({ browser }) => {
    // This test re-uses the full wizard completion flow but checks the cookie
    const { page, context } = await getOnboardingPage(browser);

    try {
      // Walk through all steps quickly
      // Step 1
      await expect(page.getByText('Terms & Privacy').first()).toBeVisible({ timeout: 15_000 });
      await page.getByRole('checkbox').first().check({ force: true });
      await page.getByRole('checkbox').nth(1).check({ force: true });
      await page.locator('button[type="submit"]').click();

      // Step 2
      await expect(page.getByText('Confirm Your Name')).toBeVisible({ timeout: 10_000 });
      await page.locator('button[type="submit"]').click();

      // Step 3
      await expect(
        page.getByText(/workspace is ready|Create Your Workspace/i),
      ).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: /continue/i }).click();

      // Step 4 -- skip
      await expect(page.getByRole('heading', { name: /connect your email/i })).toBeVisible({
        timeout: 15_000,
      });
      await page.getByRole('button', { name: /skip for now/i }).click();

      // Step 5 -- skip
      await expect(page.getByText('Add Your Photo')).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: /skip/i }).click();

      // Step 6 -- set up TOTP (required)
      await expect(page.getByText('Secure Your Account')).toBeVisible({ timeout: 10_000 });

      let totpUri = '';
      await page.route('**/two-factor/enable', async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        totpUri = body.totpURI ?? '';
        await route.fulfill({ response });
      });

      await page.getByText('Authenticator App').first().click();
      await expect(page.getByLabel(/enter your password/i)).toBeVisible({ timeout: 10_000 });
      await page.getByLabel(/enter your password/i).fill(FRESH_USER_PASSWORD);
      await page.getByRole('button', { name: /continue/i }).click();

      await expect(page.getByLabel(/enter 6-digit code/i)).toBeVisible({ timeout: 15_000 });
      expect(totpUri).toBeTruthy();
      const secret = new URL(totpUri).searchParams.get('secret')!;
      const code = await generateTotpCode(secret);
      await page.getByLabel(/enter 6-digit code/i).fill(code);
      await page.getByRole('button', { name: /verify/i }).click();

      await expect(page.getByText(/backup codes/i)).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: /continue/i }).click();
      await expect(page.getByText(/authenticator app configured/i)).toBeVisible({
        timeout: 10_000,
      });
      await page.getByRole('button', { name: /get started/i }).click();

      // After redirect to dashboard, check the onboarding-complete cookie
      await page.waitForURL('**/dashboard**', { timeout: 30_000 });

      const cookies = await context.cookies();
      const onboardingCookie = cookies.find((c) => c.name === 'pmsync:onboarding-complete');
      expect(onboardingCookie).toBeTruthy();
      expect(onboardingCookie!.value).toBe('1');
    } finally {
      await context.close();
    }
  });
});
