import { test, expect } from '@playwright/test';
import { getE2eAuthContext } from './utils/dev-auth';

test.describe('Email E2E smoke', () => {
  test('compose + reply + forward', async ({ page }) => {
    const { token, user } = await getE2eAuthContext();
    const toEmail = process.env.E2E_TO_EMAIL || process.env.E2E_USER_EMAIL || user.email;

    if (!toEmail) {
      throw new Error(
        'Missing E2E_TO_EMAIL. Set E2E_TO_EMAIL (or E2E_USER_EMAIL) to an address you control.',
      );
    }

    await page.addInitScript((authToken) => {
      localStorage.setItem(
        'auth-storage',
        JSON.stringify({ state: { token: authToken }, version: 0 }),
      );
    }, token);

    await page.goto('/dashboard/email', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('email-compose-button')).toBeVisible({
      timeout: 120_000,
    });

    // Compose new email
    await page.getByTestId('email-compose-button').click();
    await expect(page.getByTestId('compose-dialog')).toBeVisible();
    await page.getByTestId('compose-to-input').fill(toEmail);
    await page.getByTestId('compose-to-input').press('Enter');
    await page.getByTestId('compose-subject-input').fill(`E2E smoke ${Date.now()}`);
    await page.getByTestId('compose-send-button').click();
    await expect(page.getByTestId('compose-dialog')).toBeHidden({ timeout: 120_000 });

    // Open a thread
    const firstThread = page.getByTestId('thread-list-item').first();
    await expect(firstThread).toBeVisible({ timeout: 120_000 });
    await firstThread.click();
    await expect(page.getByTestId('thread-display')).toBeVisible({ timeout: 120_000 });

    // Reply
    await page.getByTestId('thread-reply-button').first().click();
    await expect(page.getByTestId('compose-dialog')).toBeVisible();
    await page.getByTestId('compose-subject-input').fill(`Re: E2E smoke ${Date.now()}`);
    await page.getByTestId('compose-send-button').click();
    await expect(page.getByTestId('compose-dialog')).toBeHidden({ timeout: 120_000 });

    // Forward
    await page.getByTestId('thread-forward-button').first().click();
    await expect(page.getByTestId('compose-dialog')).toBeVisible();
    await page.getByTestId('compose-to-input').fill(toEmail);
    await page.getByTestId('compose-to-input').press('Enter');
    await page.getByTestId('compose-subject-input').fill(`Fwd: E2E smoke ${Date.now()}`);
    await page.getByTestId('compose-send-button').click();
    await expect(page.getByTestId('compose-dialog')).toBeHidden({ timeout: 120_000 });
  });
});
