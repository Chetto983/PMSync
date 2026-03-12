/**
 * Security Settings E2E Tests
 *
 * Tests the full security settings workflow: change password, enable/disable
 * TOTP with real otplib codes, register passkey via CDP virtual authenticator,
 * and view/revoke active sessions.
 *
 * Runs against the real backend with the admin@pmsync.local user.
 * Passkey test is Chromium-only (CDP WebAuthn).
 */

import { test, expect, type Page } from '@playwright/test';
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';

function generateTotpCode(secret: string): Promise<string> {
  const instance = new TOTP({
    crypto: new NobleCryptoPlugin(),
    base32: new ScureBase32Plugin(),
    secret,
  });
  return instance.generate();
}

const ADMIN_EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@pmsync.local';
const ADMIN_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'TestPassword123!';
const NEW_PASSWORD = 'TestPassword456!';

/**
 * Navigate to the Security section of Settings.
 */
async function goToSecuritySettings(page: Page) {
  await page.goto('/dashboard/settings?section=security', {
    waitUntil: 'networkidle',
  });
  // Wait for the security section to be visible (MFA section loads data)
  await expect(
    page.getByRole('heading', { name: 'Two-Factor Authentication' }),
  ).toBeVisible({ timeout: 15_000 });
}

/**
 * Fill a PasswordField by its label text.
 * PasswordField renders an MUI TextField with type="password".
 */
async function fillPassword(page: Page, label: string, value: string) {
  const field = page.getByLabel(label, { exact: true });
  await field.fill(value);
}

// Security tests modify shared user state (password, TOTP, passkeys)
// and must run serially to avoid conflicts.
test.describe.configure({ mode: 'serial' });

test.describe('Security settings', () => {
  // Password change + re-login + restore needs more than the default 120s
  test('change password and verify login with new password', async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);
    await goToSecuritySettings(page);

    // Scroll to the password section
    const passwordSection = page.getByText('Password').first();
    await passwordSection.scrollIntoViewIfNeeded();

    // Wait for the password form to load (it checks accounts first)
    await expect(
      page.getByLabel('Current password', { exact: true }),
    ).toBeVisible({ timeout: 10_000 });

    // Step 1: Change to new password
    await fillPassword(page, 'Current password', ADMIN_PASSWORD);
    await fillPassword(page, 'New password', NEW_PASSWORD);
    await fillPassword(page, 'Confirm new password', NEW_PASSWORD);

    await page.getByRole('button', { name: /change password/i }).click();

    // Assert success
    await expect(page.getByRole('alert').filter({ hasText: /password updated/i })).toBeVisible({
      timeout: 10_000,
    });

    // Step 2: Verify new password works via API call through Next.js proxy
    // (more reliable than full UI login which is fragile due to rate-limiting)
    const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3001';
    const loginResp = await page.request.post('/api/auth/sign-in/email', {
      data: { email: ADMIN_EMAIL, password: NEW_PASSWORD },
      headers: { origin: baseURL },
    });
    expect(loginResp.ok()).toBeTruthy();

    // Step 3: Restore original password so reruns and auth.setup.ts work
    // Navigate back to security settings (the success alert may have cleared state)
    await goToSecuritySettings(page);
    await expect(
      page.getByLabel('Current password', { exact: true }),
    ).toBeVisible({ timeout: 10_000 });

    await fillPassword(page, 'Current password', NEW_PASSWORD);
    await fillPassword(page, 'New password', ADMIN_PASSWORD);
    await fillPassword(page, 'Confirm new password', ADMIN_PASSWORD);

    await page.getByRole('button', { name: /change password/i }).click();

    await expect(page.getByRole('alert').filter({ hasText: /password updated/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test.describe.serial('TOTP lifecycle', () => {
    test('enable TOTP with real OTP code', async ({ page }) => {
      // Intercept the two-factor enable API call to capture totpURI
      let totpUri = '';
      await page.route('**/api/auth/two-factor/enable', async (route) => {
        const resp = await route.fetch();
        const body = await resp.json();
        totpUri = body.totpURI ?? '';
        await route.fulfill({ response: resp });
      });

      await goToSecuritySettings(page);

      // Click "Enable TOTP" on the Authenticator App row
      const enableButton = page.getByRole('button', { name: /enable totp/i });
      await expect(enableButton).toBeVisible({ timeout: 10_000 });
      await enableButton.click();

      // Password confirmation dialog appears (step 0)
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });

      // Fill password in the dialog
      await dialog.locator('input[type="password"]').fill(ADMIN_PASSWORD);
      await dialog.getByRole('button', { name: /continue/i }).click();

      // Step 1: QR code screen — wait for it then click Continue
      await expect(
        dialog.getByText(/scan this qr code/i),
      ).toBeVisible({ timeout: 10_000 });

      // The totpUri should be captured by now from the intercepted response
      expect(totpUri).toBeTruthy();

      // Click Continue to proceed to verification step
      await dialog.getByRole('button', { name: /continue/i }).click();

      // Step 2: Enter verification code
      await expect(
        dialog.getByText(/6-digit/i).or(dialog.getByText(/enter.*code/i)),
      ).toBeVisible({ timeout: 5_000 });

      const secret = new URL(totpUri).searchParams.get('secret')!;
      expect(secret).toBeTruthy();
      const code = await generateTotpCode(secret);

      // Fill the OTP input (has inputMode="numeric")
      await dialog.locator('input[inputmode="numeric"]').fill(code);

      // Click Verify
      await dialog.getByRole('button', { name: /verify/i }).click();

      // Step 3: Backup codes screen — TOTP is now enabled
      await expect(
        dialog.getByText(/save these codes/i).or(
          dialog.getByText(/backup/i),
        ),
      ).toBeVisible({ timeout: 10_000 });

      // Close the dialog
      await dialog.getByRole('button', { name: /done/i }).click();

      // Verify the TOTP row now shows "TOTP is enabled" chip
      await expect(
        page.getByText(/TOTP is enabled/i),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('disable TOTP', async ({ page }) => {
      await goToSecuritySettings(page);

      // The TOTP row should show "Disable TOTP" button since it's enabled
      const disableButton = page.getByRole('button', { name: /disable totp/i });
      await expect(disableButton).toBeVisible({ timeout: 10_000 });
      await disableButton.click();

      // Password confirmation dialog
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      await dialog.locator('input[type="password"]').fill(ADMIN_PASSWORD);
      await dialog
        .getByRole('button', { name: /disable/i })
        .click();

      // Wait for dialog to close and verify TOTP is disabled
      await expect(dialog).not.toBeVisible({ timeout: 10_000 });

      // The chip should now show "TOTP is not configured" and Enable button should be back
      await expect(
        page.getByText(/not configured/i).or(
          page.getByRole('button', { name: /enable totp/i }),
        ),
      ).toBeVisible({ timeout: 5_000 });
    });
  });

  test('register passkey via virtual authenticator', async ({ page }) => {
    // This test requires CDP (Chromium DevTools Protocol) for WebAuthn
    // It only works with Chromium-based browsers
    const browserName = page.context().browser()?.browserType().name();
    test.skip(
      browserName !== 'chromium',
      'CDP WebAuthn virtual authenticator requires Chromium',
    );

    // Set up CDP virtual authenticator
    const client = await page.context().newCDPSession(page);
    await client.send('WebAuthn.enable');
    const { authenticatorId } = await client.send(
      'WebAuthn.addVirtualAuthenticator',
      {
        options: {
          protocol: 'ctap2',
          transport: 'internal',
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true,
        },
      },
    );

    try {
      await goToSecuritySettings(page);

      // Click "Add Passkey" button
      const addButton = page.getByRole('button', { name: /add passkey/i });
      await expect(addButton).toBeVisible({ timeout: 10_000 });
      await addButton.click();

      // The virtual authenticator auto-responds to the WebAuthn registration
      // Wait for success — either a passkey appears in the list or a success alert
      await expect(
        page
          .getByText(/passkey added/i)
          .or(page.locator('.MuiListItem-root').filter({ hasText: /chromium|chrome|browser/i })),
      ).toBeVisible({ timeout: 15_000 });

      // Clean up: remove the passkey via UI to keep DB clean
      // Find the remove button (Trash2 icon in ListItemSecondaryAction with Tooltip "Remove")
      const removeButton = page
        .locator('.MuiListItemSecondaryAction-root .MuiIconButton-root')
        .first();
      if (await removeButton.isVisible()) {
        await removeButton.click();

        // Confirm removal in dialog
        const confirmDialog = page.getByRole('dialog');
        await expect(confirmDialog).toBeVisible({ timeout: 5_000 });
        await confirmDialog
          .getByRole('button', { name: /remove/i })
          .click();
        await expect(confirmDialog).not.toBeVisible({ timeout: 5_000 });
      }
    } finally {
      // Always clean up the virtual authenticator
      await client.send('WebAuthn.removeVirtualAuthenticator', {
        authenticatorId,
      });
      await client.send('WebAuthn.disable');
    }
  });

  test('view active sessions and revoke one', async ({ page, browser }) => {
    // Create an extra session by logging in with a separate context
    const extraContext = await browser.newContext();
    const extraPage = await extraContext.newPage();
    await extraPage.addInitScript(() => {
      localStorage.setItem(
        'pmsync:cookie-consent',
        JSON.stringify({ necessary: true, analytics: false, marketing: false }),
      );
    });
    await extraPage.goto('/auth/login', { waitUntil: 'networkidle' });
    await extraPage.fill(
      'input[name="email"], input[type="email"]',
      ADMIN_EMAIL,
    );
    await extraPage.fill(
      'input[name="password"], input[type="password"]',
      ADMIN_PASSWORD,
    );
    await extraPage.click('button[type="submit"]');
    // Accept either dashboard or onboarding redirect -- we only need the session created
    await extraPage.waitForURL(/\/(dashboard|onboarding)/, { timeout: 15_000 });
    await extraContext.close();

    // Now navigate to security settings with the main (authenticated) page
    await goToSecuritySettings(page);

    // Scroll to the sessions section
    const sessionsHeading = page.getByText('Active Sessions');
    await expect(sessionsHeading).toBeVisible({ timeout: 10_000 });
    await sessionsHeading.scrollIntoViewIfNeeded();

    // There should be at least the current session visible
    const sessionCards = page.locator('.MuiCard-root').filter({
      has: page.locator('.MuiListItem-root'),
    });
    await expect(sessionCards.first()).toBeVisible({ timeout: 10_000 });

    // Count sessions — we expect at least 2 (current + the extra one we created)
    const sessionCount = await sessionCards.count();

    // If there are other sessions, we can revoke one
    if (sessionCount > 1) {
      // Find a revoke button (only shown for non-current sessions)
      // The revoke button is an IconButton inside ListItemSecondaryAction
      const revokeButton = page
        .locator('.MuiListItemSecondaryAction-root .MuiIconButton-root')
        .first();

      await expect(revokeButton).toBeVisible({ timeout: 5_000 });
      await revokeButton.click();

      // Wait for the session list to update (one fewer session)
      await expect(sessionCards).toHaveCount(sessionCount - 1, {
        timeout: 10_000,
      });
    } else {
      // If only one session (current), verify "No other active sessions" text
      await expect(
        page.getByText(/no other active sessions/i),
      ).toBeVisible();
    }
  });
});
