/**
 * Organization E2E Tests
 *
 * Full lifecycle: create org -> invite member -> accept invitation -> switch org -> cleanup.
 * Uses admin storageState (default) and a second browser context for the member user.
 */

import { test, expect, type BrowserContext } from '@playwright/test';

const ORG_NAME = `E2E Org ${Date.now()}`;
const MEMBER_EMAIL = process.env.E2E_MEMBER_EMAIL ?? 'member@pmsync.local';

// Serial execution -- tests share mutable state (orgId, invitationId)
test.describe.configure({ mode: 'serial' });

test.describe('Organization flows', () => {
  let createdOrgId: string | undefined;
  let invitationId: string | undefined;

  test.afterAll(async ({ browser }) => {
    // Clean up: delete the created org via API (faster + more reliable than UI)
    if (!createdOrgId) return;

    let ctx: BrowserContext | undefined;
    try {
      ctx = await browser.newContext({
        storageState: 'playwright/.auth/user.json',
      });
      const page = await ctx.newPage();

      // Use the better-auth organization delete API directly for cleanup
      const response = await page.request.post(
        '/api/auth/organization/delete',
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          data: { organizationId: createdOrgId },
        },
      );
      // Best-effort: don't fail teardown if delete fails
      if (!response.ok()) {
        console.warn(`Cleanup: failed to delete org ${createdOrgId} (${response.status()})`);
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
    const createBtn = page.getByRole('button', { name: /create organization/i });
    await expect(createBtn).toBeVisible({ timeout: 10_000 });
    await createBtn.click();

    // Fill in org name in the dialog
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Fill the Name field (slug auto-generates from name)
    const nameInput = dialog.getByLabel('Name');
    await nameInput.fill(ORG_NAME);

    // Wait for slug to auto-generate and submit button to become enabled
    const submitBtn = dialog.getByRole('button', { name: /create organization/i });
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
    await submitBtn.click();

    // Wait for dialog to close (success)
    await expect(dialog).not.toBeVisible({ timeout: 15_000 });

    // Wait for the table to refresh and verify the org appears
    const orgCell = page.locator('td', { hasText: ORG_NAME });
    await expect(orgCell).toBeVisible({ timeout: 15_000 });

    // Extract org ID from the org list API for later use
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

    // Find the org row containing ORG_NAME
    const orgRow = page.locator('tr', { hasText: ORG_NAME }).first();
    await expect(orgRow).toBeVisible();

    // Click the invite (UserPlus) icon button
    const inviteBtn = orgRow.getByRole('button', { name: 'Invite Member' });
    await inviteBtn.click();

    // InviteMemberDialog should open
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Fill in the member email
    const emailInput = dialog.locator('input[type="email"]');
    await emailInput.fill(MEMBER_EMAIL);

    // Click send/submit
    await dialog.locator('button[type="submit"]').click();

    // Wait for success alert (MUI Alert with role="alert")
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

      // Wait for success alert -- accept page shows "Invitation accepted! Redirecting..."
      const successAlert = memberPage.locator('[role="alert"]');
      await expect(successAlert).toContainText(/accepted/i, {
        timeout: 15_000,
      });
    } finally {
      await memberCtx.close();
    }
  });

  test('switch organization', async ({ page }) => {
    expect(createdOrgId).toBeTruthy();

    await page.goto('/dashboard', { waitUntil: 'networkidle' });

    // Set the active org via API, then verify it reflects in the UI.
    // This is more reliable than finding/clicking the OrgSwitcher button
    // (whose text varies based on current active org name).
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

    // Reload to pick up the new active org in the UI
    await page.reload({ waitUntil: 'networkidle' });

    // The OrgSwitcher button in the header shows the active org name
    // Verify ORG_NAME appears in the header
    const orgNameVisible = page.locator('header').getByText(ORG_NAME);
    await expect(orgNameVisible).toBeVisible({ timeout: 10_000 });
  });
});
