/**
 * AI Endpoints E2E Validation against production (Vercel + Railway).
 *
 * Tests all AI API endpoints using tenant dvdmarchetto@gmail.com.
 * Authenticates via the Vercel frontend edge proxy (cookies stay first-party).
 * All API calls go through the frontend proxy at /api/v1/*.
 *
 * Run (manual login via Edge — browser opens, you log in, then tests proceed):
 *   npx playwright test e2e/ai-endpoints-validation.spec.ts --headed --project=chromium
 */

import { test, expect } from '@playwright/test';

const FRONTEND = process.env.E2E_FRONTEND_URL || 'http://localhost:3001';
const API = `${FRONTEND}/api/v1`;

// Shared browser context with auth cookies
let authCookieHeader: string = '';

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
  });
  const page = await ctx.newPage();

  // Navigate to login page
  await page.goto(`${FRONTEND}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  // Pause — you log in manually in the browser, then press "Resume" in the inspector
  await page.pause();

  // After resume, wait for dashboard/onboarding URL (you should already be there)
  await page.waitForURL(/\/(dashboard|onboarding|settings|mail)/, { timeout: 60_000 }).catch(() => {});

  console.log(`Authenticated. URL: ${page.url()}`);

  // Extract cookies for API calls
  const allCookies = await ctx.cookies();
  const authCookies = allCookies.filter(c =>
    c.name.includes('better-auth') || c.name.includes('session') || c.name.includes('onboarding'),
  );
  authCookieHeader = authCookies.map(c => `${c.name}=${c.value}`).join('; ');
  console.log(`Cookies: ${authCookies.map(c => c.name).join(', ')}`);

  if (!authCookieHeader) {
    throw new Error('No auth cookies captured — did you log in before pressing Resume?');
  }

  await ctx.close();
});

function h() {
  return { Cookie: authCookieHeader, 'Content-Type': 'application/json' };
}

function unwrap(body: any) {
  return body.data ?? body;
}

// ========== Conversations ==========

test('GET /ai/chat/conversations — list conversations', async ({ request }) => {
  const res = await request.get(`${API}/ai/chat/conversations?limit=5`, { headers: h() });
  const body = await res.json();
  const data = unwrap(body);
  console.log(`[${res.status()}] conversations: ${data.conversations?.length ?? 0} items, total=${data.total}`);
  expect(res.status()).toBe(200);
  expect(data.success).toBe(true);
  expect(Array.isArray(data.conversations)).toBe(true);
});

// ========== HITL ==========

test('GET /ai/chat/pending-actions — list pending HITL actions', async ({ request }) => {
  const res = await request.get(`${API}/ai/chat/pending-actions`, { headers: h() });
  const body = await res.json();
  const data = unwrap(body);
  console.log(`[${res.status()}] pending-actions: ${data.actions?.length ?? 0} actions`);
  expect(res.status()).toBe(200);
  expect(data.success).toBe(true);
  expect(Array.isArray(data.actions)).toBe(true);
});

test('POST /ai/chat/approve — bad actionId returns 404', async ({ request }) => {
  const res = await request.post(`${API}/ai/chat/approve`, {
    headers: h(),
    data: { actionId: 'nonexistent-action-id', decision: 'reject' },
  });
  console.log(`[${res.status()}] approve-bad-id: ${(await res.text()).slice(0, 200)}`);
  expect([400, 404]).toContain(res.status());
});

// ========== Briefing ==========

test('GET /ai/briefing — daily briefing', async ({ request }) => {
  const res = await request.get(`${API}/ai/briefing`, { headers: h() });
  const body = await res.json();
  console.log(`[${res.status()}] briefing: ${JSON.stringify(body).slice(0, 300)}`);
  // 200=ok, 404=no briefing yet, 503=service down
  expect([200, 404, 503]).toContain(res.status());
});

// ========== Deadlines ==========

test('GET /ai/deadlines — upcoming deadlines', async ({ request }) => {
  const res = await request.get(`${API}/ai/deadlines?days=7`, { headers: h() });
  const body = await res.json();
  const data = unwrap(body);
  console.log(`[${res.status()}] deadlines: count=${data.count}, enabled=${data.enabled}`);
  expect(res.status()).toBe(200);
  expect(data.success).toBe(true);
});

// ========== Follow-ups ==========

test('GET /ai/follow-ups/pending — pending follow-ups', async ({ request }) => {
  const res = await request.get(`${API}/ai/follow-ups/pending?limit=5`, { headers: h() });
  const body = await res.json();
  const data = unwrap(body);
  console.log(`[${res.status()}] follow-ups: count=${data.count}`);
  expect(res.status()).toBe(200);
  expect(data.success).toBe(true);
});

test('GET /ai/follow-ups/stats — follow-up statistics', async ({ request }) => {
  const res = await request.get(`${API}/ai/follow-ups/stats`, { headers: h() });
  const body = await res.json();
  const data = unwrap(body);
  console.log(`[${res.status()}] follow-up-stats: ${JSON.stringify(data.stats)}`);
  expect(res.status()).toBe(200);
  expect(data.success).toBe(true);
  expect(data.stats).toBeDefined();
});

// ========== Writing Style ==========

test('GET /ai/stats/writing-style — writing style profile', async ({ request }) => {
  const res = await request.get(`${API}/ai/stats/writing-style`, { headers: h() });
  const body = await res.json();
  console.log(`[${res.status()}] writing-style: ${JSON.stringify(body).slice(0, 300)}`);
  // 200=profile found, 404=no profile yet
  expect([200, 404]).toContain(res.status());
});

// ========== Draft Stats ==========

test('GET /ai/draft-stats — draft quality statistics', async ({ request }) => {
  const res = await request.get(`${API}/ai/draft-stats`, { headers: h() });
  const body = await res.json();
  console.log(`[${res.status()}] draft-stats: ${JSON.stringify(body).slice(0, 300)}`);
  expect([200, 404]).toContain(res.status());
});

// ========== Email Analytics ==========

test('GET /ai/analytics/email — email volume trends', async ({ request }) => {
  const res = await request.get(`${API}/ai/analytics/email?period=week`, { headers: h() });
  const body = await res.json();
  const data = unwrap(body);
  console.log(`[${res.status()}] analytics: ${JSON.stringify(data).slice(0, 300)}`);
  expect(res.status()).toBe(200);
  expect(data.success).toBe(true);
});

// ========== Conversation Delete (negative) ==========

test('DELETE /ai/chat/conversations/:id — nonexistent returns 404', async ({ request }) => {
  const res = await request.delete(`${API}/ai/chat/conversations/nonexistent-conv-id`, { headers: h() });
  console.log(`[${res.status()}] delete-conv: ${(await res.text()).slice(0, 200)}`);
  expect([404]).toContain(res.status());
});
