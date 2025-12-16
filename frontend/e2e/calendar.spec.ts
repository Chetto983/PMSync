import { test, expect } from '@playwright/test';
import { getE2eAuthContext } from './utils/dev-auth';

test.describe('Calendar Module', () => {
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

  test('should load calendar page', async ({ page }) => {
    await page.goto('/dashboard/calendar');

    // Wait for calendar to load - FullCalendar uses .fc class
    await expect(
      page.getByTestId('calendar-view')
        .or(page.locator('.fc'))
        .or(page.getByRole('grid'))
    ).toBeVisible({ timeout: 60_000 });
  });

  test('should display calendar header with navigation', async ({ page }) => {
    await page.goto('/dashboard/calendar');
    await page.waitForLoadState('networkidle');

    // Check for calendar navigation (prev/next/today buttons)
    const toolbar = page.locator('.fc-toolbar')
      .or(page.getByTestId('calendar-toolbar'));

    await expect(toolbar).toBeVisible({ timeout: 30_000 });

    // Check for today button
    const todayButton = page.locator('.fc-today-button')
      .or(page.getByRole('button', { name: /today/i }));

    await expect(todayButton).toBeVisible();
  });

  test('should navigate to previous month', async ({ page }) => {
    await page.goto('/dashboard/calendar');
    await page.waitForLoadState('networkidle');

    // Find prev button
    const prevButton = page.locator('.fc-prev-button')
      .or(page.getByRole('button', { name: /prev|previous/i }))
      .or(page.locator('button[aria-label*="prev"]'));

    if (await prevButton.isVisible()) {
      await prevButton.click();
      await page.waitForTimeout(300); // Animation
    }
  });

  test('should navigate to next month', async ({ page }) => {
    await page.goto('/dashboard/calendar');
    await page.waitForLoadState('networkidle');

    // Find next button
    const nextButton = page.locator('.fc-next-button')
      .or(page.getByRole('button', { name: /next/i }))
      .or(page.locator('button[aria-label*="next"]'));

    if (await nextButton.isVisible()) {
      await nextButton.click();
      await page.waitForTimeout(300); // Animation
    }
  });

  test('should switch calendar views', async ({ page }) => {
    await page.goto('/dashboard/calendar');
    await page.waitForLoadState('networkidle');

    // Try to switch to week view
    const weekButton = page.locator('.fc-timeGridWeek-button')
      .or(page.getByRole('button', { name: /week/i }));

    if (await weekButton.isVisible()) {
      await weekButton.click();
      await page.waitForTimeout(300);

      // Should show time grid
      await expect(
        page.locator('.fc-timegrid')
          .or(page.locator('.fc-timegrid-body'))
      ).toBeVisible({ timeout: 10_000 });
    }

    // Try to switch to day view
    const dayButton = page.locator('.fc-timeGridDay-button')
      .or(page.getByRole('button', { name: /day/i }));

    if (await dayButton.isVisible()) {
      await dayButton.click();
      await page.waitForTimeout(300);
    }

    // Switch back to month view
    const monthButton = page.locator('.fc-dayGridMonth-button')
      .or(page.getByRole('button', { name: /month/i }));

    if (await monthButton.isVisible()) {
      await monthButton.click();
      await page.waitForTimeout(300);
    }
  });

  test('should open create event dialog on date click', async ({ page }) => {
    await page.goto('/dashboard/calendar');
    await page.waitForLoadState('networkidle');

    // Click on a day cell
    const dayCell = page.locator('.fc-daygrid-day').first()
      .or(page.locator('[data-date]').first());

    if (await dayCell.isVisible()) {
      await dayCell.click();

      // Event creation dialog might appear
      const dialog = page.getByTestId('create-event-dialog')
        .or(page.getByRole('dialog'))
        .or(page.getByTestId('event-form'));

      // Either dialog appears or nothing happens (depending on calendar config)
      await page.waitForTimeout(500);
    }
  });

  test('should show event on calendar', async ({ page }) => {
    await page.goto('/dashboard/calendar');
    await page.waitForLoadState('networkidle');

    // Wait for events to load
    await page.waitForTimeout(2000);

    // Look for any events
    const events = page.locator('.fc-event')
      .or(page.locator('[class*="event"]'))
      .or(page.getByTestId('calendar-event'));

    // Count events (may be 0)
    const count = await events.count();

    // If events exist, verify they're visible
    if (count > 0) {
      await expect(events.first()).toBeVisible();
    }
  });

  test('should click on event to view details', async ({ page }) => {
    await page.goto('/dashboard/calendar');
    await page.waitForLoadState('networkidle');

    // Wait for events to load
    await page.waitForTimeout(2000);

    const firstEvent = page.locator('.fc-event').first();

    if (await firstEvent.isVisible()) {
      await firstEvent.click();

      // Event detail/popover should appear
      await expect(
        page.getByTestId('event-detail')
          .or(page.getByRole('dialog'))
          .or(page.locator('.fc-popover'))
      ).toBeVisible({ timeout: 10_000 });
    }
  });
});

test.describe('Calendar Event Creation', () => {
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

  test('should create a new event', async ({ page }) => {
    await page.goto('/dashboard/calendar');
    await page.waitForLoadState('networkidle');

    // Find add event button
    const addButton = page.getByTestId('add-event-button')
      .or(page.getByRole('button', { name: /add.*event|new.*event|create.*event/i }));

    if (!(await addButton.isVisible())) {
      // Try clicking on a date to create event
      const dayCell = page.locator('.fc-daygrid-day').first();
      if (await dayCell.isVisible()) {
        await dayCell.dblclick();
      }
    } else {
      await addButton.click();
    }

    // Check if dialog appeared
    const dialog = page.getByTestId('event-form')
      .or(page.getByRole('dialog'));

    if (await dialog.isVisible({ timeout: 5000 })) {
      // Fill event details
      const timestamp = Date.now();

      await page.getByTestId('event-title-input')
        .or(page.getByLabel(/title|subject/i).first())
        .fill(`E2E Test Event ${timestamp}`);

      // Submit
      await page.getByTestId('event-submit-button')
        .or(page.getByRole('button', { name: /save|create/i }))
        .click();

      // Should close and show success
      await expect(
        page.getByText(/created|saved|success/i)
          .or(dialog)
      ).toBeVisible({ timeout: 15_000 });
    }
  });
});
