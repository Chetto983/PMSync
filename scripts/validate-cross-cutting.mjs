/**
 * Cross-cutting Validation Orchestrator
 *
 * Runs validation checks for:
 *   --check=tenant      XCUT-01: Tenant isolation on all email endpoints
 *   --check=rate-tier   XCUT-02: Rate tier correctness per endpoint
 *   --check=envelope    XCUT-03: Response envelope format
 *   --check=all         All of the above (default)
 *
 * Usage: node scripts/validate-cross-cutting.mjs [--check=all]
 *
 * Requires Edge running with --remote-debugging-port=9222 and logged into PMSync.
 */
import { connectCDP, getAuthCookies, getCsrfToken, report } from './lib/validation-helpers.mjs';
import { validateTenantIsolation } from './lib/validate-tenant-isolation.mjs';
import { validateRateTiers } from './lib/validate-rate-tiers.mjs';
import { validateResponseEnvelope } from './lib/validate-response-envelope.mjs';

const args = process.argv.slice(2);
const checkFlag = args.find(a => a.startsWith('--check='))?.split('=')[1] || 'all';

async function main() {
  console.log('=== Cross-cutting Validation ===');
  console.log(`Check: ${checkFlag}\n`);

  const { browser, context } = await connectCDP();
  const cookieHeader = await getAuthCookies(context);
  const { csrfToken, cookieHeader: finalCookies } = await getCsrfToken(context, cookieHeader);

  let allResults = [];

  // XCUT-01: Tenant isolation
  if (checkFlag === 'all' || checkFlag === 'tenant') {
    console.log('\n--- XCUT-01: Tenant Isolation ---');
    const tenantResults = await validateTenantIsolation(context, finalCookies, csrfToken);
    // Convert to report format
    const r = { name: 'XCUT-01: Tenant Isolation', checks: 0, passed: 0, failed: 0, failures: [] };
    for (const check of tenantResults) {
      r.checks++;
      if (check.status === 'PASS') {
        r.passed++;
        console.log(`  PASS: ${check.name} -- ${check.detail}`);
      } else {
        r.failed++;
        r.failures.push(`${check.name} -- ${check.detail}`);
        console.log(`  FAIL: ${check.name} -- ${check.detail}`);
      }
    }
    allResults.push(r);
  }

  // XCUT-02: Rate tiers
  if (checkFlag === 'all' || checkFlag === 'rate-tier') {
    console.log('\n--- XCUT-02: Rate Tiers ---');
    const tierResults = await validateRateTiers(context, finalCookies, csrfToken);
    const r = { name: 'XCUT-02: Rate Tiers', checks: 0, passed: 0, failed: 0, failures: [] };
    for (const check of tierResults) {
      r.checks++;
      if (check.status === 'PASS') {
        r.passed++;
        console.log(`  PASS: ${check.name} -- ${check.detail}`);
      } else {
        r.failed++;
        r.failures.push(`${check.name} -- ${check.detail}`);
        console.log(`  FAIL: ${check.name} -- ${check.detail}`);
      }
    }
    allResults.push(r);
  }

  // XCUT-03: Response envelope
  if (checkFlag === 'all' || checkFlag === 'envelope') {
    console.log('\n--- XCUT-03: Response Envelope ---');
    const envelopeResults = await validateResponseEnvelope(context, finalCookies, csrfToken);
    const r = { name: 'XCUT-03: Response Envelope', checks: 0, passed: 0, failed: 0, failures: [] };
    for (const check of envelopeResults) {
      r.checks++;
      if (check.status === 'PASS') {
        r.passed++;
        console.log(`  PASS: ${check.name} -- ${check.detail}`);
      } else {
        r.failed++;
        r.failures.push(`${check.name} -- ${check.detail}`);
        console.log(`  FAIL: ${check.name} -- ${check.detail}`);
      }
    }
    allResults.push(r);
  }

  const exitCode = report('Cross-cutting Validation', allResults);
  await browser.close();
  process.exit(exitCode);
}

main().catch(err => { console.error('Fatal error:', err.message); process.exit(1); });
