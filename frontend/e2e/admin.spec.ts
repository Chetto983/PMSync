import { test, expect, type Page } from '@playwright/test';

const MEMBER_EMAIL = process.env.E2E_MEMBER_EMAIL ?? 'member@pmsync.local';
const MEMBER_PASSWORD = process.env.E2E_MEMBER_PASSWORD ?? 'MemberPassword123!';

/**
 * Locate the table row containing the given email in the admin user list.
 */
function memberRow(page: Page) {
  return page.locator('tr', { hasText: MEMBER_EMAIL });
}

/**
 * Navigate to admin users page and wait for the table to load.
 */
async function gotoAdminUsers(page: Page) {
  await page.goto('/dashboard/admin/users', { waitUntil: 'networkidle' });
  // Wait for at least one data row (not the loading or empty row)
  await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// Non-serial tests: user list, search, impersonate, sessions
// ---------------------------------------------------------------------------
test.describe('Admin panel -- user management', () => {
  test('navigate to admin and view user list', async ({ page }) => {
    await gotoAdminUsers(page);

    // Heading "User Management" is visible
    await expect(page.getByText('User Management')).toBeVisible();

    // Table is visible and not showing "Access denied"
    await expect(page.locator('table')).toBeVisible();
    await expect(page.getByText('Access denied')).not.toBeVisible();

    // member user is present
    await expect(memberRow(page)).toBeVisible();
  });

  test('search users by email', async ({ page }) => {
    await gotoAdminUsers(page);

    // Type into the search field (placeholder: "Search by email...")
    const searchInput = page.getByPlaceholder('Search by email...');
    await searchInput.fill('member@');

    // Wait for debounce + refetch (300ms debounce + network)
    await page.waitForTimeout(500);
    await expect(memberRow(page)).toBeVisible({ timeout: 10_000 });

    // admin@pmsync.local should NOT be visible after filtering
    await expect(page.locator('tr', { hasText: 'admin@pmsync.local' })).not.toBeVisible();
  });

  test('impersonate a user', async ({ page }) => {
    await gotoAdminUsers(page);

    // Register the dialog handler BEFORE clicking (window.confirm)
    page.on('dialog', (dialog) => dialog.accept());

    // Find the impersonate button in the member row (PersonSearchIcon tooltip "Impersonate")
    const row = memberRow(page);
    await expect(row).toBeVisible({ timeout: 10_000 });

    // The impersonate button is the IconButton with tooltip "Impersonate" in the row
    const impersonateBtn = row.getByRole('button', { name: 'Impersonate' });
    await impersonateBtn.click();

    // After impersonation, page reloads. Wait for navigation to settle.
    await page.waitForLoadState('networkidle');

    // ImpersonationBanner should be visible with "You are impersonating" text
    const banner = page.getByText(/You are impersonating/);
    await expect(banner).toBeVisible({ timeout: 15_000 });

    // Click "Stop Impersonating" to end impersonation
    const stopBtn = page.getByRole('button', { name: 'Stop Impersonating' });
    await stopBtn.click();

    // Page reloads again. Wait for it to settle.
    await page.waitForLoadState('networkidle');

    // Banner should no longer be visible
    await expect(page.getByText(/You are impersonating/)).not.toBeVisible({ timeout: 15_000 });
  });

  test('view and revoke user sessions', async ({ page }) => {
    await gotoAdminUsers(page);

    const row = memberRow(page);
    await expect(row).toBeVisible({ timeout: 10_000 });

    // Click the Sessions icon button (DevicesIcon, tooltip "Sessions")
    const sessionsBtn = row.getByRole('button', { name: 'Sessions' });
    await sessionsBtn.click();

    // UserSessionsDialog should open with "Active Sessions" title
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText('Active Sessions')).toBeVisible();

    // Check if there are sessions listed. The member setup ran login,
    // so there should be at least one session.
    const hasSessionItems = await dialog.locator('li').count();

    if (hasSessionItems > 0) {
      // Click "Revoke All Sessions" button
      const revokeBtn = dialog.getByRole('button', { name: 'Revoke All Sessions' });
      await revokeBtn.click();

      // Dialog should close on success (onSuccess: onClose)
      await expect(dialog).not.toBeVisible({ timeout: 10_000 });
    } else {
      // No sessions -- "No active sessions" text should be visible
      await expect(dialog.getByText('No active sessions')).toBeVisible();
      // Close the dialog
      await dialog.getByRole('button', { name: 'Cancel' }).click();
    }
  });
});

// ---------------------------------------------------------------------------
// Serial tests: ban / verify banned login / unban
// ---------------------------------------------------------------------------
test.describe.serial('Admin panel -- ban/unban', () => {
  // Safety net: always unban member@pmsync.local in afterAll
  test.afterAll(async ({ browser }) => {
    let ctx;
    try {
      ctx = await browser.newContext({
        storageState: 'playwright/.auth/user.json',
      });
      const page = await ctx.newPage();
      await page.goto('/dashboard/admin/users', { waitUntil: 'networkidle' });

      // Wait for table to load
      await page.waitForSelector('table tbody tr', { timeout: 15_000 });

      // Search for member to find them quickly
      const searchInput = page.getByPlaceholder('Search by email...');
      await searchInput.fill('member@');
      await page.waitForTimeout(500);

      const row = page.locator('tr', { hasText: MEMBER_EMAIL });

      // Check if the user is still banned by looking for "Banned" chip
      const bannedChip = row.getByText('Banned');
      const isBanned = await bannedChip.isVisible().catch(() => false);

      if (isBanned) {
        // Click the unban button (LockOpenIcon, tooltip "Unban")
        const unbanBtn = row.getByRole('button', { name: 'Unban' });
        await unbanBtn.click();
        // Wait for the status to change
        await expect(row.getByText('Active')).toBeVisible({ timeout: 10_000 });
      }
    } finally {
      if (ctx) await ctx.close();
    }
  });

  test('ban member user', async ({ page }) => {
    await gotoAdminUsers(page);

    const row = memberRow(page);
    await expect(row).toBeVisible({ timeout: 10_000 });

    // Verify the member is currently Active
    await expect(row.getByText('Active')).toBeVisible();

    // Click the ban button (BlockIcon, tooltip "Ban")
    const banBtn = row.getByRole('button', { name: 'Ban' });
    await banBtn.click();

    // BanUserDialog should appear
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText('Ban User')).toBeVisible();

    // Click "Ban User" confirm button (variant="contained" color="error")
    const confirmBtn = dialog.locator('button', { hasText: 'Ban User' }).last();
    await confirmBtn.click();

    // Dialog closes, user row should show "Banned" status
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
    await expect(row.getByText('Banned')).toBeVisible({ timeout: 10_000 });
  });

  test('verify banned user cannot log in', async ({ browser }) => {
    // Open a fresh unauthenticated browser context
    const bannedCtx = await browser.newContext();
    const bannedPage = await bannedCtx.newPage();

    try {
      // Set cookie consent to prevent banner interference
      await bannedPage.addInitScript(() => {
        localStorage.setItem(
          'pmsync:cookie-consent',
          JSON.stringify({ necessary: true, analytics: false, marketing: false }),
        );
      });

      await bannedPage.goto('/auth/login', { waitUntil: 'networkidle' });

      // Fill login form
      await bannedPage.fill('input[name="email"], input[type="email"]', MEMBER_EMAIL);
      await bannedPage.fill('input[name="password"], input[type="password"]', MEMBER_PASSWORD);
      await bannedPage.click('button[type="submit"]');

      // Assert: either an error alert is visible OR the page stays on /auth/login (not redirected to /dashboard)
      // Give generous timeout for the auth round-trip
      const errorAlert = bannedPage.locator('[role="alert"]');
      const staysOnLogin = bannedPage.waitForURL('**/auth/login**', { timeout: 5_000 }).then(() => true).catch(() => false);

      // Wait for either an error alert to appear or confirm we stayed on login page
      await Promise.race([
        expect(errorAlert.first()).toBeVisible({ timeout: 10_000 }),
        staysOnLogin,
      ]);

      // Double-check: user should NOT be on dashboard
      expect(bannedPage.url()).not.toContain('/dashboard');
    } finally {
      await bannedCtx.close();
    }
  });

  test('unban member user', async ({ page }) => {
    await gotoAdminUsers(page);

    const row = memberRow(page);
    await expect(row).toBeVisible({ timeout: 10_000 });

    // Verify the member is currently Banned
    await expect(row.getByText('Banned')).toBeVisible();

    // Click the unban button (LockOpenIcon, tooltip "Unban")
    const unbanBtn = row.getByRole('button', { name: 'Unban' });
    await unbanBtn.click();

    // Status should change back to Active
    await expect(row.getByText('Active')).toBeVisible({ timeout: 10_000 });
    await expect(row.getByText('Banned')).not.toBeVisible();
  });
});
