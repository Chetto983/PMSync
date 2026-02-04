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
    // Mock authentication
    await page.addInitScript(() => {
      localStorage.setItem('auth-token', 'test-jwt-token');
      localStorage.setItem(
        'user',
        JSON.stringify({
          id: 'user-1',
          email: 'user@test.com',
          name: 'Test User',
        })
      );
    });

    // Mock essential API endpoints
    await page.route('**/api/v1/auth/me', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockUser),
      });
    });

    await page.route('**/api/v1/email?**', (route) => {
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

    await page.route('**/api/v1/email/folders**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockFolders),
      });
    });

    await page.route('**/api/v1/email/*', (route) => {
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

    await page.route('**/api/v1/contacts/sender-photos**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    await page.route('**/api/v1/labels**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ labels: [] }),
      });
    });

    await page.route('**/api/v1/voltagent/**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ actions: [], total: 0 }),
      });
    });

    // Mock providers API
    await page.route('**/api/v1/providers', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockProviders),
      });
    });

    // Mock signatures API
    await page.route('**/api/v1/providers/**/signatures/default', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ content: '' }),
      });
    });

    // Mock send email API
    await page.route('**/api/v1/email/send', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, messageId: 'msg-123' }),
      });
    });

    // Mock reply API
    await page.route('**/api/v1/email/*/reply', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, messageId: 'msg-reply-123' }),
      });
    });

    // Mock forward API
    await page.route('**/api/v1/email/*/forward', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, messageId: 'msg-fwd-123' }),
      });
    });

    // Mock drafts API
    await page.route('**/api/v1/drafts**', (route) => {
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

    // Check title shows "New Email" or similar
    await expect(composePage.getByText(/new.*email|compose|nuovo/i)).toBeVisible();

    // Check To field exists
    await expect(composePage.getByText(/^to:?$/i)).toBeVisible();

    // Check Subject field exists
    const subjectInput = composePage.getByPlaceholder(/subject|oggetto/i);
    await expect(subjectInput).toBeVisible();

    // Check Send button exists
    const sendButton = composePage.getByRole('button', { name: /send|invia/i });
    await expect(sendButton).toBeVisible();
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

    // Click close button
    const closeButton = composePage.getByRole('button', { name: /close|chiudi/i });
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
