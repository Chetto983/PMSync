/**
 * Quick visual audit: login + screenshot chat at 3 breakpoints.
 * Run: npx playwright test e2e/chat-visual-audit.ts --headed --project=chromium
 */
import { test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

// Skip the setup dependency — we login manually here
test.use({ storageState: { cookies: [], origins: [] } });

const SCREENSHOTS_DIR = 'docs/screenshots';

test('login and audit chat UI', async ({ browser }) => {
  // --- Desktop 1440 ---
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const dPage = await desktop.newPage();
  await dPage.goto('/auth/login', { waitUntil: 'networkidle' });
  await dPage.fill('input[name="email"], input[type="email"]', 'admin@pmsync.local');
  await dPage.fill('input[name="password"], input[type="password"]', 'TestPassword123!');
  await dPage.click('button[type="submit"]');
  await dPage.waitForURL('**/dashboard**', { timeout: 15000 });

  // Navigate to chat
  await dPage.goto('/dashboard/ai', { waitUntil: 'networkidle' });
  await dPage.waitForTimeout(2000);

  // Dismiss cookie banner if present
  const acceptBtn = dPage.locator('button:has-text("Accept All")');
  if (await acceptBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await acceptBtn.click();
    await dPage.waitForTimeout(500);
  }

  await dPage.screenshot({ path: `${SCREENSHOTS_DIR}/chat-desktop-1440.png`, fullPage: false });

  // --- Tablet 768 ---
  await dPage.setViewportSize({ width: 768, height: 1024 });
  await dPage.waitForTimeout(500);
  await dPage.screenshot({ path: `${SCREENSHOTS_DIR}/chat-tablet-768.png`, fullPage: false });

  // --- Mobile 375 ---
  await dPage.setViewportSize({ width: 375, height: 812 });
  await dPage.waitForTimeout(500);
  await dPage.screenshot({ path: `${SCREENSHOTS_DIR}/chat-mobile-375.png`, fullPage: false });

  // --- Dark mode (desktop) ---
  await dPage.setViewportSize({ width: 1440, height: 900 });
  // Toggle to dark via next-themes: add .dark class
  await dPage.evaluate(() => {
    document.documentElement.classList.add('dark');
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.style.colorScheme = 'dark';
  });
  await dPage.waitForTimeout(500);
  await dPage.screenshot({ path: `${SCREENSHOTS_DIR}/chat-desktop-dark-1440.png`, fullPage: false });

  await desktop.close();
});
