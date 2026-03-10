/**
 * E2E Smoke Tests
 *
 * Minimal tests proving the real backend integration works.
 * These do NOT require authentication — they verify infrastructure.
 */

import { test, expect } from '@playwright/test';

const apiURL = process.env.E2E_API_URL ?? 'http://localhost:3100';

test('backend health endpoint responds', async ({ request }) => {
  const response = await request.get(`${apiURL}/health`);
  expect(response.status()).toBe(200);
});

test('frontend loads login page', async ({ page }) => {
  await page.goto('/');
  // Verify the page loaded (has a title or heading)
  const title = await page.title();
  expect(title).toBeTruthy();
});
