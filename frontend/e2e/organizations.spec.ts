/**
 * Organization E2E Tests
 *
 * Full lifecycle: create org -> invite member -> accept invitation -> switch org -> cleanup.
 * Uses admin storageState (default) and a second browser context for the member user.
 */

import { test, expect, type BrowserContext, type Page } from '@playwright/test';

const ORG_NAME = `E2E Org ${Date.now()}`;
const MEMBER_EMAIL = process.env.E2E_MEMBER_EMAIL ?? 'member@pmsync.local';

// Serial execution -- tests share mutable state (orgId, invitationId)
test.describe.configure({ mode: 'serial' });

test.describe('Organization flows', () => {
  let createdOrgId: string | undefined;
  let invitationId: string | undefined;

  test.afterAll(async ({ browser }) => {
    // Clean up: delete the created org via the admin UI
    if (!createdOrgId) return;

    let ctx: BrowserContext | undefined;
    try {
      ctx = await browser.newContext({
        storageState: 'playwright/.auth/user.json',
      });
      const page = await ctx.newPage();

      await page.goto('/dashboard/admin/organizations', {
        waitUntil: 'networkidle',
      });

      // Find and click the delete button for the org row containing ORG_NAME
      const orgRow = page.locator('tr', { hasText: ORG_NAME });
      const deleteBtn = orgRow.locator('button[color="error"], button:has(svg)').last();

      if (await deleteBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await deleteBtn.click();

        // DeleteOrgDialog: type the org name to confirm
        const confirmInput = page.locator('div[role="dialog"] input');
        await confirmInput.fill(ORG_NAME);

        // Click the red "Delete Organization" submit button
        const submitBtn = page.locator(
          'div[role="dialog"] button[type="submit"]',
        );
        await submitBtn.click();

        // Wait for dialog to close
        await page
          .locator('div[role="dialog"]')
          .waitFor({ state: 'hidden', timeout: 10_000 })
          .catch(() => {
            // Cleanup is best-effort
          });
      }
    } finally {
      await ctx?.close();
    }
  });

  test('create organization', async ({ page }) => {
    await page.goto('/dashboard/admin/organizations', {
      waitUntil: 'networkidle',
    });

    // Click "Create Organization" button
    await page.getByRole('button', { name: /create organization/i }).click();

    // Fill in org name in the dialog
    const dialog = page.locator('div[role="dialog"]');
    await dialog.waitFor({ state: 'visible' });

    // The first text field is name, the second is slug (auto-generated)
    const nameInput = dialog.locator('input').first();
    await nameInput.fill(ORG_NAME);

    // Submit the form
    await dialog.locator('button[type="submit"]').click();

    // Wait for dialog to close (success)
    await dialog.waitFor({ state: 'hidden', timeout: 15_000 });

    // Verify the org appears in the table
    const orgCell = page.locator('td', { hasText: ORG_NAME });
    await expect(orgCell).toBeVisible({ timeout: 10_000 });

    // Extract org ID from the org list API for later use
    // Refetch org list and find the one matching ORG_NAME
    const response = await page.request.get('/api/auth/organization/list', {
      headers: { Accept: 'application/json' },
    });
    expect(response.ok()).toBeTruthy();
    const orgs = await response.json();
    const created = (orgs as any[]).find((o: any) => o.name === ORG_NAME);
    expect(created).toBeTruthy();
    createdOrgId = created.id;
  });

  test('invite member by email', async ({ page }) => {
    expect(createdOrgId).toBeTruthy();

    await page.goto('/dashboard/admin/organizations', {
      waitUntil: 'networkidle',
    });

    // Expand the org row to see actions
    const orgRow = page.locator('tr', { hasText: ORG_NAME }).first();
    await expect(orgRow).toBeVisible();

    // Click the invite (UserPlus) icon button for this org
    // The invite button is inside the actions cell -- it has color="primary"
    const inviteBtn = orgRow.locator('button').first();
    await inviteBtn.click();

    // InviteMemberDialog should open
    const dialog = page.locator('div[role="dialog"]');
    await dialog.waitFor({ state: 'visible' });

    // Fill in the member email
    const emailInput = dialog.locator('input[type="email"]');
    await emailInput.fill(MEMBER_EMAIL);

    // Click send/submit
    await dialog.locator('button[type="submit"]').click();

    // Wait for success alert or dialog close
    const successAlert = dialog.locator('[role="alert"]');
    await expect(successAlert).toBeVisible({ timeout: 10_000 });

    // Dialog auto-closes after 1500ms on success
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
  });

  test('accept invitation as member', async ({ browser }) => {
    // Open a new browser context with member auth
    const memberCtx = await browser.newContext({
      storageState: 'playwright/.auth/member.json',
    });
    const memberPage = await memberCtx.newPage();

    try {
      // Get the invitation ID via API (no real email needed)
      const invResponse = await memberPage.request.get(
        '/api/auth/organization/list-user-invitations',
        { headers: { Accept: 'application/json' } },
      );
      expect(invResponse.ok()).toBeTruthy();
      const invitations = await invResponse.json();
      expect(Array.isArray(invitations)).toBeTruthy();
      expect((invitations as any[]).length).toBeGreaterThan(0);

      // Find the invitation for our org
      const inv = (invitations as any[]).find(
        (i: any) =>
          i.organizationId === createdOrgId ||
          i.organization?.name === ORG_NAME,
      );
      expect(inv).toBeTruthy();
      invitationId = inv.id;

      // Navigate to the acceptance page
      await memberPage.goto(
        `/dashboard/invitations/accept?id=${invitationId}`,
        { waitUntil: 'networkidle' },
      );

      // Wait for success alert
      const successAlert = memberPage.locator('[role="alert"]');
      await expect(successAlert).toContainText(/accepted|success/i, {
        timeout: 15_000,
      });
    } finally {
      await memberCtx.close();
    }
  });

  test('switch organization', async ({ page }) => {
    expect(createdOrgId).toBeTruthy();

    await page.goto('/dashboard', { waitUntil: 'networkidle' });

    // The OrgSwitcher renders as a button with Building2 icon in the header
    // It only shows for users with 2+ orgs
    const orgSwitcherBtn = page.locator('header button', {
      hasText: /./,
    });

    // Find the switcher button -- it has the current org name or "Switch Organization"
    const switcher = page.locator('button:has(svg)', {
      hasText: /.+/,
    });

    // Click the org switcher -- look for a button that opens a menu with org names
    // The OrgSwitcher button starts with a Building2 icon
    // We need to find a button that, when clicked, shows a menu with ORG_NAME
    // Try clicking buttons that look like the switcher
    const allHeaderButtons = page.locator('header button');
    const count = await allHeaderButtons.count();

    let switcherFound = false;
    for (let i = 0; i < count; i++) {
      const btn = allHeaderButtons.nth(i);
      const text = await btn.textContent();
      // OrgSwitcher shows active org name or "Switch Organization"
      if (text && (text.includes('Organization') || text.includes('Org'))) {
        await btn.click();
        switcherFound = true;
        break;
      }
    }

    if (!switcherFound) {
      // Fallback: set active org via API directly
      const response = await page.request.post(
        '/api/auth/organization/set-active',
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          data: { organizationId: createdOrgId },
        },
      );
      expect(response.ok()).toBeTruthy();

      // Reload and verify
      await page.reload({ waitUntil: 'networkidle' });
    } else {
      // Click on ORG_NAME in the dropdown menu
      const menuItem = page.locator('[role="menuitem"]', {
        hasText: ORG_NAME,
      });
      await expect(menuItem).toBeVisible({ timeout: 5_000 });
      await menuItem.click();

      // Wait for page to settle after org switch (full cache invalidation)
      await page.waitForLoadState('networkidle');
    }

    // Verify the org name appears somewhere in the header/UI
    // After switching, the OrgSwitcher button text should show ORG_NAME
    // or the page should reflect the new active org
    const orgNameVisible = page.locator('header').getByText(ORG_NAME);
    await expect(orgNameVisible).toBeVisible({ timeout: 10_000 });
  });
});
