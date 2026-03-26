/**
 * Webhook Sync Validation Orchestrator
 *
 * Usage:
 *   node scripts/validate-webhook-sync.mjs --provider=gmail --quick
 *   node scripts/validate-webhook-sync.mjs --provider=microsoft
 *   node scripts/validate-webhook-sync.mjs                          # all providers
 *
 * Flags:
 *   --provider=gmail|microsoft|all  (default: all)
 *   --quick    Validate subscription state only; skip triggering sync
 *
 * Requires Edge running with --remote-debugging-port=9222 and logged into PMSync.
 *
 * Note: IMAP uses polling only -- no webhook support.
 */
import { connectCDP, getAuthCookies, getCsrfToken, apiGet, report } from './lib/validation-helpers.mjs';
import { validateGmailWebhook } from './lib/validate-gmail-webhook.mjs';
import { validateMicrosoftWebhook } from './lib/validate-microsoft-webhook.mjs';

const args = process.argv.slice(2);
const providerFlag = args.find(a => a.startsWith('--provider='))?.split('=')[1]
  || 'all';
const quickMode = args.includes('--quick');

async function main() {
  console.log('=== Webhook Sync Validation ===');
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
    results.push(await validateGmailWebhook(context, finalCookies, csrfToken, providers, quickMode));
  }
  if (providerFlag === 'all' || providerFlag === 'microsoft' || providerFlag === 'outlook') {
    results.push(await validateMicrosoftWebhook(context, finalCookies, csrfToken, providers, quickMode));
  }

  const exitCode = report('Webhook Sync Validation', results);
  await browser.close();
  process.exit(exitCode);
}

main().catch(err => { console.error('Fatal error:', err.message); process.exit(1); });
