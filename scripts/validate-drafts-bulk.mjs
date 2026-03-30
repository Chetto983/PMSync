/**
 * Drafts & Bulk Operations Validation Orchestrator
 *
 * Usage:
 *   node scripts/validate-drafts-bulk.mjs --provider=gmail
 *   node scripts/validate-drafts-bulk.mjs --provider=outlook
 *   node scripts/validate-drafts-bulk.mjs                  # all providers
 *
 * Tests: WRITE-06 (Draft CRUD), WRITE-07 (Bulk mark-read), WRITE-08 (Bulk move),
 *        WRITE-09 (Bulk delete), WRITE-10 (Bulk labels - Gmail only)
 *
 * Requires Edge running with --remote-debugging-port=9222 and logged into PMSync.
 */
import { connectCDP, getAuthCookies, getCsrfToken, report } from './lib/validation-helpers.mjs';
import { validateDraftsBulk } from './lib/validate-drafts-bulk.mjs';

const args = process.argv.slice(2);
const providerFlag = args.find(a => a.startsWith('--provider='))?.split('=')[1] || 'all';

async function main() {
  console.log('=== Drafts & Bulk Operations Validation ===');
  console.log(`Provider: ${providerFlag}\n`);

  const { browser, context } = await connectCDP();
  const cookieHeader = await getAuthCookies(context);
  const { csrfToken, cookieHeader: finalCookies } = await getCsrfToken(context, cookieHeader);

  const results = await validateDraftsBulk(context, finalCookies, csrfToken, {
    provider: providerFlag,
  });

  const exitCode = report('Drafts & Bulk Operations Validation', results);
  await browser.close();
  process.exit(exitCode);
}

main().catch(err => { console.error('Fatal error:', err.message); process.exit(1); });
