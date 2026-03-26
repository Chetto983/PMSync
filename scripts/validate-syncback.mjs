/**
 * Sync-Back Validation Orchestrator
 *
 * Usage:
 *   node scripts/validate-syncback.mjs --provider=gmail --quick
 *   node scripts/validate-syncback.mjs --provider=outlook
 *   node scripts/validate-syncback.mjs --provider=imap
 *   node scripts/validate-syncback.mjs                          # all providers
 *
 * Flags:
 *   --provider=gmail|outlook|microsoft|imap|all  (default: all)
 *   --quick    Skip hard delete (SYNC-12 permanent delete is destructive)
 *
 * Tests: SYNC-09 (mark-read/unread), SYNC-10 (star/unstar), SYNC-11 (move-to-folder),
 *        SYNC-12 (soft+hard delete), SYNC-13 (label add/remove, Gmail only)
 *
 * Requires Edge running with --remote-debugging-port=9222 and logged into PMSync.
 */
import { connectCDP, getAuthCookies, getCsrfToken, report } from './lib/validation-helpers.mjs';
import { validateSyncBack } from './lib/validate-syncback.mjs';

const args = process.argv.slice(2);
const providerFlag = args.find(a => a.startsWith('--provider='))?.split('=')[1]
  || 'all';
const quickMode = args.includes('--quick');

async function main() {
  console.log('=== Sync-Back Validation ===');
  console.log(`Provider: ${providerFlag} | Quick mode: ${quickMode}\n`);

  const { browser, context } = await connectCDP();
  const cookieHeader = await getAuthCookies(context);
  const { csrfToken, cookieHeader: finalCookies } = await getCsrfToken(context, cookieHeader);

  const results = await validateSyncBack(context, finalCookies, csrfToken, {
    provider: providerFlag,
    quick: quickMode,
  });

  const exitCode = report('Sync-Back Validation', results);
  await browser.close();
  process.exit(exitCode);
}

main().catch(err => { console.error('Fatal error:', err.message); process.exit(1); });
