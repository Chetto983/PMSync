/**
 * Health Endpoint Contract Tests
 *
 * Verifies backend health endpoints respond with correct schemas and status values.
 * All endpoints are @Public() — no authentication needed.
 *
 * Note: Railway backend wraps responses in { data, meta }. We unwrap transparently.
 */

import { test, expect } from '@playwright/test';

const apiURL = process.env.E2E_API_URL ?? 'http://localhost:3100';

/** Unwrap { data, meta } envelope if present, otherwise return raw body. */
function unwrap(body: Record<string, unknown>): unknown {
  if (body && typeof body === 'object' && 'data' in body && 'meta' in body) {
    return body.data;
  }
  return body;
}

test.describe('Health endpoints', () => {
  test('GET /health returns system health with database and redis up', async ({ request }) => {
    const response = await request.get(`${apiURL}/health`);
    expect(response.status()).toBe(200);

    const raw = await response.json();
    const body = unwrap(raw) as Record<string, unknown>;
    expect(body.status).toMatch(/healthy|degraded/);
    expect(body.timestamp).toBeTruthy();
    const services = body.services as Record<string, Record<string, unknown>>;
    expect(services.database.status).toBe('up');
    expect(services.redis.status).toBe('up');
    // Mistral may be degraded on Railway — do NOT hard-assert it is up
  });

  test('GET /health/ready returns ready status', async ({ request }) => {
    const response = await request.get(`${apiURL}/health/ready`);
    expect(response.status()).toBe(200);

    const raw = await response.json();
    const body = unwrap(raw) as Record<string, unknown>;
    expect(body).toEqual({ status: 'ready' });
  });

  test('GET /health/live returns alive status', async ({ request }) => {
    const response = await request.get(`${apiURL}/health/live`);
    expect(response.status()).toBe(200);

    const raw = await response.json();
    const body = unwrap(raw) as Record<string, unknown>;
    expect(body).toEqual({ status: 'alive' });
  });

  test('GET /health/queues returns an array', async ({ request }) => {
    const response = await request.get(`${apiURL}/health/queues`);
    expect(response.status()).toBe(200);

    const raw = await response.json();
    const body = unwrap(raw);
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /health/queues/all returns status and queues array', async ({ request }) => {
    const response = await request.get(`${apiURL}/health/queues/all`);
    expect(response.status()).toBe(200);

    const raw = await response.json();
    const body = unwrap(raw) as Record<string, unknown>;
    expect(body.status).toBeTruthy();
    // queues may be an array or status may be 'unavailable' if QueueHealthService not loaded
    if (body.status !== 'unavailable') {
      expect(body.queues).toBeDefined();
      expect(Array.isArray(body.queues)).toBe(true);
    }
  });
});
