/**
 * Verify Auth Guards — SEC-01
 *
 * Dynamically fetches all routes from Swagger JSON and verifies that:
 * - @Public() routes return non-401 without a session cookie
 * - All other routes return 401 without a session cookie
 *
 * Usage: npx ts-node --transpile-only backend/scripts/verify-auth-guards.ts
 */
// @ts-nocheck
import 'dotenv/config';
import axios from 'axios';

const BASE = process.env.AUDIT_BASE_URL || 'http://localhost:3000';
const TIMEOUT = 10000;

// Routes known to be @Public() — no auth required
const PUBLIC_PATTERNS: Array<string | RegExp> = [
  /^\/health/,
  /^\/webhooks\//,
  /^\/api\/v1\/auth\/csrf-token$/,
  /^\/api\/v1\/calendar\/webhooks\//,
  /^\/api\/v1\/contacts\/webhooks\//,
  /^\/api\/v1\/email-sync\/webhook/,
  /^\/api\/v1\/telegram\/webhook/,
];

// GET-only public route (POST /ai/health/test requires auth)
const PUBLIC_GET_ONLY = ['/ai/health'];

// Routes managed by better-auth directly (raw Express, not NestJS guards)
const SKIP_PATTERNS = [/^\/api\/auth\//];

interface TestResult {
  method: string;
  path: string;
  status: number;
  pass: boolean;
  reason: string;
}

async function req(method: string, path: string) {
  try {
    const r = await axios({
      method: method.toLowerCase(),
      url: `${BASE}${path}`,
      validateStatus: () => true,
      timeout: TIMEOUT,
      // No cookies, no auth headers — intentionally unauthenticated
    });
    return { status: r.status };
  } catch (e: any) {
    return { status: 0, error: e.code || e.message };
  }
}

function isPublicRoute(path: string, method: string): boolean {
  // Check GET-only public routes
  for (const p of PUBLIC_GET_ONLY) {
    if (path === p && method.toUpperCase() === 'GET') return true;
  }
  // Check pattern-based public routes
  for (const pattern of PUBLIC_PATTERNS) {
    if (typeof pattern === 'string') {
      if (path === pattern) return true;
    } else if (pattern.test(path)) {
      return true;
    }
  }
  return false;
}

function shouldSkip(path: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(path));
}

function replacePlaceholders(path: string): string {
  return path.replace(/\{[^}]+\}/g, 'test-id-000');
}

async function main() {
  console.log('='.repeat(60));
  console.log('  SEC-01: Auth Guard Verification');
  console.log(`  Target: ${BASE}`);
  console.log('='.repeat(60));

  // 1. Fetch Swagger JSON
  console.log('\nFetching Swagger JSON from /api/docs-json...');
  let swaggerPaths: Record<string, any>;
  try {
    const r = await axios.get(`${BASE}/api/docs-json`, { timeout: TIMEOUT });
    swaggerPaths = r.data.paths || {};
  } catch (e: any) {
    console.error(`FATAL: Could not fetch Swagger JSON: ${e.message}`);
    process.exit(2);
  }

  const routeCount = Object.keys(swaggerPaths).length;
  console.log(`Found ${routeCount} route paths in Swagger.\n`);

  const results: TestResult[] = [];
  let tested = 0;
  let skipped = 0;

  // 2. Test each route
  for (const [swaggerPath, methods] of Object.entries(swaggerPaths)) {
    const httpPath = replacePlaceholders(swaggerPath);

    for (const method of Object.keys(methods)) {
      // Skip non-HTTP keys (e.g., "parameters")
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;

      if (shouldSkip(httpPath)) {
        skipped++;
        continue;
      }

      const r = await req(method.toUpperCase(), httpPath);
      const isPublic = isPublicRoute(httpPath, method);

      let pass: boolean;
      let reason: string;

      if (isPublic) {
        // Public routes should NOT return 401
        pass = r.status !== 401;
        reason = pass
          ? `PUBLIC OK (${r.status})`
          : `FAIL: public route returned 401`;
      } else {
        // Protected routes MUST return 401
        pass = r.status === 401;
        reason = pass
          ? 'PROTECTED OK (401)'
          : `FAIL: expected 401, got ${r.status}`;
      }

      results.push({ method: method.toUpperCase(), path: httpPath, status: r.status, pass, reason });
      tested++;

      const icon = pass ? 'PASS' : 'FAIL';
      console.log(`  [${icon}] ${method.toUpperCase()} ${httpPath} -> ${r.status} (${reason})`);
    }
  }

  // 3. Summary
  console.log('\n' + '='.repeat(60));
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  console.log(`\nTested: ${tested} | Skipped: ${skipped} (better-auth managed)`);
  console.log(`PASS: ${passed} | FAIL: ${failed}`);

  if (failed > 0) {
    console.log('\nFAILED ROUTES:');
    results
      .filter((r) => !r.pass)
      .forEach((r) => console.log(`  ${r.method} ${r.path} -> ${r.status} (${r.reason})`));
    console.log('\nSEC-01 VERIFICATION: FAILED');
    process.exit(1);
  } else {
    console.log('\nSEC-01 VERIFICATION: PASSED');
    process.exit(0);
  }
}

main().catch((e) => {
  console.error('Script crashed:', e);
  process.exit(2);
});
