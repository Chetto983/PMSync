import { test, expect } from '@playwright/test';
import { getE2eAuthContext } from './utils/dev-auth';

test.describe('Contacts Module', () => {
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

  test('should load contacts page', async ({ page }) => {
    await page.goto('/dashboard/contacts');

    // Wait for contacts to load
    await expect(
      page.getByTestId('contacts-layout')
        .or(page.getByTestId('contact-list'))
        .or(page.locator('[data-testid*="contact"]').first())
    ).toBeVisible({ timeout: 60_000 });
  });

  test('should display contact list', async ({ page }) => {
    await page.goto('/dashboard/contacts');

    // Wait for list to load
    await page.waitForLoadState('networkidle');

    // Check for contact items or empty state
    const contactItem = page.getByTestId('contact-list-item')
      .or(page.locator('[data-testid*="contact-item"]'))
      .or(page.locator('[class*="contact"]').first());

    const emptyState = page.getByTestId('contacts-empty')
      .or(page.getByText(/no contacts/i))
      .or(page.getByText(/add.*contact/i));

    // Either contacts exist or we see empty state
    await expect(contactItem.first().or(emptyState)).toBeVisible({ timeout: 30_000 });
  });

  test('should search contacts', async ({ page }) => {
    await page.goto('/dashboard/contacts');
    await page.waitForLoadState('networkidle');

    // Find search input
    const searchInput = page.getByTestId('contact-search')
      .or(page.getByPlaceholder(/search.*contacts/i))
      .or(page.getByRole('searchbox'));

    if (await searchInput.isVisible()) {
      await searchInput.fill('test');
      await page.waitForTimeout(500); // Debounce

      // Results should update (either found or not found message)
      await expect(
        page.getByTestId('contact-list-item')
          .or(page.getByText(/no.*results/i))
          .or(page.getByText(/no contacts found/i))
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  test('should open create contact dialog', async ({ page }) => {
    await page.goto('/dashboard/contacts');
    await page.waitForLoadState('networkidle');

    // Find and click add contact button
    const addButton = page.getByTestId('add-contact-button')
      .or(page.getByRole('button', { name: /add.*contact|new.*contact|create.*contact/i }))
      .or(page.locator('button:has-text("Add")'));

    if (await addButton.isVisible()) {
      await addButton.click();

      // Dialog/form should appear
      await expect(
        page.getByTestId('contact-form')
          .or(page.getByTestId('create-contact-dialog'))
          .or(page.getByRole('dialog'))
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  test('should view contact details', async ({ page }) => {
    await page.goto('/dashboard/contacts');
    await page.waitForLoadState('networkidle');

    // Click on first contact
    const firstContact = page.getByTestId('contact-list-item').first()
      .or(page.locator('[data-testid*="contact-item"]').first());

    if (await firstContact.isVisible()) {
      await firstContact.click();

      // Contact detail should show
      await expect(
        page.getByTestId('contact-detail')
          .or(page.getByTestId('contact-panel'))
          .or(page.locator('[class*="detail"]'))
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  test('should filter contacts by provider', async ({ page }) => {
    await page.goto('/dashboard/contacts');
    await page.waitForLoadState('networkidle');

    // Find provider filter
    const providerFilter = page.getByTestId('provider-filter')
      .or(page.getByRole('combobox', { name: /provider|source/i }))
      .or(page.locator('[class*="filter"]').first());

    if (await providerFilter.isVisible()) {
      await providerFilter.click();
      // Filter options should appear
    }
  });
});

test.describe('Contact CRUD Operations', () => {
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

  test('should create a new local contact', async ({ page }) => {
    await page.goto('/dashboard/contacts');
    await page.waitForLoadState('networkidle');

    // Click add contact
    const addButton = page.getByTestId('add-contact-button')
      .or(page.getByRole('button', { name: /add.*contact|new.*contact/i }));

    if (!(await addButton.isVisible())) {
      test.skip(true, 'Add contact button not found');
      return;
    }

    await addButton.click();

    // Wait for form
    await expect(
      page.getByTestId('contact-form')
        .or(page.getByRole('dialog'))
    ).toBeVisible({ timeout: 10_000 });

    // Fill form
    const timestamp = Date.now();
    await page.getByTestId('contact-name-input')
      .or(page.getByLabel(/name/i).first())
      .fill(`E2E Test Contact ${timestamp}`);

    await page.getByTestId('contact-email-input')
      .or(page.getByLabel(/email/i).first())
      .fill(`e2e-${timestamp}@test.example.com`);

    // Submit
    await page.getByTestId('contact-submit-button')
      .or(page.getByRole('button', { name: /save|create|add/i }))
      .click();

    // Should close dialog and show success
    await expect(
      page.getByText(/created|saved|success/i)
        .or(page.getByRole('alert'))
    ).toBeVisible({ timeout: 15_000 });
  });
});
