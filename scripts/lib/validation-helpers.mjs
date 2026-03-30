/**
 * Shared validation infrastructure for full-sync validation scripts.
 *
 * Provides: CDP connection, cookie-based auth, API helpers, assertions, reporting.
 * Used by: validate-full-sync.mjs and per-provider validation modules.
 */
import { chromium } from 'playwright';

// Environment-backed URLs with production fallbacks
export const BACKEND_URL = process.env.BACKEND_URL || 'https://backend-production-78e1.up.railway.app';
export const FRONTEND_URL = process.env.FRONTEND_URL || 'https://mail-agent-indol.vercel.app';

/**
 * Connect to Edge via Playwright CDP on port 9222.
 * Returns { browser, context, page }.
 */
export async function connectCDP() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const contexts = browser.contexts();
  const context = contexts[0];

  if (!context) {
    throw new Error('No browser context found. Is Edge running with --remote-debugging-port=9222?');
  }

  // Find an app page (skip devtools, about:blank, etc.)
  const allPages = context.pages();
  let page = allPages.find(p => p.url().includes('mail-agent') || p.url().includes('localhost:3001'))
    || allPages.find(p => !p.url().startsWith('devtools://') && !p.url().startsWith('about:'))
    || await context.newPage();

  // If not on the app, navigate there
  if (!page.url().includes('mail-agent') && !page.url().includes('localhost:3001')) {
    console.log('Navigating to app...');
    await page.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }

  console.log(`CDP connected. Page: ${page.url()}`);
  return { browser, context, page };
}

/**
 * Extract cookies from both BACKEND_URL and FRONTEND_URL domains,
 * merge with backend priority, return cookieHeader string.
 */
export async function getAuthCookies(context) {
  const backendCookies = await context.cookies(BACKEND_URL);
  const frontendCookies = await context.cookies(FRONTEND_URL);

  console.log(`Cookies: backend=${backendCookies.length}, frontend=${frontendCookies.length}`);

  // Merge all cookies (backend cookies take priority)
  const cookieMap = new Map();
  for (const c of frontendCookies) cookieMap.set(c.name, c);
  for (const c of backendCookies) cookieMap.set(c.name, c);
  const allCookies = [...cookieMap.values()];

  if (allCookies.length === 0) {
    throw new Error('No cookies found. Please open the app in Edge first and login.');
  }

  const cookieHeader = allCookies.map(c => `${c.name}=${c.value}`).join('; ');
  return cookieHeader;
}

/**
 * GET /api/v1/auth/csrf-token, extract csrfToken, refresh cookies after fetch.
 * Returns { csrfToken, cookieHeader } (updated cookie header).
 */
export async function getCsrfToken(context, cookieHeader) {
  const api = context.request;
  const csrfRes = await api.get(BACKEND_URL + '/api/v1/auth/csrf-token', {
    headers: { Cookie: cookieHeader },
  });
  const csrfData = await csrfRes.json();
  const csrfToken = csrfData?.csrfToken || csrfData?.data?.csrfToken;

  if (!csrfToken) {
    console.warn('CSRF token not found in response:', JSON.stringify(csrfData).substring(0, 200));
  } else {
    console.log(`CSRF token: ${csrfToken.substring(0, 20)}...`);
  }

  // Re-read cookies after CSRF fetch (new csrf cookie may have been set)
  const backendCookies = await context.cookies(BACKEND_URL);
  const frontendCookies = await context.cookies(FRONTEND_URL);
  const cookieMap = new Map();
  for (const c of frontendCookies) cookieMap.set(c.name, c);
  for (const c of backendCookies) cookieMap.set(c.name, c);
  const updatedCookieHeader = [...cookieMap.values()].map(c => `${c.name}=${c.value}`).join('; ');

  return { csrfToken, cookieHeader: updatedCookieHeader };
}

/**
 * GET wrapper: context.request.get(BACKEND_URL + path) with Cookie header.
 * Parses JSON and returns data. Throws on non-2xx.
 */
export async function apiGet(context, path, cookieHeader) {
  const api = context.request;
  const url = BACKEND_URL + path;
  const response = await api.get(url, {
    headers: { Cookie: cookieHeader },
  });

  const status = response.status();
  let data;
  try {
    data = await response.json();
  } catch {
    data = await response.text();
  }

  if (status < 200 || status >= 300) {
    throw new Error(`GET ${path} returned ${status}: ${JSON.stringify(data).substring(0, 200)}`);
  }

  return data;
}

/**
 * POST wrapper with Cookie + x-csrf-token headers.
 * Parses JSON and returns data. Throws on non-2xx.
 */
export async function apiPost(context, path, body, cookieHeader, csrfToken) {
  const api = context.request;
  const url = BACKEND_URL + path;
  const headers = { Cookie: cookieHeader };
  if (csrfToken) {
    headers['x-csrf-token'] = csrfToken;
  }

  const opts = { headers };
  if (body !== null && body !== undefined) {
    opts.data = body;
  }

  const response = await api.post(url, opts);
  const status = response.status();
  let data;
  try {
    data = await response.json();
  } catch {
    data = await response.text();
  }

  if (status < 200 || status >= 300) {
    throw new Error(`POST ${path} returned ${status}: ${JSON.stringify(data).substring(0, 200)}`);
  }

  return data;
}

/**
 * Poll GET /api/v1/email-sync/queues every 5 seconds.
 * Sum active + waiting across all queues. Return true when totalActive === 0.
 * Return false on timeout. Log progress every 30 seconds.
 */
export async function waitForSyncCompletion(context, cookieHeader, maxWaitMs = 600000) {
  const start = Date.now();
  let lastLog = 0;

  while (Date.now() - start < maxWaitMs) {
    const queues = await apiGet(context, '/api/v1/email-sync/queues', cookieHeader);

    let totalActive = 0;
    if (queues && typeof queues === 'object') {
      // Handle both { data: { ... } } envelope and raw object
      const queueData = queues.data || queues;
      for (const [, q] of Object.entries(queueData)) {
        if (q && typeof q === 'object') {
          totalActive += (q.active || 0) + (q.waiting || 0);
        }
      }
    }

    if (totalActive === 0) {
      const elapsed = Math.round((Date.now() - start) / 1000);
      console.log(`Sync completed in ${elapsed}s`);
      return true;
    }

    const elapsed = Math.round((Date.now() - start) / 1000);
    if (elapsed - lastLog >= 30) {
      console.log(`  Waiting for sync... ${totalActive} jobs remaining (${elapsed}s elapsed)`);
      lastLog = elapsed;
    }

    await new Promise(r => setTimeout(r, 5000));
  }

  console.log(`Sync timed out after ${maxWaitMs / 1000}s`);
  return false;
}

/**
 * PATCH wrapper with Cookie + x-csrf-token headers.
 * Parses JSON and returns data. Throws on non-2xx.
 */
export async function apiPatch(context, path, body, cookieHeader, csrfToken) {
  const api = context.request;
  const url = BACKEND_URL + path;
  const headers = { Cookie: cookieHeader };
  if (csrfToken) {
    headers['x-csrf-token'] = csrfToken;
  }

  const opts = { headers };
  if (body !== null && body !== undefined) {
    opts.data = body;
  }

  const response = await api.patch(url, opts);
  const status = response.status();
  let data;
  try {
    data = await response.json();
  } catch {
    data = await response.text();
  }

  if (status < 200 || status >= 300) {
    throw new Error(`PATCH ${path} returned ${status}: ${JSON.stringify(data).substring(0, 200)}`);
  }

  return data;
}

/**
 * DELETE wrapper with Cookie + x-csrf-token headers.
 * Returns null on 204, otherwise parses JSON. Throws on non-2xx.
 */
export async function apiDelete(context, path, cookieHeader, csrfToken) {
  const api = context.request;
  const url = BACKEND_URL + path;
  const headers = { Cookie: cookieHeader };
  if (csrfToken) {
    headers['x-csrf-token'] = csrfToken;
  }

  const response = await api.delete(url, { headers });
  const status = response.status();

  if (status === 204) return null;

  let data;
  try {
    data = await response.json();
  } catch {
    data = await response.text();
  }

  if (status < 200 || status >= 300) {
    throw new Error(`DELETE ${path} returned ${status}: ${JSON.stringify(data).substring(0, 200)}`);
  }

  return data;
}

/**
 * DELETE with JSON body (needed for bulk delete endpoints).
 * Playwright's api.delete() doesn't support body, so use api.fetch() with method override.
 */
export async function apiDeleteWithBody(context, path, body, cookieHeader, csrfToken) {
  const api = context.request;
  const url = BACKEND_URL + path;
  const headers = {
    Cookie: cookieHeader,
    'Content-Type': 'application/json',
  };
  if (csrfToken) {
    headers['x-csrf-token'] = csrfToken;
  }

  const response = await api.fetch(url, {
    method: 'DELETE',
    headers,
    data: body,
  });
  const status = response.status();

  if (status === 204) return null;

  let data;
  try {
    data = await response.json();
  } catch {
    data = await response.text();
  }

  if (status < 200 || status >= 300) {
    throw new Error(`DELETE ${path} returned ${status}: ${JSON.stringify(data).substring(0, 200)}`);
  }

  return data;
}

// --- Assertion helpers ---

// Module-level results collector (reset per test run)
let _currentResults = null;

/**
 * Set the current results collector for assertions.
 * Call this before running assertions to collect results into a specific object.
 */
export function setResultsCollector(results) {
  _currentResults = results;
}

/**
 * Assert actual === expected. Pushes to failures array on mismatch.
 * Logs PASS/FAIL with label.
 */
export function assertEqual(actual, expected, label) {
  if (actual === expected) {
    console.log(`  PASS: ${label}`);
    if (_currentResults) {
      _currentResults.checks++;
      _currentResults.passed++;
    }
    return true;
  } else {
    const msg = `${label} -- expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
    console.log(`  FAIL: ${msg}`);
    if (_currentResults) {
      _currentResults.checks++;
      _currentResults.failed++;
      _currentResults.failures.push(msg);
    }
    return false;
  }
}

/**
 * Assert min <= actual <= max. Pushes to failures array on out-of-range.
 */
export function assertRange(actual, min, max, label) {
  if (actual >= min && actual <= max) {
    console.log(`  PASS: ${label} (${actual} in [${min}, ${max}])`);
    if (_currentResults) {
      _currentResults.checks++;
      _currentResults.passed++;
    }
    return true;
  } else {
    const msg = `${label} -- ${actual} not in range [${min}, ${max}]`;
    console.log(`  FAIL: ${msg}`);
    if (_currentResults) {
      _currentResults.checks++;
      _currentResults.failed++;
      _currentResults.failures.push(msg);
    }
    return false;
  }
}

/**
 * Assert condition is truthy. Pushes to failures array if falsy.
 */
export function assertTrue(condition, label) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    if (_currentResults) {
      _currentResults.checks++;
      _currentResults.passed++;
    }
    return true;
  } else {
    const msg = `${label} -- expected truthy, got falsy`;
    console.log(`  FAIL: ${msg}`);
    if (_currentResults) {
      _currentResults.checks++;
      _currentResults.failed++;
      _currentResults.failures.push(msg);
    }
    return false;
  }
}

/**
 * Print summary: total checks, passed, failed per provider.
 * Return exit code 0 (all pass) or 1 (any failure).
 */
export function report(testName, results) {
  console.log('\n' + '='.repeat(60));
  console.log(`  ${testName} -- RESULTS`);
  console.log('='.repeat(60));

  let totalChecks = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  const allFailures = [];

  for (const r of results) {
    if (r.skipped) {
      console.log(`\n  [${r.name}] SKIPPED: ${r.skipped}`);
      continue;
    }
    console.log(`\n  [${r.name}] ${r.checks} checks: ${r.passed} passed, ${r.failed} failed`);
    totalChecks += r.checks;
    totalPassed += r.passed;
    totalFailed += r.failed;
    if (r.failures && r.failures.length > 0) {
      for (const f of r.failures) {
        allFailures.push(`[${r.name}] ${f}`);
      }
    }
  }

  console.log('\n' + '-'.repeat(60));
  console.log(`  TOTAL: ${totalChecks} checks, ${totalPassed} passed, ${totalFailed} failed`);

  if (allFailures.length > 0) {
    console.log('\n  FAILURES:');
    for (const f of allFailures) {
      console.log(`    - ${f}`);
    }
  }

  console.log('\n' + '='.repeat(60));

  return totalFailed > 0 ? 1 : 0;
}
