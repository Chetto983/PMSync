/**
 * Incremental Sync Validation Orchestrator
 *
 * Usage:
 *   node scripts/validate-incremental-sync.mjs --provider=gmail --quick
 *   node scripts/validate-incremental-sync.mjs --provider=outlook
 *   node scripts/validate-incremental-sync.mjs --provider=imap --quick
 *   node scripts/validate-incremental-sync.mjs                          # all providers
 *
 * Flags:
 *   --provider=gmail|outlook|microsoft|imap|all  (default: all)
 *   --quick    Skip triggering a new sync; validate existing DB state only
 *
 * Requires Edge running with --remote-debugging-port=9222 and logged into PMSync.
 */
import { connectCDP, getAuthCookies, getCsrfToken, apiGet, report } from './lib/validation-helpers.mjs';
import { validateGmailIncremental } from './lib/validate-gmail-incremental.mjs';
import { validateOutlookIncremental } from './lib/validate-outlook-incremental.mjs';
import { validateImapIncremental } from './lib/validate-imap-incremental.mjs';

const args = process.argv.slice(2);
const providerFlag = args.find(a => a.startsWith('--provider='))?.split('=')[1]
  || 'all';
const quickMode = args.includes('--quick');

async function main() {
  console.log('=== Incremental Sync Validation ===');
  console.log(`Provider: ${providerFlag} | Quick mode: ${quickMode}\n`);

  const { browser, context } = await connectCDP();
  const cookieHeader = await getAuthCookies(context);
  const { csrfToken, cookieHeader: finalCookies } = await getCsrfToken(context, cookieHeader);

  // Discover providers from GET /api/v1/providers
  const providersRes = await apiGet(context, '/api/v1/providers', finalCookies);
  const providers = Array.isArray(providersRes) ? providersRes
    : Array.isArray(providersRes?.data) ? providersRes.data
    : [];
  console.log(`\nDiscovered ${providers.length} providers:`);
  for (const p of providers) {
    console.log(`  - ${p.providerType}: ${p.email || 'unknown'} (${p.id})`);
  }

  const results = [];

  if (providerFlag === 'all' || providerFlag === 'gmail') {
    results.push(await validateGmailIncremental(context, finalCookies, csrfToken, providers, quickMode));
  }
  if (providerFlag === 'all' || providerFlag === 'outlook' || providerFlag === 'microsoft') {
    results.push(await validateOutlookIncremental(context, finalCookies, csrfToken, providers, quickMode));
  }
  if (providerFlag === 'all' || providerFlag === 'imap') {
    results.push(await validateImapIncremental(context, finalCookies, csrfToken, providers, quickMode));
  }

  const exitCode = report('Incremental Sync Validation', results);
  await browser.close();
  process.exit(exitCode);
}

main().catch(err => { console.error('Fatal error:', err.message); process.exit(1); });
