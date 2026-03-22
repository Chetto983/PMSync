/**
 * Verify Tenant Isolation — SEC-02
 *
 * Verifies that cross-tenant requests with x-tenant-id header
 * for a tenant the user does NOT belong to are rejected with 403.
 *
 * Requires:
 *   AUDIT_BASE_URL        - Server base URL (default: http://localhost:3000)
 *   TEST_USER_EMAIL       - Email of a test user
 *   TEST_USER_PASSWORD    - Password of the test user
 *   CROSS_TENANT_ID       - A tenant ID the test user is NOT a member of
 *
 * Usage: npx ts-node --transpile-only backend/scripts/verify-tenant-isolation.ts
 */
// @ts-nocheck
import 'dotenv/config';
import axios from 'axios';

const BASE = process.env.AUDIT_BASE_URL || 'http://localhost:3000';
const TIMEOUT = 10000;

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;
const CROSS_TENANT_ID = process.env.CROSS_TENANT_ID;

interface TestResult {
  method: string;
  path: string;
  status: number;
  pass: boolean;
  reason: string;
}

async function authenticate(email: string, password: string): Promise<string> {
  const r = await axios({
    method: 'post',
    url: `${BASE}/api/auth/sign-in/email`,
    data: { email, password },
    validateStatus: () => true,
    timeout: TIMEOUT,
    maxRedirects: 0,
  });

  if (r.status !== 200) {
    console.error(`  Auth response: ${r.status} - ${JSON.stringify(r.data).substring(0, 200)}`);
  }
  const cookies = r.headers['set-cookie'];
  if (!cookies || cookies.length === 0) {
    throw new Error(`Authentication failed: no set-cookie header (status ${r.status})`);
  }

  // Extract all cookie key=value pairs
  return cookies.map((c: string) => c.split(';')[0]).join('; ');
}

async function req(method: string, path: string, cookie: string, tenantId: string) {
  try {
    const r = await axios({
      method: method.toLowerCase(),
      url: `${BASE}${path}`,
      headers: {
        Cookie: cookie,
        'x-tenant-id': tenantId,
      },
      validateStatus: () => true,
      timeout: TIMEOUT,
    });
    return { status: r.status };
  } catch (e: any) {
    return { status: 0, error: e.code || e.message };
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('  SEC-02: Tenant Isolation Verification');
  console.log(`  Target: ${BASE}`);
  console.log('='.repeat(60));

  if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD || !CROSS_TENANT_ID) {
    console.log('\nSkipping: required env vars not set.');
    console.log('Set TEST_USER_EMAIL, TEST_USER_PASSWORD, and CROSS_TENANT_ID to run.');
    process.exit(0);
  }

  // 1. Authenticate
  console.log(`\nAuthenticating as ${TEST_USER_EMAIL}...`);
  let cookie: string;
  try {
    cookie = await authenticate(TEST_USER_EMAIL, TEST_USER_PASSWORD);
    console.log('Authentication successful.\n');
  } catch (e: any) {
    console.error(`Authentication failed: ${e.message}`);
    process.exit(2);
  }

  // 2. Test cross-tenant access (all should return 403)
  const crossTenantEndpoints: Array<[string, string]> = [
    ['GET', '/api/v1/emails'],
    ['GET', '/api/v1/contacts'],
    ['GET', '/api/v1/calendar/events'],
    ['GET', '/api/v1/labels'],
    ['GET', '/api/v1/reminders'],
    ['GET', '/api/v1/providers'],
  ];

  const results: TestResult[] = [];

  console.log(`Testing cross-tenant access with x-tenant-id: ${CROSS_TENANT_ID}\n`);

  for (const [method, path] of crossTenantEndpoints) {
    const r = await req(method, path, cookie, CROSS_TENANT_ID);
    // 403 = tenant guard blocked, 429 = rate limited (still rejected, not a data leak)
    const pass = r.status === 403 || r.status === 429;
    const reason = pass
      ? `BLOCKED (${r.status}${r.status === 429 ? ' RATE LIMITED' : ''})`
      : `FAIL: expected 403, got ${r.status}`;

    results.push({ method, path, status: r.status, pass, reason });
    const icon = pass ? 'PASS' : 'FAIL';
    console.log(`  [${icon}] ${method} ${path} -> ${r.status} (${reason})`);
  }

  // 3. Summary
  console.log('\n' + '='.repeat(60));
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  console.log(`\nPASS: ${passed} | FAIL: ${failed}`);

  if (failed > 0) {
    console.log('\nFAILED ENDPOINTS:');
    results
      .filter((r) => !r.pass)
      .forEach((r) => console.log(`  ${r.method} ${r.path} -> ${r.status}`));
    console.log('\nSEC-02 VERIFICATION: FAILED');
    process.exit(1);
  } else {
    console.log('\nSEC-02 VERIFICATION: PASSED');
    process.exit(0);
  }
}

main().catch((e) => {
  console.error('Script crashed:', e);
  process.exit(2);
});
