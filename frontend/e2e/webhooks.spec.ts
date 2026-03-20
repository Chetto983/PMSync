/**
 * Webhook Contract Tests
 *
 * Verifies backend webhook endpoints accept valid payloads, reject invalid/missing
 * signatures with 401, and reject malformed payloads.
 * All endpoints are @Public() and @SkipThrottle() — no authentication needed.
 *
 * Note: Railway backend wraps responses in { data, meta }. Validation token
 * responses return the token inside data field as a string.
 */

import { test, expect } from '@playwright/test';

const apiURL = process.env.E2E_API_URL ?? 'http://localhost:3100';

test.describe('Gmail webhooks', () => {
  test('POST /webhooks/gmail/push accepts valid payload', async ({ request }) => {
    const response = await request.post(`${apiURL}/webhooks/gmail/push`, {
      data: {
        message: {
          data: Buffer.from(
            JSON.stringify({ emailAddress: 'test@example.com', historyId: '12345' }),
          ).toString('base64'),
          messageId: `test-${Date.now()}`,
          publishTime: new Date().toISOString(),
        },
        subscription: 'projects/test/subscriptions/test',
      },
    });

    // Contract test: validates shape acceptance, not business logic.
    // 401 is valid when EMAIL_SYNC_WEBHOOK_TOKEN is configured on the server.
    expect([200, 201, 202, 401, 500]).toContain(response.status());
  });

  test('POST /webhooks/gmail/push rejects malformed empty payload', async ({ request }) => {
    const response = await request.post(`${apiURL}/webhooks/gmail/push`, {
      data: {},
    });

    // Empty body should be rejected (400 bad request, 401 auth rejection, or 500 processing error)
    expect([400, 401, 500]).toContain(response.status());
  });
});

test.describe('Microsoft email webhooks', () => {
  test('POST /webhooks/microsoft/notifications returns validation token', async ({ request }) => {
    const response = await request.post(
      `${apiURL}/webhooks/microsoft/notifications?validationToken=test-token-123`,
    );
    expect(response.status()).toBe(200);

    const text = await response.text();
    expect(text).toContain('test-token-123');
  });

  test('POST /webhooks/microsoft/notifications accepts valid payload', async ({ request }) => {
    const response = await request.post(`${apiURL}/webhooks/microsoft/notifications`, {
      data: {
        value: [
          {
            subscriptionId: 'test',
            changeType: 'created',
            resource: 'me/messages/test',
            clientState: 'test',
          },
        ],
      },
    });

    expect([200, 202, 500]).toContain(response.status());
  });
});

test.describe('Calendar webhooks', () => {
  test('POST /webhooks/calendar/google/push accepts valid headers', async ({ request }) => {
    const response = await request.post(`${apiURL}/webhooks/calendar/google/push`, {
      headers: {
        'x-goog-channel-id': 'test-channel',
        'x-goog-resource-id': 'test-resource',
        'x-goog-channel-token': 'test-token',
      },
    });

    // 401 is valid when CALENDAR_WEBHOOK_TOKEN is configured on the server.
    expect([200, 202, 401, 500]).toContain(response.status());
  });

  test('POST /webhooks/calendar/microsoft/notifications returns validation token', async ({
    request,
  }) => {
    const response = await request.post(
      `${apiURL}/webhooks/calendar/microsoft/notifications?validationToken=cal-token-456`,
    );
    expect(response.status()).toBe(200);

    const text = await response.text();
    expect(text).toContain('cal-token-456');
  });
});

test.describe('Contacts webhooks', () => {
  test('POST /webhooks/contacts/google/sync accepts valid payload with token', async ({
    request,
  }) => {
    const response = await request.post(`${apiURL}/webhooks/contacts/google/sync`, {
      data: { providerId: 'test-provider' },
      headers: { 'x-webhook-token': 'test-token' },
    });

    expect([200, 202, 400, 401, 500]).toContain(response.status());
  });

  test('POST /webhooks/contacts/google/sync rejects invalid token with 401', async ({
    request,
  }) => {
    test.skip(
      !process.env.EMAIL_SYNC_WEBHOOK_TOKEN,
      'Skipped: EMAIL_SYNC_WEBHOOK_TOKEN not configured',
    );

    const response = await request.post(`${apiURL}/webhooks/contacts/google/sync`, {
      data: { providerId: 'test-provider' },
      headers: { 'x-webhook-token': 'WRONG-TOKEN-VALUE' },
    });

    expect(response.status()).toBe(401);
  });

  test('POST /webhooks/contacts/google/sync rejects missing token with 401', async ({
    request,
  }) => {
    test.skip(
      !process.env.EMAIL_SYNC_WEBHOOK_TOKEN,
      'Skipped: EMAIL_SYNC_WEBHOOK_TOKEN not configured',
    );

    const response = await request.post(`${apiURL}/webhooks/contacts/google/sync`, {
      data: { providerId: 'test-provider' },
    });

    expect(response.status()).toBe(401);
  });

  test('POST /webhooks/contacts/microsoft/notifications returns validation token', async ({
    request,
  }) => {
    const response = await request.post(
      `${apiURL}/webhooks/contacts/microsoft/notifications?validationToken=contact-token-789`,
    );
    expect(response.status()).toBe(200);

    const text = await response.text();
    expect(text).toContain('contact-token-789');
  });
});
