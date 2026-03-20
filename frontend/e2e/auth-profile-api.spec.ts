/**
 * User Profile API E2E Tests (BAPI-24)
 *
 * Tests all 10 user profile endpoints via Playwright's request context.
 * Uses the authenticated admin storageState (cookies from playwright/.auth/user.json).
 * Every mutation includes an X-CSRF-Token header (double-submit cookie pattern).
 *
 * NOTE: DELETE /api/v1/users/me (account deletion) is intentionally skipped
 * to protect the admin test user.
 */

import { test, expect, APIRequestContext } from '@playwright/test';

async function getCsrfToken(request: APIRequestContext): Promise<string> {
  const res = await request.get('/api/v1/auth/csrf-token');
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.csrfToken;
}

test.describe('User Profile API', () => {
  test('GET /api/v1/users/me returns profile', async ({ request }) => {
    const response = await request.get('/api/v1/users/me');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('email');
  });

  test('PUT /api/v1/users/me updates profile', async ({ request }) => {
    // Fetch original profile to restore later
    const original = await (await request.get('/api/v1/users/me')).json();
    const originalFirstName = original.firstName ?? original.name ?? 'Admin';

    const csrf = await getCsrfToken(request);
    const updateRes = await request.put('/api/v1/users/me', {
      data: { firstName: 'TestUpdated' },
      headers: { 'X-CSRF-Token': csrf },
    });
    expect(updateRes.ok()).toBeTruthy();
    const updated = await updateRes.json();
    expect(updated.firstName).toBe('TestUpdated');

    // Restore original name
    const csrf2 = await getCsrfToken(request);
    await request.put('/api/v1/users/me', {
      data: { firstName: originalFirstName },
      headers: { 'X-CSRF-Token': csrf2 },
    });
  });

  test('GET /api/v1/users/me/preferences returns preferences', async ({ request }) => {
    const response = await request.get('/api/v1/users/me/preferences');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
    expect(typeof body).toBe('object');
  });

  test('PATCH /api/v1/users/me/preferences updates preferences', async ({ request }) => {
    // Get original preferences to restore
    const original = await (await request.get('/api/v1/users/me/preferences')).json();
    const originalLanguage = original.language ?? 'en';

    const csrf = await getCsrfToken(request);
    const updateRes = await request.patch('/api/v1/users/me/preferences', {
      data: { language: 'it' },
      headers: { 'X-CSRF-Token': csrf },
    });
    expect(updateRes.ok()).toBeTruthy();

    // Restore original preference
    const csrf2 = await getCsrfToken(request);
    await request.patch('/api/v1/users/me/preferences', {
      data: { language: originalLanguage },
      headers: { 'X-CSRF-Token': csrf2 },
    });
  });

  test('GET /api/v1/users/me/dashboard-preferences returns dashboard layout', async ({ request }) => {
    const response = await request.get('/api/v1/users/me/dashboard-preferences');
    expect(response.ok()).toBeTruthy();
  });

  test('PUT /api/v1/users/me/dashboard-preferences updates layout', async ({ request }) => {
    // Get original dashboard preferences to restore
    const original = await (await request.get('/api/v1/users/me/dashboard-preferences')).json();

    const csrf = await getCsrfToken(request);
    const updateRes = await request.put('/api/v1/users/me/dashboard-preferences', {
      data: { layout: [] },
      headers: { 'X-CSRF-Token': csrf },
    });
    expect(updateRes.ok()).toBeTruthy();

    // Restore original layout if it existed
    if (original && original.layout) {
      const csrf2 = await getCsrfToken(request);
      await request.put('/api/v1/users/me/dashboard-preferences', {
        data: { layout: original.layout },
        headers: { 'X-CSRF-Token': csrf2 },
      });
    }
  });

  test('PUT /api/v1/users/me/avatar sets avatar', async ({ request }) => {
    const csrf = await getCsrfToken(request);
    // 1x1 transparent PNG as base64 data URL
    const avatarUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAAABJRU5ErkJggg==';
    const response = await request.put('/api/v1/users/me/avatar', {
      data: { avatarUrl },
      headers: { 'X-CSRF-Token': csrf },
    });
    expect(response.ok()).toBeTruthy();
  });

  test('DELETE /api/v1/users/me/avatar removes avatar', async ({ request }) => {
    const csrf = await getCsrfToken(request);
    const response = await request.delete('/api/v1/users/me/avatar', {
      headers: { 'X-CSRF-Token': csrf },
    });
    expect(response.ok()).toBeTruthy();
  });

  test('DELETE /api/v1/users/me/ai-memory clears AI memory', async ({ request }) => {
    const csrf = await getCsrfToken(request);
    const response = await request.delete('/api/v1/users/me/ai-memory', {
      headers: { 'X-CSRF-Token': csrf },
    });
    // Accept either 200 or 204
    expect(response.status()).toBeGreaterThanOrEqual(200);
    expect(response.status()).toBeLessThan(300);
  });

  test('GET /api/v1/users/me returns 401 without auth', async ({ playwright }) => {
    // Create a fresh request context without any cookies/storageState
    const unauthRequest = await playwright.request.newContext({
      baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3001',
    });
    try {
      const response = await unauthRequest.get('/api/v1/users/me');
      expect(response.status()).toBe(401);
    } finally {
      await unauthRequest.dispose();
    }
  });
});
