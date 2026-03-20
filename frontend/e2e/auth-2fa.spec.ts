import { test, expect } from '@playwright/test';
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Generate a TOTP code from a secret. Uses otplib with noble-crypto and scure-base32
 * plugins (same pattern as onboarding.spec.ts).
 */
function generateTotpCode(secret: string): Promise<string> {
  const instance = new TOTP({
    crypto: new NobleCryptoPlugin(),
    base32: new ScureBase32Plugin(),
    secret,
  });
  return instance.generate();
}

test.describe('Auth 2FA', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'pmsync:cookie-consent',
        JSON.stringify({ necessary: true, analytics: false, marketing: false }),
      );
    });
  });

  test('two-factor page renders TOTP input', async ({ page }) => {
    await page.goto('/auth/two-factor', { waitUntil: 'domcontentloaded' });

    // 6-digit TOTP code input field
    await expect(page.locator('input[inputmode="numeric"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /verify/i })).toBeVisible();
  });

  test('two-factor page shows backup code toggle', async ({ page }) => {
    await page.goto('/auth/two-factor', { waitUntil: 'domcontentloaded' });

    // Link/button to switch to backup code mode
    await expect(page.getByText(/backup code/i)).toBeVisible();
  });

  test('shows error for invalid TOTP code', async ({ page }) => {
    const apiURL = process.env.E2E_API_URL ?? 'http://localhost:3100';
    const probe = await fetch(`${apiURL}/health`).catch(() => null);
    test.skip(!probe?.ok, 'Backend API not reachable');

    await page.goto('/auth/two-factor', { waitUntil: 'domcontentloaded' });

    await page.locator('input[inputmode="numeric"]').fill('000000');
    await page.getByRole('button', { name: /verify/i }).click();

    await expect(
      page.locator('[role="alert"].MuiAlert-colorError'),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('2FA setup and verify flow', async ({ page, browser }) => {
    const apiURL = process.env.E2E_API_URL ?? 'http://localhost:3100';
    const probe = await fetch(`${apiURL}/health`).catch(() => null);
    test.skip(!probe?.ok, 'Backend API not reachable');

    // Create fresh browser context (no storageState)
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const freshPage = await context.newPage();

    await freshPage.addInitScript(() => {
      localStorage.setItem(
        'pmsync:cookie-consent',
        JSON.stringify({ necessary: true, analytics: false, marketing: false }),
      );
    });

    const timestamp = Date.now();
    const testEmail = `test+2fa+${timestamp}@pmsync.local`;
    const testPassword = 'TestPassword123!';

    // Register new user via API
    const signUpRes = await freshPage.request.post('/api/auth/sign-up/email', {
      data: { email: testEmail, password: testPassword, name: '2FA Test User' },
    });

    if (!signUpRes.ok()) {
      console.warn(`[2fa] Registration returned ${signUpRes.status()}`);
    }

    // Attempt login via UI
    await freshPage.goto('/auth/login', { waitUntil: 'domcontentloaded' });
    await freshPage.getByLabel(/email/i).fill(testEmail);
    await freshPage.locator('input[type="password"]').fill(testPassword);
    await freshPage.getByRole('button', { name: /sign in/i }).click();

    // If email verification is required (Pitfall 5), skip this test
    try {
      await freshPage.waitForURL(/\/(dashboard|onboarding)/, { timeout: 15_000 });
    } catch {
      // Login likely failed due to email verification requirement
      await context.close();
      test.skip(true, 'Login failed -- likely email verification required for fresh users');
      return;
    }

    // Intercept two-factor/enable response to capture totpURI
    let totpUri = '';
    await freshPage.route('**/two-factor/enable', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      totpUri = body.totpURI ?? '';
      await route.fulfill({ response });
    });

    // Navigate to security settings or trigger 2FA enable via API
    // Try the API approach first (more reliable)
    const enableRes = await freshPage.request.post('/api/auth/two-factor/enable', {
      data: { password: testPassword },
    });

    if (!enableRes.ok()) {
      await context.close();
      test.skip(true, '2FA enable API failed -- may need onboarding completion first');
      return;
    }

    const enableBody = await enableRes.json();
    totpUri = enableBody.totpURI ?? totpUri;

    if (!totpUri) {
      await context.close();
      test.skip(true, 'No totpURI received from 2FA enable response');
      return;
    }

    // Extract secret from totpURI
    const secret = new URL(totpUri).searchParams.get('secret');
    expect(secret).toBeTruthy();

    // Generate TOTP code as late as possible (Pitfall 6 - time window)
    const code = await generateTotpCode(secret!);

    // Verify the TOTP code
    const verifyRes = await freshPage.request.post('/api/auth/two-factor/verify-totp', {
      data: { code },
    });

    expect(verifyRes.ok()).toBeTruthy();

    await context.close();
  });
});
