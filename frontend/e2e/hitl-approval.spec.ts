/**
 * HITL Approval Flow E2E Smoke Test
 *
 * Validates the SDK-native HITL approval flow end-to-end:
 * 1. Triggers a HIGH-risk tool (send_email) via chat
 * 2. Waits for the approval card to appear inline
 * 3. Verifies approval card contents (summary, buttons)
 * 4. Denies the action
 * 5. Verifies AI acknowledges the denial
 *
 * Requirements: Running backend with AI model access.
 * Tags: @smoke @hitl
 *
 * Phase 77 Plan 03: AICP-14 coverage.
 */
import { test, expect } from '@playwright/test';

// Test uses auth state from setup project (storageState: playwright/.auth/user.json)

test.describe('HITL Approval Flow @smoke @hitl', () => {
  test.describe.configure({ retries: 2 });

  test('deny a HIGH-risk tool shows approval card and acknowledges denial', async ({ page }) => {
    // Generous timeout for AI model latency
    test.setTimeout(120_000);

    // Navigate to chat UI
    await page.goto('/chat', { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Wait for chat interface to be ready
    const chatInput = page.locator(
      'textarea[placeholder*="message"], textarea[placeholder*="Message"], ' +
      'input[placeholder*="message"], input[placeholder*="Message"], ' +
      '[role="textbox"]',
    );
    await chatInput.first().waitFor({ state: 'visible', timeout: 30_000 });

    // Type a message that triggers send_email (HIGH-risk tool)
    const triggerMessage =
      "Send an email to test-hitl@example.com with subject 'HITL Test' and body 'Testing the approval flow'";
    await chatInput.first().fill(triggerMessage);

    // Submit the message
    const sendButton = page.locator(
      'button[type="submit"], button[aria-label*="send" i], button[aria-label*="Send"]',
    );
    if (await sendButton.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      await sendButton.first().click();
    } else {
      // Fallback: press Enter
      await chatInput.first().press('Enter');
    }

    // Wait for the approval card to appear in the chat
    // The HitlApprovalWrapper renders with warning border and approve/deny buttons
    const approvalCard = page.locator('[data-testid="hitl-approval"], [class*="approval"], [class*="Approval"]').first();
    const denyButton = page.locator('button:has-text("Deny"), button:has-text("deny"), button:has-text("Reject"), button:has-text("reject")').first();
    const approveButton = page.locator('button:has-text("Approve"), button:has-text("approve")').first();

    // Wait for either the approval card container or the deny button to appear
    // (different implementations may use different selectors)
    await expect(
      denyButton.or(approvalCard),
    ).toBeVisible({ timeout: 60_000 });

    // Verify the approve button is also present
    await expect(approveButton).toBeVisible({ timeout: 5_000 });

    // Verify the approval card contains some human-readable content
    // (not raw JSON, but tool summary mentioning send/email)
    const approvalArea = denyButton.locator('..').locator('..');
    const approvalText = await approvalArea.textContent();
    expect(approvalText?.toLowerCase()).toMatch(/send|email|test-hitl/i);

    // Click Deny (safer than approve -- don't actually send an email)
    await denyButton.click();

    // Wait for AI to respond acknowledging the denial
    // The AI should mention the action was not performed/denied/cancelled
    const denialAck = page.locator(
      'text=/not performed|denied|cancelled|canceled|did not|was not sent|won\'t send|will not send/i',
    ).first();
    await expect(denialAck).toBeVisible({ timeout: 30_000 });
  });
});
