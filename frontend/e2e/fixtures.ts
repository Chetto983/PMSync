/**
 * Playwright E2E Test Fixtures
 *
 * Provides common setup for email page E2E tests:
 * - Authenticated page context
 * - Mock API responses
 * - Test data factories
 */

import { test as base, Page } from '@playwright/test';

// Mock email data
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

// Mock folders data
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

// Mock user data (matches User interface in auth-store.ts)
export const mockUser = {
  id: 'user-1',
  email: 'user@test.com',
  firstName: 'Test',
  lastName: 'User',
  role: 'admin',
  tenantId: 'tenant-1',
};

// Extend base test with authenticated page
export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page }, use) => {
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

    // Mock API endpoints - paths match apiClient baseURL (localhost:3000)
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

    // Also mock /emails without query params
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

    // Mock voltagent endpoints (added in v3.0+)
    await page.route('**/localhost:3000/voltagent/**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ actions: [], total: 0, success: true }),
      });
    });

    // Mock CSRF token endpoint
    await page.route('**/localhost:3000/auth/csrf-token', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: 'test-csrf-token' }),
      });
    });

    // Mock legal acceptance check (v3.1 GDPR)
    await page.route('**/localhost:3000/legal/**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accepted: true, version: '1.0' }),
      });
    });

    // Mock consent endpoints (v3.1 GDPR)
    await page.route('**/localhost:3000/consent/**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ consents: [], features: [] }),
      });
    });

    // Mock subscription endpoints
    await page.route('**/localhost:3000/subscription/**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ plan: 'pro', status: 'active' }),
      });
    });

    // Catch-all for any unmocked localhost:3000 API call.
    // Returns 200 with empty JSON to prevent E2E failures when new
    // endpoints are added. Specific mocks above take priority.
    await page.route('**/localhost:3000/**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    // eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture callback, not a React hook
    await use(page);
  },
});

export { expect } from '@playwright/test';
