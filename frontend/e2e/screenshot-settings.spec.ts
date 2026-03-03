import { test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 1200 } });
test('screenshot settings accounts', async ({ page }) => {
  // Mock auth
  await page.route('**/localhost:3000/auth/me', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'user-1',
        email: 'user@test.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'admin',
        tenantId: 'tenant-1',
      }),
    });
  });

  // Mock providers - must return array
  await page.route('**/localhost:3000/providers**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  // Mock billing/subscription
  await page.route('**/localhost:3000/billing**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        plan: 'free',
        usage: { percentEmailUsed: 0, percentAIUsed: 0 },
      }),
    });
  });

  // Catch-all for remaining API calls
  await page.route('**/localhost:3000/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.goto('/dashboard/settings?section=accounts');

  // Dismiss cookie banner if present
  try {
    await page.locator('button:has-text("Accetta tutti")').click({ timeout: 3000 });
  } catch { /* no banner */ }

  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'docs/screenshots/settings-accounts-v4.png', fullPage: true });
});
