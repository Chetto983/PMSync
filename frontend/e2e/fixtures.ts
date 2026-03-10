/**
 * Playwright E2E Test Fixtures
 *
 * Provides common setup for email page E2E tests:
 * - Authenticated page context
 * - Test data constants (inert, retained for transition)
 */

import { test as base, Page, BrowserContext } from '@playwright/test';

// Mock email data (inert constants -- retained for transition to Phase 71)
export const mockEmails = [
  {
    id: 'email-1',
    from: 'Alice Smith <alice@example.com>',
    to: ['user@test.com'],
    subject: 'Project Update - Q1 Review',
    snippet: 'Hi team, here is the Q1 review summary...',
    bodyText: 'Hi team, here is the Q1 review summary with all the details.',
    bodyHtml: '<p>Hi team, here is the Q1 review summary with all the details.</p>',
    receivedAt: new Date().toISOString(),
    isRead: false,
    isFlagged: false,
    isStarred: false,
    providerId: 'provider-1',
    attachments: [],
    emailLabels: [],
  },
  {
    id: 'email-2',
    from: 'Bob Jones <bob@example.com>',
    to: ['user@test.com'],
    subject: 'Meeting Tomorrow at 2pm',
    snippet: 'Can we meet tomorrow to discuss the roadmap?',
    bodyText: 'Can we meet tomorrow to discuss the roadmap?',
    bodyHtml: '<p>Can we meet tomorrow to discuss the roadmap?</p>',
    receivedAt: new Date(Date.now() - 3600000).toISOString(),
    isRead: true,
    isFlagged: true,
    isStarred: true,
    providerId: 'provider-1',
    attachments: [],
    emailLabels: [],
  },
  {
    id: 'email-3',
    from: 'Carol Lee <carol@example.com>',
    to: ['user@test.com'],
    subject: 'Invoice #1234 Attached',
    snippet: 'Please find attached the invoice for March services.',
    bodyText: 'Please find attached the invoice for March services.',
    bodyHtml: '<p>Please find attached the invoice for March services.</p>',
    receivedAt: new Date(Date.now() - 7200000).toISOString(),
    isRead: true,
    isFlagged: false,
    isStarred: false,
    providerId: 'provider-1',
    attachments: [{ id: 'att-1', filename: 'invoice.pdf', size: 102400 }],
    emailLabels: [],
  },
];

// Mock folders data (inert constants -- retained for transition to Phase 71)
export const mockFolders = {
  foldersByProvider: {
    'provider-1': [
      { id: 'folder-inbox', name: 'INBOX', path: 'INBOX', type: 'INBOX' },
      { id: 'folder-sent', name: 'Sent', path: 'Sent', type: 'SENT' },
      { id: 'folder-drafts', name: 'Drafts', path: 'Drafts', type: 'DRAFTS' },
      { id: 'folder-trash', name: 'Trash', path: 'Trash', type: 'TRASH' },
    ],
  },
};

// Mock user data (inert constants -- retained for transition to Phase 71)
export const mockUser = {
  id: 'user-1',
  email: 'user@test.com',
  firstName: 'Test',
  lastName: 'User',
  role: 'admin',
  tenantId: 'tenant-1',
};

/**
 * Inject better-auth session cookie for E2E test authentication.
 */
export async function injectAuthCookie(context: BrowserContext, token: string) {
  await context.addCookies([{
    name: 'better-auth.session_token',
    value: token,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    secure: false, // localhost in test
  }]);
}

// Extend base test with authenticated page
export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page }, use) => {
    // Inject httpOnly cookie for auth
    await injectAuthCookie(page.context(), 'test-jwt-token');

    // Pre-accept cookie consent to avoid modal blocking UI
    await page.addInitScript(() => {
      localStorage.setItem(
        'pmsync:cookie-consent',
        JSON.stringify({ necessary: true, analytics: false, marketing: false })
      );
    });

    // No API route mocking -- E2E tests hit real backend on port 3100
    // Existing E2E specs may fail until rewritten in Phase 71

    // eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture callback, not a React hook
    await use(page);
  },
});

export { expect } from '@playwright/test';
