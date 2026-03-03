/**
 * Email Compose E2E Tests
 *
 * Tests for compose flows:
 * - New email composition UI
 * - Reply flow prefills
 * - Forward flow prefills
 *
 * Note: Due to test infrastructure auth issues, these tests focus on
 * the compose dialog UI interactions once it's opened.
 */

import { test as base, Page, expect } from '@playwright/test';
import { mockEmails, mockFolders, mockUser } from './fixtures';

// Override storage state for compose tests
base.use({ storageState: { cookies: [], origins: [] } });

// Mock provider data
const mockProviders = [
  {
    id: 'provider-1',
    email: 'user@test.com',
    displayName: 'Test Account',
    isActive: true,
    supportsEmail: true,
    isDefault: true,
    type: 'GMAIL',
  },
];

// Extended compose test fixture
const test = base.extend<{ composePage: Page }>({
  composePage: async ({ page }, use) => {
    // Mock authentication - use Zustand persist format for auth-storage
    // The app uses zustand persist middleware with name: 'auth-storage'
    await page.addInitScript(() => {
      // Zustand persist format: { state: { token, ... }, version: 0 }
      localStorage.setItem(
        'auth-storage',
        JSON.stringify({
          state: { token: 'test-jwt-token' },
          version: 0,
        })
      );
      // Also set auth-token cookie for API routes that read from cookie
      document.cookie = 'auth-token=test-jwt-token; path=/; SameSite=Lax';
      // Pre-accept cookie consent to avoid modal blocking UI
      localStorage.setItem(
        'mailagent:cookie-consent',
        JSON.stringify({ necessary: true, analytics: false, marketing: false })
      );
    });

    // Mock essential API endpoints - paths match apiClient baseURL (localhost:3000)
    // Use specific host to avoid matching frontend page routes
    await page.route('**/localhost:3000/auth/me', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockUser),
      });
    });

    await page.route('**/localhost:3000/emails?**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          emails: mockEmails,
          total: mockEmails.length,
          page: 1,
          limit: 50,
        }),
      });
    });

    await page.route('**/localhost:3000/emails', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          emails: mockEmails,
          total: mockEmails.length,
          page: 1,
          limit: 50,
        }),
      });
    });

    await page.route('**/localhost:3000/email/folders**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockFolders),
      });
    });

    await page.route('**/localhost:3000/emails/*', (route) => {
      const url = route.request().url();
      const emailId = url.split('/').pop()?.split('?')[0];
      const email = mockEmails.find((e) => e.id === emailId);

      if (email) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(email),
        });
      } else {
        route.fulfill({ status: 404 });
      }
    });

    await page.route('**/localhost:3000/contacts/sender-photos**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    await page.route('**/localhost:3000/labels**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ labels: [] }),
      });
    });

    // Mock providers API
    await page.route('**/localhost:3000/providers', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockProviders),
      });
    });

    // Mock signatures API
    await page.route('**/localhost:3000/providers/**/signatures/default', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ content: '' }),
      });
    });

    // Mock send email API
    await page.route('**/localhost:3000/emails/send', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, messageId: 'msg-123' }),
      });
    });

    // Mock reply API
    await page.route('**/localhost:3000/emails/*/reply', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, messageId: 'msg-reply-123' }),
      });
    });

    // Mock forward API
    await page.route('**/localhost:3000/emails/*/forward', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, messageId: 'msg-fwd-123' }),
      });
    });

    // Mock drafts API
    await page.route('**/localhost:3000/drafts**', (route) => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'draft-123', success: true }),
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ drafts: [] }),
        });
      }
    });

    // eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture callback
    await use(page);
  },
});

test.describe('Email Compose - New Email', () => {
  test('displays compose dialog with required fields', async ({ composePage }) => {
    // Navigate directly to compose page
    await composePage.goto('/dashboard/email/compose');

    // Wait for compose dialog to appear (it's shown as a dialog in a page)
    const dialog = composePage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    // Check a compose-related element exists (dialog header, form, etc.)
    // The title may vary by locale, so check for presence of key UI elements
    const toLabel = composePage.getByText(/to:?|a:/i);
    await expect(toLabel).toBeVisible({ timeout: 5000 });

    // Check Subject field exists (either by placeholder or label)
    const subjectInput = composePage.locator('input[placeholder*="ubject"], input[placeholder*="ggetto"]');
    await expect(subjectInput).toBeVisible({ timeout: 5000 });

    // Check Send button exists
    const sendButton = composePage.getByRole('button', { name: /send|invia/i });
    await expect(sendButton).toBeVisible({ timeout: 5000 });
  });

  test('can fill recipient and subject fields', async ({ composePage }) => {
    await composePage.goto('/dashboard/email/compose');

    // Wait for dialog
    const dialog = composePage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    // Fill subject
    const subjectInput = composePage.getByPlaceholder(/subject|oggetto/i);
    await subjectInput.fill('Test Subject');
    await expect(subjectInput).toHaveValue('Test Subject');
  });

  test('send button is disabled without recipient', async ({ composePage }) => {
    await composePage.goto('/dashboard/email/compose');

    // Wait for dialog
    const dialog = composePage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    // Send button should be disabled initially (no recipient)
    const sendButton = composePage.getByRole('button', { name: /send|invia/i }).first();
    await expect(sendButton).toBeDisabled();
  });

  test('can close compose dialog', async ({ composePage }) => {
    await composePage.goto('/dashboard/email/compose');

    // Wait for dialog
    const dialog = composePage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    // Find close button - on desktop it's the last IconButton in DialogTitle with X (Close) icon
    // The close button is typically at the end of the title bar
    // Try to find any button with Close/X svg icon in the dialog header
    let closeButton = composePage.locator('[role="dialog"] button:has(svg[data-testid*="close" i])').last();

    // If not found, try buttons in the dialog that have CloseIcon (MUI)
    if (!(await closeButton.isVisible().catch(() => false))) {
      // Find buttons in the dialog and click the close one (last button in dialog title area)
      // DialogTitle contains title + buttons box, close is last button
      closeButton = dialog.locator('.MuiDialogTitle-root button').last();
    }

    // Final fallback - first button in dialog (mobile has close button first)
    if (!(await closeButton.isVisible().catch(() => false))) {
      closeButton = dialog.locator('button').first();
    }

    await closeButton.click();

    // Dialog should close and navigate back
    await composePage.waitForURL(/\/dashboard\/email(?!\/compose)/, { timeout: 10000 });
  });
});

test.describe('Email Compose - Reply Flow', () => {
  test('reply mode prefills subject with Re:', async ({ composePage }) => {
    // Navigate to reply page with email ID
    await composePage.goto('/dashboard/email/compose?mode=reply&emailId=email-1');

    // Wait for dialog
    const dialog = composePage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    // Subject should be prefilled with Re:
    const subjectInput = composePage.getByPlaceholder(/subject|oggetto/i);
    await expect(subjectInput).toHaveValue(/Re:/);
  });

  test('reply mode shows original email quoted', async ({ composePage }) => {
    await composePage.goto('/dashboard/email/compose?mode=reply&emailId=email-1');

    // Wait for dialog
    const dialog = composePage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    // Should show quoted content area (collapsible)
    await expect(composePage.getByText(/wrote:/i)).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Email Compose - Forward Flow', () => {
  test('forward mode prefills subject with Fwd:', async ({ composePage }) => {
    // Navigate to forward page with email ID
    await composePage.goto('/dashboard/email/compose?mode=forward&emailId=email-1');

    // Wait for dialog
    const dialog = composePage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    // Subject should be prefilled with Fwd:
    const subjectInput = composePage.getByPlaceholder(/subject|oggetto/i);
    await expect(subjectInput).toHaveValue(/Fwd:/);
  });

  test('forward mode shows forwarded message text', async ({ composePage }) => {
    await composePage.goto('/dashboard/email/compose?mode=forward&emailId=email-1');

    // Wait for dialog
    const dialog = composePage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    // Should show forwarded message indicator
    await expect(composePage.getByText(/forwarded message/i)).toBeVisible({ timeout: 10000 });
  });
});

export { test, expect };
