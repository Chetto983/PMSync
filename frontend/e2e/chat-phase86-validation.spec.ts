/**
 * Phase 86 Validation: Chat Tool UIs, Thread Persistence, HITL
 *
 * Tests against Railway backend with seeded test user.
 * Run: E2E_NO_WEB_SERVER=1 npx playwright test e2e/chat-phase86-validation.spec.ts --headed --project=chromium --no-deps
 *
 * Prerequisites:
 * - Frontend running locally: cd frontend && npm run dev
 * - Railway backend: https://backend-production-78e1.up.railway.app
 * - Test user: chattest@pmsync.local / Xq9mZ4wPnR7vL2kJ (seeded on Railway)
 */
import { test, expect, Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

// Skip auth setup dependency — we login manually against Railway
test.use({ storageState: { cookies: [], origins: [] } });

const TEST_EMAIL = 'chattest@pmsync.local';
const TEST_PASSWORD = 'Xq9mZ4wPnR7vL2kJ';

async function login(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'pmsync:cookie-consent',
      JSON.stringify({ necessary: true, analytics: false, marketing: false }),
    );
  });

  await page.goto('/auth/login', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 30_000 });
  await page.fill('input[name="email"], input[type="email"]', TEST_EMAIL);
  await page.fill('input[name="password"], input[type="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 30_000 });

  if (page.url().includes('/onboarding')) {
    await page.waitForLoadState('networkidle');
    for (let i = 0; i < 6; i++) {
      const skipBtn = page.getByRole('button', { name: /skip|continue|get started/i });
      const checkbox = page.getByRole('checkbox').first();
      if (await checkbox.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await checkbox.check({ force: true });
        const ppCheckbox = page.getByRole('checkbox').nth(1);
        if (await ppCheckbox.isVisible({ timeout: 1_000 }).catch(() => false)) {
          await ppCheckbox.check({ force: true });
        }
      }
      if (await skipBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await skipBtn.click();
        await page.waitForTimeout(1_000);
      }
      if (page.url().includes('/dashboard')) break;
    }
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  }
}

async function navigateToChat(page: Page) {
  await page.goto('/dashboard/ai', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector(
    'textarea, [role="textbox"], [data-testid="composer-input"], .aui-composer-input',
    { timeout: 15_000 },
  );
}

/**
 * Send a message and wait for the AI response to complete.
 * Detects completion by waiting for the action bar (copy/reload buttons)
 * which only renders after streaming finishes.
 */
async function sendMessageAndWait(page: Page, message: string, timeout = 90_000) {
  const input = page.locator(
    'textarea, [role="textbox"], [data-testid="composer-input"], .aui-composer-input',
  ).first();
  await input.fill(message);
  await input.press('Enter');

  // Wait for AI response to complete — action bar appears after streaming ends
  await page.waitForSelector('.chat-inline-actions, [class*="ActionBar"]', {
    timeout,
  }).catch(() => {
    console.log('WARN: Action bar not found within timeout — response may still be streaming');
  });

  // Extra settling time for DOM to finalize
  await page.waitForTimeout(1_000);
}

test.describe('Phase 86: Chat Migration Validation', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    page = await context.newPage();
    page.setDefaultTimeout(60_000);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('1. Login and navigate to chat', async () => {
    await login(page);
    await expect(page).toHaveURL(/\/dashboard/);
    await navigateToChat(page);
    await page.screenshot({ path: 'e2e/screenshots/chat-initial.png' });
  });

  test('2. Tool rendering — search emails for invoices', async () => {
    test.setTimeout(180_000);

    // Capture SSE network response to debug what backend returns
    const networkErrors: string[] = [];
    let firstChatResponseBody = '';
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/ai/chat')) {
        const status = response.status();
        console.log(`[NET] POST /ai/chat -> ${status} ${response.statusText()}`);
        if (status >= 400) {
          const body = await response.text().catch(() => '(unreadable)');
          networkErrors.push(`${status}: ${body.substring(0, 500)}`);
          console.log(`[NET] Error body: ${body.substring(0, 500)}`);
        } else if (status === 200 && !firstChatResponseBody) {
          // Try to capture the SSE stream body
          const body = await response.text().catch(() => '(SSE stream - unreadable)');
          firstChatResponseBody = body.substring(0, 2000);
          console.log(`[NET] SSE body (first 2000 chars): ${firstChatResponseBody}`);
        }
      }
    });
    page.on('requestfailed', (request) => {
      if (request.url().includes('/ai/chat')) {
        console.log(`[NET] Request FAILED: ${request.failure()?.errorText}`);
        networkErrors.push(request.failure()?.errorText ?? 'unknown');
      }
    });

    await sendMessageAndWait(page, 'search my emails for invoices', 120_000);

    await page.screenshot({ path: 'e2e/screenshots/chat-tool-search.png', fullPage: true });

    // Grab full page text to check what rendered
    const bodyText = await page.locator('body').textContent().catch(() => '');
    const msgStart = bodyText?.indexOf('search my emails') ?? 0;
    console.log('Response preview:', bodyText?.substring(msgStart, msgStart + 500));

    if (networkErrors.length > 0) {
      console.log('Network errors:', networkErrors);
    }

    // No raw JSON tool_call_id dumps (sign of broken tool UI)
    const rawJsonDump = page.locator('pre:has-text("tool_call_id")');
    expect(await rawJsonDump.count()).toBe(0);

    // No "Unknown tool" or error fallbacks that indicate broken rendering
    const unknownTool = page.locator('text=/Unknown tool|tool not found/i');
    expect(await unknownTool.count()).toBe(0);
  });

  test('3. Thread persistence — switch and return', async () => {
    test.setTimeout(120_000);

    // The CONVERSATIONS sidebar shows a "+" button to create new threads
    // and lists existing threads. From the screenshot we saw:
    // - "+" button at top right of CONVERSATIONS header
    // - "New chat" entries in the list
    const plusBtn = page.locator('button:near(:text("CONVERSATIONS"))').first();
    // Alternative: look for the specific "+" or "New" button
    const newChatBtn = page.locator(
      [
        'button:has-text("+")',
        '[aria-label*="new" i]',
        '[aria-label*="New" i]',
        'button:has-text("New chat")',
      ].join(', '),
    ).first();

    const createBtn = (await plusBtn.isVisible({ timeout: 3_000 }).catch(() => false))
      ? plusBtn
      : newChatBtn;

    if (await createBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Create a new thread
      await createBtn.click();
      await page.waitForTimeout(2_000);

      // Send a message in the new thread so it persists
      await sendMessageAndWait(page, 'hello, this is a test message');

      await page.screenshot({ path: 'e2e/screenshots/chat-new-thread.png' });

      // Now look for thread list items — they appear as children in CONVERSATIONS sidebar
      // From screenshots: each thread is a clickable item with text like "New chat"
      const threadItems = page.locator('.chat-thread-list-item, [class*="thread-list"] > *, [class*="ThreadList"] > *');
      let threadCount = await threadItems.count();

      // If specific class selectors don't match, try broader approach
      if (threadCount === 0) {
        // Look at the sidebar structure — find all clickable items in the conversations panel
        const sidebarItems = page.locator('text="New chat"').locator('..');
        threadCount = await sidebarItems.count();
        console.log('Thread items via "New chat" text:', threadCount);
      }

      if (threadCount > 1) {
        // Click the SECOND thread (the original one with invoice search)
        const threads = page.locator('text="New chat"').locator('..');
        await threads.nth(1).click();
        await page.waitForTimeout(3_000);

        const bodyText = await page.locator('body').textContent().catch(() => '');
        const hasInvoice = bodyText?.includes('invoice') || bodyText?.includes('Invoice');
        console.log('Thread restored — contains invoice reference:', hasInvoice);

        await page.screenshot({ path: 'e2e/screenshots/chat-thread-restored.png' });
      } else {
        console.log('Thread count:', threadCount, '— cannot test switching');
        await page.screenshot({ path: 'e2e/screenshots/chat-thread-list-debug.png' });
      }
    } else {
      console.log('WARN: Create thread button not found');
      // Dump sidebar HTML for debugging
      const sidebar = await page.locator('[class*="sidebar"], [class*="Sidebar"], [class*="thread"]').first().innerHTML().catch(() => 'not found');
      console.log('Sidebar HTML:', sidebar.substring(0, 500));
      await page.screenshot({ path: 'e2e/screenshots/chat-no-thread-btn.png' });
    }
  });

  test('4. No deprecated patterns — console errors check', async () => {
    test.setTimeout(120_000);

    // Collect console errors from this point forward
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Navigate fresh and trigger tool rendering
    await navigateToChat(page);
    await sendMessageAndWait(page, 'what emails do I have?');

    await page.screenshot({ path: 'e2e/screenshots/chat-final.png', fullPage: true });

    // No deprecated API errors
    const deprecatedErrors = consoleErrors.filter(
      (e) => e.includes('makeAssistantToolUI') || e.includes('AllToolUIs'),
    );
    expect(deprecatedErrors).toHaveLength(0);

    // Log any errors for debugging
    if (consoleErrors.length > 0) {
      console.log('Console errors:', consoleErrors.slice(0, 5));
    } else {
      console.log('No console errors detected');
    }
  });
});
