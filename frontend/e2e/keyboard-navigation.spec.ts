/**
 * Keyboard Navigation E2E Tests
 *
 * Tests for Vim-style keyboard navigation (Phase 9):
 * - j/k for next/previous
 * - Enter to open
 * - Escape to close
 * - x to toggle selection
 * - c to compose
 * - Arrow keys as alternative
 */

import { test, expect, mockEmails } from './fixtures';

test.describe('Keyboard Navigation', () => {
  test.beforeEach(async ({ authedPage }) => {
    // Set desktop viewport for reading pane tests
    await authedPage.setViewportSize({ width: 1440, height: 900 });
    await authedPage.goto('/dashboard/email');
    await authedPage.waitForSelector('[data-testid="thread-list-item"]', {
      timeout: 10000,
    });
  });

  test('j key moves focus to next email', async ({ authedPage }) => {
    // Press j to focus first email
    await authedPage.keyboard.press('j');

    // First email should have focus indicator
    const firstEmail = authedPage.locator('[data-testid="thread-list-item"]').first();
    await expect(firstEmail).toHaveAttribute('data-focused', 'true');

    // Press j again to move to second email
    await authedPage.keyboard.press('j');

    // Second email should have focus, first should not
    const secondEmail = authedPage.locator('[data-testid="thread-list-item"]').nth(1);
    await expect(secondEmail).toHaveAttribute('data-focused', 'true');
    await expect(firstEmail).not.toHaveAttribute('data-focused', 'true');
  });

  test('k key moves focus to previous email', async ({ authedPage }) => {
    // First press j twice to focus second email
    await authedPage.keyboard.press('j');
    await authedPage.keyboard.press('j');

    // Second email should be focused
    const secondEmail = authedPage.locator('[data-testid="thread-list-item"]').nth(1);
    await expect(secondEmail).toHaveAttribute('data-focused', 'true');

    // Press k to move back to first email
    await authedPage.keyboard.press('k');

    // First email should have focus
    const firstEmail = authedPage.locator('[data-testid="thread-list-item"]').first();
    await expect(firstEmail).toHaveAttribute('data-focused', 'true');
    await expect(secondEmail).not.toHaveAttribute('data-focused', 'true');
  });

  test('Enter key opens focused email', async ({ authedPage }) => {
    // Focus first email
    await authedPage.keyboard.press('j');

    // Press Enter to open
    await authedPage.keyboard.press('Enter');

    // Reading pane should show first email
    const readingPane = authedPage.locator('[data-testid="reading-pane"]');
    await expect(readingPane).toBeVisible();
    await expect(readingPane).toContainText('Project Update');
  });

  test('Escape key closes reading pane', async ({ authedPage }) => {
    // Open first email
    await authedPage.keyboard.press('j');
    await authedPage.keyboard.press('Enter');

    // Wait for reading pane
    const readingPane = authedPage.locator('[data-testid="reading-pane"]');
    await expect(readingPane).toBeVisible();

    // Press Escape to close
    await authedPage.keyboard.press('Escape');

    // Reading pane should be hidden
    await expect(readingPane).not.toBeVisible();
  });

  test('Escape key clears focus when no reading pane', async ({ authedPage }) => {
    // Focus first email
    await authedPage.keyboard.press('j');
    const firstEmail = authedPage.locator('[data-testid="thread-list-item"]').first();
    await expect(firstEmail).toHaveAttribute('data-focused', 'true');

    // Press Escape to clear focus
    await authedPage.keyboard.press('Escape');

    // No email should be focused
    await expect(firstEmail).not.toHaveAttribute('data-focused', 'true');
  });

  test('x key toggles selection on focused email', async ({ authedPage }) => {
    // Focus first email
    await authedPage.keyboard.press('j');

    // Press x to select
    await authedPage.keyboard.press('x');

    // First email checkbox should be checked
    const firstEmail = authedPage.locator('[data-testid="thread-list-item"]').first();
    const checkbox = firstEmail.locator('input[type="checkbox"]');
    await expect(checkbox).toBeChecked();

    // Press x again to deselect
    await authedPage.keyboard.press('x');
    await expect(checkbox).not.toBeChecked();
  });

  test('c key opens compose page', async ({ authedPage }) => {
    // Press c to compose
    await authedPage.keyboard.press('c');

    // Should navigate to compose page
    await expect(authedPage).toHaveURL(/\/dashboard\/email\/compose/);
  });

  test('Arrow keys work as alternative to j/k', async ({ authedPage }) => {
    // Press ArrowDown to focus first email
    await authedPage.keyboard.press('ArrowDown');

    const firstEmail = authedPage.locator('[data-testid="thread-list-item"]').first();
    await expect(firstEmail).toHaveAttribute('data-focused', 'true');

    // Press ArrowDown again for second
    await authedPage.keyboard.press('ArrowDown');

    const secondEmail = authedPage.locator('[data-testid="thread-list-item"]').nth(1);
    await expect(secondEmail).toHaveAttribute('data-focused', 'true');

    // Press ArrowUp to go back
    await authedPage.keyboard.press('ArrowUp');
    await expect(firstEmail).toHaveAttribute('data-focused', 'true');
  });

  test('keyboard navigation is disabled when typing in input', async ({ authedPage }) => {
    // Click on search input
    const searchInput = authedPage.locator('[data-testid="email-search"]');
    if (await searchInput.isVisible()) {
      await searchInput.click();

      // Type 'j' - should go into input, not trigger navigation
      await authedPage.keyboard.type('jjj');

      // Input should contain the typed text
      await expect(searchInput).toHaveValue('jjj');

      // No email should be focused (navigation disabled)
      const emails = authedPage.locator('[data-testid="thread-list-item"][data-focused="true"]');
      await expect(emails).toHaveCount(0);
    }
  });

  test('j at last email does not go beyond', async ({ authedPage }) => {
    // Navigate to last email
    for (let i = 0; i < mockEmails.length; i++) {
      await authedPage.keyboard.press('j');
    }

    // Last email should be focused
    const lastEmail = authedPage.locator('[data-testid="thread-list-item"]').last();
    await expect(lastEmail).toHaveAttribute('data-focused', 'true');

    // Press j again - should stay on last
    await authedPage.keyboard.press('j');
    await expect(lastEmail).toHaveAttribute('data-focused', 'true');
  });

  test('k at first email does not go beyond', async ({ authedPage }) => {
    // Focus first email
    await authedPage.keyboard.press('j');

    const firstEmail = authedPage.locator('[data-testid="thread-list-item"]').first();
    await expect(firstEmail).toHaveAttribute('data-focused', 'true');

    // Press k - should stay on first
    await authedPage.keyboard.press('k');
    await expect(firstEmail).toHaveAttribute('data-focused', 'true');
  });
});

test.describe('Keyboard Navigation - Mobile', () => {
  test('c key still works on mobile', async ({ authedPage }) => {
    // Set mobile viewport
    await authedPage.setViewportSize({ width: 375, height: 812 });
    await authedPage.goto('/dashboard/email');
    await authedPage.waitForSelector('[data-testid="thread-list-item"]', {
      timeout: 10000,
    });

    // Press c to compose
    await authedPage.keyboard.press('c');

    // Should navigate to compose page
    await expect(authedPage).toHaveURL(/\/dashboard\/email\/compose/);
  });
});
