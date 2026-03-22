/**
 * Verify RBAC Enforcement — SEC-05
 *
 * Verifies that member-role users are rejected (403) on admin-only
 * endpoints and can still access non-admin endpoints.
 *
 * Requires:
 *   AUDIT_BASE_URL        - Server base URL (default: http://localhost:3000)
 *   MEMBER_USER_EMAIL     - Email of a member-role user
 *   MEMBER_USER_PASSWORD  - Password of the member-role user
 *
 * Usage: npx ts-node --transpile-only backend/scripts/verify-rbac.ts
 */
// @ts-nocheck
import 'dotenv/config';
import axios from 'axios';

const BASE = process.env.AUDIT_BASE_URL || 'http://localhost:3000';
const TIMEOUT = 10000;

const MEMBER_USER_EMAIL = process.env.MEMBER_USER_EMAIL;
const MEMBER_USER_PASSWORD = process.env.MEMBER_USER_PASSWORD;

interface TestResult {
  method: string;
  path: string;
  status: number;
  pass: boolean;
  reason: string;
  category: 'admin-deny' | 'member-allow';
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

  const tenantId = r.data?.user?.tenantId;
  const cookieStr = cookies.map((c: string) => c.split(';')[0]).join('; ');
  return { cookie: cookieStr, tenantId };
}

async function req(method: string, path: string, cookie: string, tenantId: string, body?: any) {
  try {
    const headers: Record<string, string> = { Cookie: cookie };
    if (tenantId) headers['x-tenant-id'] = tenantId;
    const r = await axios({
      method: method.toLowerCase(),
      url: `${BASE}${path}`,
      data: body,
      headers,
      validateStatus: () => true,
      timeout: TIMEOUT,
    });
    return { status: r.status, data: r.data };
  } catch (e: any) {
    return { status: 0, error: e.code || e.message };
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('  SEC-05: RBAC Enforcement Verification');
  console.log(`  Target: ${BASE}`);
  console.log('='.repeat(60));

  if (!MEMBER_USER_EMAIL || !MEMBER_USER_PASSWORD) {
    console.log('\nSkipping: required env vars not set.');
    console.log('Set MEMBER_USER_EMAIL and MEMBER_USER_PASSWORD to run.');
    process.exit(0);
  }

  // 1. Authenticate member-role user
  console.log(`\nAuthenticating member user: ${MEMBER_USER_EMAIL}...`);
  let cookie: string;
  let tenantId: string;
  try {
    const auth = await authenticate(MEMBER_USER_EMAIL, MEMBER_USER_PASSWORD);
    cookie = auth.cookie;
    tenantId = auth.tenantId;
    console.log(`Authentication successful. Tenant: ${tenantId}\n`);
  } catch (e: any) {
    console.error(`Authentication failed: ${e.message}`);
    process.exit(2);
  }

  const results: TestResult[] = [];

  // 2. Admin-only endpoints — member should get 403
  console.log('Testing admin-only endpoints (expect 403):\n');

  const adminEndpoints: Array<[string, string, any?]> = [
    ['GET', '/api/v1/ai/runs'],                // @Roles('admin') AiObservabilityController
    ['GET', '/api/v1/tenants'],                 // @Roles('super-admin') TenantsController
    ['POST', '/api/v1/tenants', {}],            // @Roles('super-admin') TenantsController
    ['POST', '/api/v1/email-sync/full', {}],    // @Roles('admin', 'super-admin') EmailSyncController
  ];

  for (const [method, path, body] of adminEndpoints) {
    const r = await req(method, path, cookie, tenantId, body);
    const pass = r.status === 403;
    const reason = pass
      ? 'DENIED (403)'
      : `FAIL: expected 403, got ${r.status}`;

    results.push({ method, path, status: r.status, pass, reason, category: 'admin-deny' });
    const icon = pass ? 'PASS' : 'FAIL';
    console.log(`  [${icon}] ${method} ${path} -> ${r.status} (${reason})`);
  }

  // 3. Non-admin endpoints — member should NOT get 403
  console.log('\nTesting non-admin endpoints (expect non-403):\n');

  const memberEndpoints: Array<[string, string]> = [
    ['GET', '/api/v1/emails'],     // No @Roles on list
    ['GET', '/api/v1/contacts'],   // No @Roles on list
  ];

  for (const [method, path] of memberEndpoints) {
    const r = await req(method, path, cookie, tenantId);
    const pass = r.status !== 403;
    const reason = pass
      ? `ALLOWED (${r.status})`
      : `FAIL: member was denied access (403) - ${JSON.stringify(r.data).substring(0, 100)}`;

    results.push({ method, path, status: r.status, pass, reason, category: 'member-allow' });
    const icon = pass ? 'PASS' : 'FAIL';
    console.log(`  [${icon}] ${method} ${path} -> ${r.status} (${reason})`);
  }

  // 4. Summary
  console.log('\n' + '='.repeat(60));
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  const adminDeny = results.filter((r) => r.category === 'admin-deny');
  const memberAllow = results.filter((r) => r.category === 'member-allow');

  console.log(`\nAdmin denial: ${adminDeny.filter((r) => r.pass).length}/${adminDeny.length} correct`);
  console.log(`Member access: ${memberAllow.filter((r) => r.pass).length}/${memberAllow.length} correct`);
  console.log(`Total: PASS ${passed} | FAIL ${failed}`);

  if (failed > 0) {
    console.log('\nFAILED ENDPOINTS:');
    results
      .filter((r) => !r.pass)
      .forEach((r) => console.log(`  [${r.category}] ${r.method} ${r.path} -> ${r.status}`));
    console.log('\nSEC-05 VERIFICATION: FAILED');
    process.exit(1);
  } else {
    console.log('\nSEC-05 VERIFICATION: PASSED');
    process.exit(0);
  }
}

main().catch((e) => {
  console.error('Script crashed:', e);
  process.exit(2);
});
