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

// Mock user data
export const mockUser = {
  id: 'user-1',
  email: 'user@test.com',
  name: 'Test User',
};

// Extend base test with authenticated page
export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page }, use) => {
    // Mock authentication - set token in localStorage
    await page.addInitScript(() => {
      localStorage.setItem('auth-token', 'test-jwt-token');
      localStorage.setItem('user', JSON.stringify({
        id: 'user-1',
        email: 'user@test.com',
        name: 'Test User',
      }));
    });

    // Mock API endpoints
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

    await use(page);
  },
});

export { expect } from '@playwright/test';
