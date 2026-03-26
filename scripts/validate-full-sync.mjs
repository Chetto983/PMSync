/**
 * Full Sync Validation Orchestrator
 *
 * Usage:
 *   node scripts/validate-full-sync.mjs --provider=gmail --quick
 *   node scripts/validate-full-sync.mjs --provider=outlook
 *   node scripts/validate-full-sync.mjs --provider=imap --quick
 *   node scripts/validate-full-sync.mjs                          # all providers
 *
 * Flags:
 *   --provider=gmail|outlook|microsoft|imap|all  (default: all)
 *   --quick    Skip triggering a new sync; validate existing DB state only
 *
 * Requires Edge running with --remote-debugging-port=9222 and logged into PMSync.
 */
import { connectCDP, getAuthCookies, getCsrfToken, apiGet, report } from './lib/validation-helpers.mjs';
import { validateGmail } from './lib/validate-gmail.mjs';
// Plan 02 will add these imports:
// import { validateOutlook } from './lib/validate-outlook.mjs';
// import { validateImap } from './lib/validate-imap.mjs';

const args = process.argv.slice(2);
const providerFlag = args.find(a => a.startsWith('--provider='))?.split('=')[1]
  || 'all';
const quickMode = args.includes('--quick');

async function main() {
  console.log('=== Full Sync Validation ===');
  console.log(`Provider: ${providerFlag} | Quick mode: ${quickMode}\n`);

  const { browser, context } = await connectCDP();
  const cookieHeader = await getAuthCookies(context);
  const { csrfToken, cookieHeader: finalCookies } = await getCsrfToken(context, cookieHeader);

  // Discover providers from GET /api/v1/email-sync/status
  const status = await apiGet(context, '/api/v1/email-sync/status', finalCookies);
  console.log('\nSync status:', JSON.stringify(status, null, 2));

  const results = [];

  if (providerFlag === 'all' || providerFlag === 'gmail') {
    results.push(await validateGmail(context, finalCookies, csrfToken, status, quickMode));
  }
  if (providerFlag === 'all' || providerFlag === 'outlook' || providerFlag === 'microsoft') {
    results.push(await validateOutlook(context, finalCookies, csrfToken, status, quickMode));
  }
  if (providerFlag === 'all' || providerFlag === 'imap') {
    results.push(await validateImap(context, finalCookies, csrfToken, status, quickMode));
  }

  const exitCode = report('Full Sync Validation', results);
  await browser.close();
  process.exit(exitCode);
}

// Stub functions for providers not yet implemented (Plan 02 replaces with imports)
async function validateOutlook(context, cookieHeader, csrfToken, syncStatus, quick) {
  console.log('\n[Outlook] Not yet implemented -- skipping');
  return { name: 'Outlook', checks: 0, passed: 0, failed: 0, failures: [], skipped: 'Not yet implemented' };
}

async function validateImap(context, cookieHeader, csrfToken, syncStatus, quick) {
  console.log('\n[IMAP] Not yet implemented -- skipping');
  return { name: 'IMAP', checks: 0, passed: 0, failed: 0, failures: [], skipped: 'Not yet implemented' };
}

main().catch(err => { console.error('Fatal error:', err.message); process.exit(1); });
