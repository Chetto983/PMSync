/**
 * AI Chat Mobile E2E Tests (375px viewport)
 *
 * Dedicated mobile test suite -- runs at 375x812 (iPhone X equivalent).
 * No test.skip() guards; the entire file targets mobile viewport only.
 *
 * Covers:
 * - Mobile layout visibility (mobile visible, desktop hidden)
 * - Composer accessibility and functionality
 * - Sidebar slide behavior (open/close)
 * - Send and receive message via SSE streaming
 *
 * All tests use route interception (no real backend needed).
 * SSE helpers duplicated from chat-e2e.spec.ts to avoid coupling.
 *
 * Phase 31: Foundation & Stability Verification
 */
import { test, expect } from './fixtures';

// ---------------------------------------------------------------------------
// SSE (Server-Sent Events) mock helpers (duplicated from chat-e2e.spec.ts)
// ---------------------------------------------------------------------------

let partIdCounter = 0;
function nextId(): string {
  return `part_${partIdCounter++}`;
}

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function sseDone(): string {
  return `data: [DONE]\n\n`;
}

/**
 * Build a simple text-only SSE response body.
 */
function buildTextResponse(text: string): string {
  const textId = nextId();
  return (
    sseEvent({ type: 'start' }) +
    sseEvent({ type: 'start-step' }) +
    sseEvent({ type: 'text-start', id: textId }) +
    sseEvent({ type: 'text-delta', id: textId, delta: text }) +
    sseEvent({ type: 'text-end', id: textId }) +
    sseEvent({ type: 'finish-step' }) +
    sseEvent({ type: 'finish', finishReason: 'stop' }) +
    sseDone()
  );
}

/** Fulfill a route with SSE content type */
async function fulfillSSE(
  route: { fulfill: (opts: Record<string, unknown>) => Promise<void> },
  body: string,
) {
  await route.fulfill({
    status: 200,
    contentType: 'text/event-stream; charset=utf-8',
    body,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('AI Chat Mobile (375px)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ authedPage: page }) => {
    partIdCounter = 0; // Reset counter per test

    // Mock conversations list (empty)
    await page.route(
      '**/localhost:3000/api/v1/ai/chat/conversations**',
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      },
    );

    // Mock pending actions (empty)
    await page.route(
      '**/localhost:3000/api/v1/ai/actions/pending**',
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ actions: [], total: 0 }),
        });
      },
    );
    // NOTE: No action-counts mock (endpoint is dead, removed in Phase 31)
  });

  test('mobile layout visible, desktop layout hidden', async ({
    authedPage: page,
  }) => {
    await page.goto('/dashboard/ai');

    // Mobile layout should be visible at 375px
    const mobileLayout = page.locator('.chat-mobile-layout');
    await expect(mobileLayout).toBeVisible();

    // Desktop layout should be hidden
    const desktopLayout = page.locator('.chat-desktop-layout');
    await expect(desktopLayout).toBeHidden();
  });

  test('mobile composer is accessible and functional', async ({
    authedPage: page,
  }) => {
    await page.goto('/dashboard/ai');

    // Composer textbox should be visible within mobile layout
    const mobileLayout = page.locator('.chat-mobile-layout');
    const composer = mobileLayout.getByPlaceholder(
      'Ask anything about your emails',
    );
    await expect(composer).toBeVisible();

    // Should be editable
    await composer.fill('Test input');
    await expect(composer).toHaveValue('Test input');
  });

  test('mobile sidebar slide behavior', async ({ authedPage: page }) => {
    await page.goto('/dashboard/ai');

    // Sidebar hidden by default
    const sidebar = page.locator('.chat-mobile-slide-sidebar');
    await expect(sidebar).toHaveAttribute('data-visible', 'false');

    // Open sidebar via menu button
    const menuButton = page.locator('.chat-mobile-menu-btn');
    await expect(menuButton).toBeVisible();
    await menuButton.click();
    await expect(sidebar).toHaveAttribute('data-visible', 'true');

    // Close sidebar via back button
    const backButton = sidebar.locator('.chat-mobile-back-btn');
    await expect(backButton).toBeVisible();
    await backButton.dispatchEvent('click');
    await expect(sidebar).toHaveAttribute('data-visible', 'false');
  });

  test('mobile send and receive message', async ({ authedPage: page }) => {
    // Mock chat endpoint with SSE response
    await page.route('**/localhost:3000/api/v1/ai/chat', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }
      await fulfillSSE(route, buildTextResponse('Hello from mobile!'));
    });

    await page.goto('/dashboard/ai');

    // Scope to mobile layout to avoid ambiguity with hidden desktop layout
    const mobileLayout = page.locator('.chat-mobile-layout');
    const composer = mobileLayout.getByPlaceholder(
      'Ask anything about your emails',
    );
    await expect(composer).toBeVisible();
    await composer.fill('Test message');
    await composer.press('Enter');

    // Verify the assistant response appears in the mobile layout
    await expect(
      mobileLayout.getByText('Hello from mobile!'),
    ).toBeVisible();
  });
});
