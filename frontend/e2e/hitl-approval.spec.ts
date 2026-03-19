/**
 * HITL Approval Flow E2E Smoke Test
 *
 * Validates the SDK-native inline approval flow end-to-end:
 * 1. Trigger a HIGH-risk tool and deny it
 * 2. Verify the assistant acknowledges the action was not performed
 * 3. Trigger another HIGH-risk tool and approve it
 * 4. Verify the tool continues normally
 * 5. Verify the legacy poll-based HITL surface never appears
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

  test('inline HITL handles deny then approve without poll-based UI', async ({ page }) => {
    test.setTimeout(180_000);

    const legacyHitlRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/v1/ai/chat/pending-actions') || url.includes('/api/v1/ai/chat/approve')) {
        legacyHitlRequests.push(url);
      }
    });

    await page.goto('/dashboard/ai', { waitUntil: 'domcontentloaded', timeout: 30_000 });

    const chatInput = page.locator(
      'textarea[placeholder*="message"], textarea[placeholder*="Message"], ' +
      'input[placeholder*="message"], input[placeholder*="Message"], ' +
      '[role="textbox"]',
    );
    await chatInput.first().waitFor({ state: 'visible', timeout: 30_000 });

    const triggerMessage =
      "Send an email to test@example.com with subject 'HITL test' and body 'Testing'";
    await chatInput.first().fill(triggerMessage);

    const sendButton = page.locator(
      'button[type="submit"], button[aria-label*="send" i], button[aria-label*="Send"]',
    );
    if (await sendButton.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      await sendButton.first().click();
    } else {
      await chatInput.first().press('Enter');
    }

    const approvalCard = page.getByTestId('hitl-approval').first();
    const approveButton = approvalCard.getByTestId('hitl-approve');
    const denyButton = approvalCard.getByTestId('hitl-deny');

    await expect(approvalCard).toBeVisible({ timeout: 60_000 });
    await expect(approveButton).toBeVisible({ timeout: 5_000 });
    await expect(denyButton).toBeVisible({ timeout: 5_000 });

    const approvalText = await approvalCard.textContent();
    expect(approvalText?.toLowerCase()).toMatch(/send email to test@example\.com/i);
    expect(approvalText).toContain('HITL test');

    await denyButton.click();

    const denialAck = page.locator(
      'text=/not performed|denied|cancelled|canceled|did not|was not sent|won\'t send|will not send/i',
    ).first();
    await expect(denialAck).toBeVisible({ timeout: 30_000 });

    await chatInput.first().fill(
      "Send an email to test@example.com with subject 'HITL test approved' and body 'Testing approved flow'",
    );

    if (await sendButton.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      await sendButton.first().click();
    } else {
      await chatInput.first().press('Enter');
    }

    const secondApprovalCard = page.getByTestId('hitl-approval').last();
    await expect(secondApprovalCard).toBeVisible({ timeout: 60_000 });
    await expect(secondApprovalCard).toContainText('test@example.com');
    await secondApprovalCard.getByTestId('hitl-approve').click();

    const approvalAck = page.locator(
      'text=/queued|queued for delivery|will be sent|email to test@example\\.com/i',
    ).last();
    await expect(approvalAck).toBeVisible({ timeout: 30_000 });

    await expect(page.getByText(/Pending Actions|Needs Review/i)).toHaveCount(0);
    expect(legacyHitlRequests).toEqual([]);
  });
});
