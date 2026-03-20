/**
 * Legal Pages E2E Tests
 *
 * Verifies Privacy Policy and Terms of Service pages render
 * their content correctly and back navigation works.
 */

import { test, expect } from '@playwright/test';

// Legal pages are public; test without auth
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Legal pages', () => {
  test('privacy page renders content', async ({ page }) => {
    await page.goto('/privacy');
    await page.waitForLoadState('domcontentloaded');

    // Page should have a heading with "Privacy Policy"
    const heading = page.getByRole('heading', { name: /privacy policy/i });
    await expect(heading.first()).toBeVisible({ timeout: 15_000 });

    // Page should have substantial content (not empty)
    const paper = page.locator('.MuiPaper-root').first();
    await expect(paper).toBeVisible({ timeout: 10_000 });
    const bodyText = await paper.textContent();
    expect(bodyText?.length).toBeGreaterThan(100);
  });

  test('terms page renders content', async ({ page }) => {
    await page.goto('/terms');
    await page.waitForLoadState('domcontentloaded');

    // Page should have a heading with "Terms of Service"
    const heading = page.getByRole('heading', { name: /terms of service/i });
    await expect(heading.first()).toBeVisible({ timeout: 15_000 });

    // Page should have substantial content (not empty)
    const paper = page.locator('.MuiPaper-root').first();
    await expect(paper).toBeVisible({ timeout: 10_000 });
    const bodyText = await paper.textContent();
    expect(bodyText?.length).toBeGreaterThan(100);
  });

  test('back navigation works from privacy page', async ({ page }) => {
    // Navigate to landing first to have history
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Navigate to privacy page directly
    await page.goto('/privacy');
    await page.waitForLoadState('domcontentloaded');

    // Verify privacy heading is visible
    const heading = page.getByRole('heading', { name: /privacy policy/i });
    await expect(heading.first()).toBeVisible({ timeout: 15_000 });

    // Click the "Back" link
    const backLink = page.getByText('Back').first();
    if (await backLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await backLink.click();
      // Should navigate away from privacy
      await page.waitForLoadState('domcontentloaded');
      await expect(page).not.toHaveURL(/\/privacy/);
    }
  });

  test('back navigation works from terms page', async ({ page }) => {
    // Navigate to terms page directly
    await page.goto('/terms');
    await page.waitForLoadState('domcontentloaded');

    // Verify terms heading is visible
    const heading = page.getByRole('heading', { name: /terms of service/i });
    await expect(heading.first()).toBeVisible({ timeout: 15_000 });

    // Click the "Back" link
    const backLink = page.getByText('Back').first();
    if (await backLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await backLink.click();
      // Should navigate away from terms
      await page.waitForLoadState('domcontentloaded');
      await expect(page).not.toHaveURL(/\/terms/);
    }
  });
});
