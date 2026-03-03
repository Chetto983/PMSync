/**
 * AI Chat E2E Tests
 *
 * Covers TEST-04 requirements:
 * 1. Chat send/receive with streaming response
 * 2. Tool result card rendering (search_emails)
 * 3. HITL approval card for destructive actions
 * 4. Briefing widget on main dashboard
 * 5. Mobile 375px viewport layout
 *
 * All tests use route interception (no real backend needed).
 * Follows Playwright skill golden rules:
 * - getByRole() / getByPlaceholder() and semantic locators
 * - No waitForTimeout()
 * - Web-first assertions (auto-retry)
 * - baseURL from config
 */
import { test, expect } from './fixtures';

// ---------------------------------------------------------------------------
// SSE (Server-Sent Events) mock helpers
//
// AI SDK v6 pipeUIMessageStreamToResponse produces SSE format parsed by
// DefaultChatTransport -> parseJsonEventStream (EventSourceParserStream).
//
// Each event is: "data: {json}\n\n"
// Stream ends with: "data: [DONE]\n\n"
//
// Chunk types (uiMessageChunkSchema):
// - { type: "start" }
// - { type: "start-step" }
// - { type: "text-start", id: "..." }
// - { type: "text-delta", id: "...", delta: "text" }
// - { type: "text-end", id: "..." }
// - { type: "tool-input-available", toolCallId, toolName, input }
// - { type: "tool-output-available", toolCallId, output }
// - { type: "finish-step" }
// - { type: "finish", finishReason: "stop" }
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

/**
 * Build an SSE response with tool call, tool result, and text.
 */
function buildToolResponse(
  toolCallId: string,
  toolName: string,
  input: unknown,
  output: unknown,
  text: string,
): string {
  const textId = nextId();
  return (
    sseEvent({ type: 'start' }) +
    sseEvent({ type: 'start-step' }) +
    sseEvent({ type: 'tool-input-available', toolCallId, toolName, input }) +
    sseEvent({ type: 'tool-output-available', toolCallId, output }) +
    sseEvent({ type: 'finish-step' }) +
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
async function fulfillSSE(route: { fulfill: (opts: Record<string, unknown>) => Promise<void> }, body: string) {
  await route.fulfill({
    status: 200,
    contentType: 'text/event-stream; charset=utf-8',
    body,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('AI Chat E2E', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    // Mock conversations list (empty)
    await page.route('**/localhost:3000/api/v1/ai/chat/conversations**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    // Mock pending actions (empty by default -- overridden per test)
    await page.route('**/localhost:3000/api/v1/ai/actions/pending', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ actions: [], total: 0 }),
      });
    });

    // NOTE: action-counts mock removed (Phase 31) -- endpoint is dead, no backend support
  });

  test('sends message and receives streaming response', async ({ authedPage: page }) => {
    const vp = page.viewportSize();
    test.skip(!vp || vp.width < 768, 'Desktop-only test: .chat-desktop-thread hidden on mobile');

    // Mock chat endpoint with text-only SSE response
    await page.route('**/localhost:3000/api/v1/ai/chat', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }
      await fulfillSSE(route, buildTextResponse('Hello from the AI assistant!'));
    });

    await page.goto('/dashboard/ai');

    // Composer scoped to desktop layout (avoids ambiguity with mobile layout textarea)
    const composer = page.locator('.chat-desktop-thread').getByPlaceholder('Ask anything about your emails');
    await expect(composer).toBeVisible();
    await composer.fill('Hello');
    await composer.press('Enter');

    // Verify the assistant response appears (scoped to desktop thread to avoid
    // duplicate match from hidden mobile layout which shares the same runtime)
    const desktopThread = page.locator('.chat-desktop-thread');
    await expect(desktopThread.getByText('Hello from the AI assistant!')).toBeVisible();
  });

  test('displays tool result card for search_emails', async ({ authedPage: page }) => {
    const vp = page.viewportSize();
    test.skip(!vp || vp.width < 768, 'Desktop-only test: .chat-desktop-thread hidden on mobile');

    // Mock chat endpoint with tool call + tool result + text
    await page.route('**/localhost:3000/api/v1/ai/chat', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }
      await fulfillSSE(
        route,
        buildToolResponse(
          'call_1',
          'search_emails',
          { query: 'meeting' },
          {
            success: true,
            data: [
              {
                id: 'e1',
                subject: 'Team Meeting',
                from: 'john@example.com',
                snippet: 'Weekly sync',
                receivedAt: '2026-03-01T10:00:00Z',
                isRead: true,
                isStarred: false,
                aiPriority: 5,
                aiSentiment: 'neutral',
                aiLabels: ['work'],
              },
            ],
            searchType: 'text',
          },
          'I found 1 email about meetings.',
        ),
      );
    });

    await page.goto('/dashboard/ai');

    const composer = page.locator('.chat-desktop-thread').getByPlaceholder('Ask anything about your emails');
    await expect(composer).toBeVisible();
    await composer.fill('Search for meetings');
    await composer.press('Enter');

    // Verify tool result card renders the email subject (scoped to desktop thread)
    const desktopThread = page.locator('.chat-desktop-thread');
    await expect(desktopThread.getByText('Team Meeting')).toBeVisible();

    // Verify the text response also appears
    await expect(desktopThread.getByText('I found 1 email about meetings.')).toBeVisible();
  });

  test('shows HITL approval card for destructive action', async ({ authedPage: page }) => {
    const vp = page.viewportSize();
    test.skip(!vp || vp.width < 768, 'Desktop-only test: .chat-desktop-thread hidden on mobile');

    // Mock chat endpoint with text response
    await page.route('**/localhost:3000/api/v1/ai/chat', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }
      await fulfillSSE(
        route,
        buildTextResponse('I will send that email for you. Please approve the action.'),
      );
    });

    // Override: return a pending action for the HITL poll-based mechanism
    await page.unroute('**/localhost:3000/api/v1/ai/actions/pending');
    await page.route('**/localhost:3000/api/v1/ai/actions/pending', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          actions: [
            {
              id: 'act_1',
              executionId: 'exec_1',
              actionType: 'SEND_EMAIL',
              toolName: 'send_email',
              status: 'PENDING',
              severity: 'HIGH',
              summary: 'Send email to user@example.com: Test Subject',
              payload: {
                to: 'user@example.com',
                subject: 'Test Subject',
                body: 'Hello from the test',
              },
              createdAt: new Date().toISOString(),
            },
          ],
          total: 1,
        }),
      });
    });

    await page.goto('/dashboard/ai');

    const composer = page.locator('.chat-desktop-thread').getByPlaceholder('Ask anything about your emails');
    await expect(composer).toBeVisible();
    await composer.fill('Send an email to user@example.com');
    await composer.press('Enter');

    // Verify chat response text appears (scoped to desktop thread)
    const desktopThread = page.locator('.chat-desktop-thread');
    await expect(
      desktopThread.getByText('I will send that email for you. Please approve the action.'),
    ).toBeVisible();

    // Verify HITL approval card renders with approve/reject buttons
    // The HitlApprovalCard shows "Action requires approval" text and Approve/Reject buttons
    await expect(desktopThread.getByText('Action requires approval')).toBeVisible();
    await expect(desktopThread.getByRole('button', { name: 'Approve' })).toBeVisible();
    await expect(desktopThread.getByRole('button', { name: 'Reject' })).toBeVisible();
  });

  test('briefing widget renders on dashboard', async ({ authedPage: page }) => {
    // Mock briefing API
    await page.route('**/localhost:3000/api/v1/ai/briefing', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          briefing: {
            summary: 'You have 3 urgent emails and 2 meetings today.',
            urgentEmails: 3,
            deadlinesToday: 1,
            pendingFollowUps: 2,
            staleContacts: 0,
            highlights: [
              'Important proposal from Acme Corp needs review',
              'Team standup moved to 3pm',
            ],
            generatedAt: new Date().toISOString(),
          },
        }),
      });
    });

    // Mock dashboard layout (use default)
    await page.route('**/localhost:3000/api/v1/dashboard/layout**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ layout: null }),
      });
    });

    // Mock emails for recent unread (briefing highlights fallback)
    await page.route('**/localhost:3000/emails?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ emails: [], total: 0, page: 1, limit: 5 }),
      });
    });

    // Navigate to main dashboard (not /dashboard/ai)
    await page.goto('/dashboard');

    // Verify briefing widget renders with the summary text
    await expect(
      page.getByText('You have 3 urgent emails and 2 meetings today.'),
    ).toBeVisible({ timeout: 30_000 });

    // Verify a highlight is visible
    await expect(
      page.getByText('Important proposal from Acme Corp needs review'),
    ).toBeVisible();
  });

  test('mobile chat layout at 375px', async ({ authedPage: page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });

    // Mock chat endpoint for basic interaction
    await page.route('**/localhost:3000/api/v1/ai/chat', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }
      await fulfillSSE(route, buildTextResponse('Mobile response!'));
    });

    await page.goto('/dashboard/ai');

    // On mobile (375px < 768px breakpoint):
    // - chat-mobile-layout is visible (display: flex)
    // - chat-desktop-layout is hidden (display: none)

    // The chat thread area should be visible (full-screen on mobile)
    const mobileLayout = page.locator('.chat-mobile-layout');
    await expect(mobileLayout).toBeVisible();

    // Desktop layout should be hidden
    const desktopLayout = page.locator('.chat-desktop-layout');
    await expect(desktopLayout).toBeHidden();

    // The composer textbox should be visible on mobile (scoped to mobile layout)
    const composer = mobileLayout.getByPlaceholder('Ask anything about your emails');
    await expect(composer).toBeVisible();

    // The sidebar should NOT be visible by default (data-visible="false")
    const sidebar = page.locator('.chat-mobile-slide-sidebar');
    await expect(sidebar).toHaveAttribute('data-visible', 'false');

    // Click the hamburger/menu button to open sidebar (scoped to avoid ambiguity)
    const menuButton = page.locator('.chat-mobile-menu-btn');
    await expect(menuButton).toBeVisible();
    await menuButton.click();

    // Sidebar should now be visible
    await expect(sidebar).toHaveAttribute('data-visible', 'true');

    // Close sidebar by clicking the back button inside the sidebar panel.
    // The sidebar slides in via CSS transform -- use dispatchEvent to avoid
    // viewport/pointer-interception issues with the CSS transition layer.
    const backButton = sidebar.locator('.chat-mobile-back-btn');
    await expect(backButton).toBeVisible();
    await backButton.dispatchEvent('click');

    // Sidebar should be hidden again
    await expect(sidebar).toHaveAttribute('data-visible', 'false');
  });
});
