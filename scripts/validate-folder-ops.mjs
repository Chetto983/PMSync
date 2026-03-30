/**
 * Folder Operations Validation Orchestrator
 *
 * Usage:
 *   node scripts/validate-folder-ops.mjs --provider=gmail
 *   node scripts/validate-folder-ops.mjs --provider=outlook
 *   node scripts/validate-folder-ops.mjs --provider=imap
 *   node scripts/validate-folder-ops.mjs                  # all providers
 *
 * Tests: FOLD-01 (Create folder), FOLD-02 (Rename folder), FOLD-03 (Delete folder),
 *        FOLD-04 (Sync from provider), FOLD-05 (System folder protection)
 *
 * Requires Edge running with --remote-debugging-port=9222 and logged into PMSync.
 */
import { connectCDP, getAuthCookies, getCsrfToken, report } from './lib/validation-helpers.mjs';
import { validateFolderOps } from './lib/validate-folder-ops.mjs';

const args = process.argv.slice(2);
const providerFlag = args.find(a => a.startsWith('--provider='))?.split('=')[1] || 'all';

async function main() {
  console.log('=== Folder Operations Validation ===');
  console.log(`Provider: ${providerFlag}\n`);

  const { browser, context } = await connectCDP();
  const cookieHeader = await getAuthCookies(context);
  const { csrfToken, cookieHeader: finalCookies } = await getCsrfToken(context, cookieHeader);

  const results = await validateFolderOps(context, finalCookies, csrfToken, {
    provider: providerFlag,
  });

  const exitCode = report('Folder Operations Validation', results);
  await browser.close();
  process.exit(exitCode);
}

main().catch(err => { console.error('Fatal error:', err.message); process.exit(1); });
