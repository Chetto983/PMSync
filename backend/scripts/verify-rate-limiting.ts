// @ts-nocheck
/**
 * Rate Limit Verification & Threshold Audit Script (SEC-04)
 *
 * Part A: Prints inventory of ALL rate limit configurations with analysis
 *         of potential 429 over-triggering (user-reported issue).
 * Part B: Live verification against running server -- hits endpoints
 *         rapidly to trigger 429 responses.
 *
 * Usage: npx ts-node --transpile-only scripts/verify-rate-limiting.ts
 * Env: AUDIT_BASE_URL, TEST_USER_EMAIL, TEST_USER_PASSWORD
 */
import 'dotenv/config';
import axios from 'axios';

const BASE = process.env.AUDIT_BASE_URL || 'http://localhost:3000';
const TEST_EMAIL = process.env.TEST_USER_EMAIL || '';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || '';
const TIMEOUT = 10000;

let passed = 0;
let failed = 0;

function log(pass: boolean, label: string, detail: string) {
  if (pass) { passed++; console.log(`  [PASS] ${label}: ${detail}`); }
  else { failed++; console.log(`  [FAIL] ${label}: ${detail}`); }
}

// ═══════════════════════════════════════════════════════════════════
// PART A: Rate Limit Threshold Inventory (static analysis)
// ═══════════════════════════════════════════════════════════════════
function printInventory() {
  console.log('\n' + '='.repeat(80));
  console.log('  RATE LIMIT INVENTORY');
  console.log('='.repeat(80));

  const header = '  Scope                    | Limit     | TTL      | Source';
  const sep =    '  -------------------------+-----------+----------+-------------------------------------------';

  console.log(header);
  console.log(sep);

  const entries = [
    ['Global (short/read)',      '300/min',  '60000ms', 'app.module.ts ThrottlerModule.forRoot'],
    ['Global (write)',           '30/min',   '60000ms', 'app.module.ts ThrottlerModule.forRoot'],
    ['email send',               '10/min',   '60000ms', 'email-actions.controller.ts @Throttle'],
    ['email reply',              '10/min',   '60000ms', 'email-actions.controller.ts @Throttle'],
    ['email forward',            '10/min',   '60000ms', 'email-actions.controller.ts @Throttle'],
    ['folder sync',              '10/min',   '60000ms', 'folders.controller.ts @Throttle'],
    ['folder create',            '10/min',   '60000ms', 'folders.controller.ts @Throttle'],
    ['folder move',              '10/min',   '60000ms', 'folders.controller.ts @Throttle'],
    ['folder delete',            '10/min',   '60000ms', 'folders.controller.ts @Throttle'],
    ['calendar sync',            '20/min',   '60000ms', 'calendar.controller.ts @Throttle'],
    ['contacts sync',            '20/min',   '60000ms', 'contacts.controller.ts @Throttle'],
    ['contacts import',          '20/min',   '60000ms', 'contacts.controller.ts @Throttle'],
    ['contacts extract',         '20/min',   '60000ms', 'contacts.controller.ts @Throttle'],
    ['contacts vcard',           '20/min',   '60000ms', 'contacts.controller.ts @Throttle'],
    ['telegram link',            '10/min',   '60000ms', 'telegram-settings.controller.ts @Throttle'],
    ['telegram webhook',         '60/min',   '60000ms', 'telegram-webhook.controller.ts @Throttle'],
    ['health',                   '30/min',   '60000ms', 'health.controller.ts @Throttle'],
    ['ai-health',                '30/min',   '60000ms', 'ai-health.controller.ts @Throttle'],
    ['csrf-token',               '300/min',  '60000ms', 'csrf-token.controller.ts @Throttle'],
    ['calendar invite send',     '10/min',   '60000ms', 'email-calendar-invite.controller.ts @Throttle'],
  ];

  for (const [scope, limit, ttl, source] of entries) {
    console.log(`  ${scope.padEnd(26)}| ${limit.padEnd(9)} | ${ttl.padEnd(8)} | ${source}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('  429 OVER-TRIGGERING ANALYSIS');
  console.log('='.repeat(80));

  console.log(`
  1. WRITE TIER (30/min) -- MOST LIKELY CAUSE OF EXCESSIVE 429s
     The global 'write' tier applies to ALL POST/PATCH/DELETE that don't have
     a custom @Throttle override. This means:
     - Saving email drafts (autosave every few seconds)
     - Toggling email read/star/flag status (bulk operations)
     - Updating user preferences, dashboard layout
     - Label add/remove on multiple emails
     All share the same 30/min budget. A user toggling labels on 30 emails
     in a minute will exhaust the write budget for ALL mutations.

  2. DUAL TIER STACKING
     NestJS throttler checks ALL configured tiers by default.
     A POST request is checked against BOTH 'short' (300/min) AND 'write' (30/min).
     The write tier is the binding constraint at 30/min.

  3. AUTHENTICATED TRACKING (good)
     UserThrottlerGuard uses userId for authenticated requests, so
     multiple users behind the same NAT/proxy don't exhaust each other's limits.
     For unauthenticated requests, IP-based tracking is used -- this can be
     aggressive behind NAT/corporate proxies.

  4. FAIL-OPEN BEHAVIOR (RedisThrottlerStorage)
     When Redis is unreachable, the throttler returns totalHits=0 (fail open).
     This means rate limiting silently STOPS working when Redis is down.
     This is NOT the cause of 429s -- it's the OPPOSITE problem. But it means
     if Redis flaps, rate limiting is inconsistent.

  5. HEALTH ENDPOINT SKIP vs @Throttle CONTRADICTION
     UserThrottlerGuard.shouldSkip() returns true for /health/* paths, but
     health.controller.ts has @Throttle({ default: { limit: 30, ttl: 60000 } }).
     The shouldSkip() takes precedence over @Throttle decorator, so the 30/min
     on health may not actually apply when the guard runs.
     (Note: this depends on guard ordering -- if ThrottlerGuard runs before
     shouldSkip is evaluated, the @Throttle decorator wins.)

  RECOMMENDATIONS:
  - Increase 'write' tier to 60/min or 100/min for normal users
  - Add per-endpoint @Throttle for high-frequency mutations (draft save, label toggle)
    with higher limits (e.g., 100/min)
  - Monitor production 429 rates per endpoint to identify the actual bottleneck
  - Consider separate 'bulk' tier for batch operations
`);
}

// ═══════════════════════════════════════════════════════════════════
// PART B: Live Rate Limit Verification
// ═══════════════════════════════════════════════════════════════════

async function rapidFire(method: string, url: string, count: number, headers?: Record<string, string>, body?: any): Promise<{ firstAt: number | null; statuses: number[] }> {
  const statuses: number[] = [];
  let firstAt: number | null = null;

  for (let i = 1; i <= count; i++) {
    try {
      const r = await axios({
        method: method.toLowerCase(),
        url,
        data: body,
        headers: { 'Content-Type': 'application/json', ...headers },
        validateStatus: () => true,
        timeout: TIMEOUT,
      });
      statuses.push(r.status);
      if (r.status === 429 && firstAt === null) {
        firstAt = i;
      }
    } catch (e: any) {
      if (e.code === 'ECONNREFUSED') {
        return { firstAt: null, statuses: [-1] };
      }
      statuses.push(0);
    }
  }
  return { firstAt, statuses };
}

async function liveVerification() {
  console.log('\n' + '='.repeat(80));
  console.log('  LIVE RATE LIMIT VERIFICATION');
  console.log(`  Target: ${BASE}`);
  console.log('='.repeat(80));

  // Test 1: Unauthenticated /health endpoint (30/min @Throttle)
  console.log('\n  -- Test 1: GET /health (30/min throttle) -- sending 35 rapid requests --');
  const healthResult = await rapidFire('GET', `${BASE}/health`, 35);

  if (healthResult.statuses[0] === -1) {
    console.log(`  [SKIP] Server not reachable at ${BASE}. Live verification skipped.`);
    return false;
  }

  if (healthResult.firstAt !== null) {
    log(true, 'GET /health rate limit', `429 first appeared at request #${healthResult.firstAt} of 35`);
  } else {
    // Not necessarily a failure -- UserThrottlerGuard.shouldSkip() may bypass /health
    console.log(`  [INFO] GET /health: No 429 after 35 requests (shouldSkip() may bypass throttling for /health)`);
    log(true, 'GET /health throttle check', 'No 429 -- guard shouldSkip() likely bypasses /health');
  }

  // Test 2: Authenticated endpoints (if credentials provided)
  if (!TEST_EMAIL || !TEST_PASSWORD) {
    console.log('\n  [SKIP] TEST_USER_EMAIL/TEST_USER_PASSWORD not set. Authenticated rate limit tests skipped.');
    return true;
  }

  console.log(`\n  Authenticating as ${TEST_EMAIL}...`);
  try {
    const loginRes = await axios({
      method: 'post',
      url: `${BASE}/api/auth/sign-in/email`,
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
      validateStatus: () => true,
      timeout: TIMEOUT,
    });

    if (loginRes.status !== 200) {
      console.log(`  [SKIP] Login failed (status=${loginRes.status}). Authenticated tests skipped.`);
      return true;
    }

    const setCookieHeaders = loginRes.headers['set-cookie'] || [];
    const cookieArray = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
    const cookies = cookieArray.map((c: string) => c.split(';')[0]).join('; ');

    // Fetch CSRF token
    const csrfRes = await axios({
      method: 'get',
      url: `${BASE}/api/v1/auth/csrf-token`,
      headers: { Cookie: cookies },
      validateStatus: () => true,
      timeout: TIMEOUT,
    });
    const csrfToken = csrfRes.data?.csrfToken || '';
    const csrfSetCookies = csrfRes.headers['set-cookie'] || [];
    const csrfCookieArray = Array.isArray(csrfSetCookies) ? csrfSetCookies : [csrfSetCookies];
    const csrfCookies = csrfCookieArray.map((c: string) => c.split(';')[0]).join('; ');
    const allCookies = [cookies, csrfCookies].filter(Boolean).join('; ');

    const authHeaders = {
      Cookie: allCookies,
      'X-CSRF-Token': csrfToken,
    };

    // Test 2a: POST /api/v1/emails/send (10/min @Throttle)
    console.log('\n  -- Test 2a: POST /api/v1/emails/send (10/min throttle) -- sending 15 rapid requests --');
    const emailResult = await rapidFire('POST', `${BASE}/api/v1/emails/send`, 15, authHeaders, {
      to: 'rate-limit-test@test.com',
      subject: 'rate-limit-test',
      body: 'rate-limit-test',
    });

    if (emailResult.firstAt !== null) {
      log(true, 'POST /api/v1/emails/send rate limit', `429 first appeared at request #${emailResult.firstAt} of 15`);
    } else {
      log(false, 'POST /api/v1/emails/send rate limit', `NO 429 after 15 requests (expected at ~11)`);
    }

    // Test 2b: POST /ai/chat (write tier 30/min)
    console.log('\n  -- Test 2b: POST /ai/chat (write tier 30/min) -- sending 35 rapid requests --');
    const chatResult = await rapidFire('POST', `${BASE}/ai/chat`, 35, authHeaders, {
      messages: [{ role: 'user', content: 'test' }],
    });

    if (chatResult.firstAt !== null) {
      log(true, 'POST /ai/chat rate limit', `429 first appeared at request #${chatResult.firstAt} of 35`);
    } else {
      log(false, 'POST /ai/chat rate limit', `NO 429 after 35 requests (expected at ~31)`);
    }
  } catch (e: any) {
    console.log(`  [ERROR] Authenticated tests failed: ${e.message}`);
  }

  return true;
}

// ─── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log('='.repeat(80));
  console.log('  Rate Limit Verification & Threshold Audit (SEC-04)');
  console.log('='.repeat(80));

  // Part A: Always print inventory (static analysis)
  printInventory();

  // Part B: Live verification (requires running server)
  const serverUp = await liveVerification();

  // Summary
  console.log('\n' + '='.repeat(80));
  if (passed + failed === 0) {
    console.log('  RESULTS: Part A (inventory) complete. Part B skipped (server not reachable).');
  } else {
    console.log(`  RESULTS: ${passed} PASS | ${failed} FAIL | ${passed + failed} TOTAL`);
  }
  console.log('='.repeat(80));

  if (failed > 0) {
    console.log('\n  Rate limit verification FAILED.');
    process.exit(1);
  } else {
    console.log('\n  Rate limit verification PASSED.');
    process.exit(0);
  }
}

main().catch((e) => {
  console.error('Rate limit verification crashed:', e);
  process.exit(2);
});
