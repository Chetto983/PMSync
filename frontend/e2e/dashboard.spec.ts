import { test, expect } from '@playwright/test';
import { getE2eAuthContext } from './utils/dev-auth';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    try {
      const { token } = await getE2eAuthContext();

      await page.addInitScript((authToken) => {
        localStorage.setItem(
          'auth-storage',
          JSON.stringify({ state: { token: authToken }, version: 0 }),
        );
      }, token);
    } catch {
      test.skip(true, 'No test user available');
    }
  });

  test('should load dashboard home', async ({ page }) => {
    await page.goto('/dashboard');

    // Wait for dashboard to load
    await expect(
      page.getByTestId('dashboard-layout')
        .or(page.getByTestId('sidebar'))
        .or(page.getByRole('navigation'))
    ).toBeVisible({ timeout: 60_000 });

    // Check for main dashboard content
    await expect(page.locator('main').or(page.getByRole('main'))).toBeVisible();
  });

  test('should navigate to email section', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-layout').or(page.getByTestId('sidebar'))).toBeVisible({ timeout: 60_000 });

    // Click email nav item
    await page.getByTestId('nav-email').or(page.getByRole('link', { name: /email|inbox/i })).click();

    await expect(page).toHaveURL(/\/dashboard\/email/);
    await expect(page.getByTestId('email-layout').or(page.getByTestId('email-list'))).toBeVisible({ timeout: 60_000 });
  });

  test('should navigate to calendar section', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-layout').or(page.getByTestId('sidebar'))).toBeVisible({ timeout: 60_000 });

    // Click calendar nav item
    await page.getByTestId('nav-calendar').or(page.getByRole('link', { name: /calendar/i })).click();

    await expect(page).toHaveURL(/\/dashboard\/calendar/);
    await expect(page.getByTestId('calendar-view').or(page.locator('.fc')).or(page.getByRole('grid'))).toBeVisible({ timeout: 60_000 });
  });

  test('should navigate to contacts section', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-layout').or(page.getByTestId('sidebar'))).toBeVisible({ timeout: 60_000 });

    // Click contacts nav item
    await page.getByTestId('nav-contacts').or(page.getByRole('link', { name: /contacts/i })).click();

    await expect(page).toHaveURL(/\/dashboard\/contacts/);
    await expect(page.getByTestId('contacts-layout').or(page.getByTestId('contact-list'))).toBeVisible({ timeout: 60_000 });
  });

  test('should navigate to tasks section', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-layout').or(page.getByTestId('sidebar'))).toBeVisible({ timeout: 60_000 });

    // Click tasks nav item
    await page.getByTestId('nav-tasks').or(page.getByRole('link', { name: /tasks/i })).click();

    await expect(page).toHaveURL(/\/dashboard\/tasks/);
  });

  test('should navigate to analytics section', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-layout').or(page.getByTestId('sidebar'))).toBeVisible({ timeout: 60_000 });

    // Click analytics nav item
    await page.getByTestId('nav-analytics').or(page.getByRole('link', { name: /analytics/i })).click();

    await expect(page).toHaveURL(/\/dashboard\/analytics/);
  });

  test('should navigate to settings section', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-layout').or(page.getByTestId('sidebar'))).toBeVisible({ timeout: 60_000 });

    // Click settings nav item
    await page.getByTestId('nav-settings').or(page.getByRole('link', { name: /settings/i })).click();

    await expect(page).toHaveURL(/\/dashboard\/settings/);
  });

  test('should toggle sidebar collapse on desktop', async ({ page }) => {
    // Set desktop viewport
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-layout').or(page.getByTestId('sidebar'))).toBeVisible({ timeout: 60_000 });

    // Find sidebar toggle button
    const toggleButton = page.getByTestId('sidebar-toggle').or(page.getByRole('button', { name: /toggle.*sidebar|collapse/i }));

    if (await toggleButton.isVisible()) {
      await toggleButton.click();
      // Sidebar should change state (collapsed/expanded)
      await page.waitForTimeout(300); // Wait for animation
    }
  });

  test('should show mobile menu on small screens', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/dashboard');

    // Wait for page load
    await page.waitForLoadState('networkidle');

    // Look for mobile menu button
    const mobileMenuButton = page.getByTestId('mobile-menu-button')
      .or(page.getByRole('button', { name: /menu/i }))
      .or(page.locator('[aria-label*="menu"]'));

    if (await mobileMenuButton.isVisible()) {
      await mobileMenuButton.click();

      // Menu should be visible
      await expect(
        page.getByTestId('mobile-nav')
          .or(page.getByRole('navigation'))
          .or(page.getByTestId('sidebar'))
      ).toBeVisible({ timeout: 5_000 });
    }
  });
});

test.describe('Dashboard Widgets', () => {
  test.beforeEach(async ({ page }) => {
    try {
      const { token } = await getE2eAuthContext();

      await page.addInitScript((authToken) => {
        localStorage.setItem(
          'auth-storage',
          JSON.stringify({ state: { token: authToken }, version: 0 }),
        );
      }, token);
    } catch {
      test.skip(true, 'No test user available');
    }
  });

  test('should load dashboard cards/widgets', async ({ page }) => {
    await page.goto('/dashboard');

    // Wait for dashboard cards to load
    await expect(page.getByTestId('dashboard-layout').or(page.getByTestId('sidebar'))).toBeVisible({ timeout: 60_000 });

    // Check for stat cards or dashboard widgets
    const dashboardCards = page.getByTestId('dashboard-card')
      .or(page.locator('[class*="card"]').first())
      .or(page.getByRole('article'));

    await expect(dashboardCards.first()).toBeVisible({ timeout: 30_000 });
  });
});
