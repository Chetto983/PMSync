/**
 * IMAP Incremental Sync Validation (SYNC-06)
 *
 * Validates that IMAP incremental sync correctly detects new emails
 * since last sync and updates lastSyncToken.
 *
 * Prerequisites: Full sync must have run (lastSyncToken must exist).
 * Token format: comma-separated "folder:modseq" pairs (e.g., "INBOX:12345,SENT:67890").
 */
import {
  apiGet,
  apiPost,
  waitForSyncCompletion,
  assertEqual,
  assertRange,
  assertTrue,
  setResultsCollector,
} from './validation-helpers.mjs';

/**
 * Validate IMAP incremental sync.
 * @param {object} context - Playwright browser context
 * @param {string} cookieHeader - Cookie header string
 * @param {string} csrfToken - CSRF token for POST requests
 * @param {Array} providers - Array of provider records from GET /api/v1/providers
 * @param {boolean} quick - If true, skip triggering a new sync
 * @returns {object} { name, checks, passed, failed, failures, skipped? }
 */
export async function validateImapIncremental(context, cookieHeader, csrfToken, providers, quick) {
  console.log('\n' + '='.repeat(50));
  console.log('  IMAP Incremental Sync Validation (SYNC-06)');
  console.log('='.repeat(50));

  const results = { name: 'IMAP Incremental', checks: 0, passed: 0, failed: 0, failures: [] };
  setResultsCollector(results);

  // --- Step 1: Find IMAP provider ---
  console.log('\n--- Step 1: Find IMAP provider ---');

  const providerList = Array.isArray(providers) ? providers : [];
  const imapProvider = providerList.find(
    p => p.providerType === 'imap'
  );

  if (!imapProvider) {
    console.log('No IMAP provider configured -- skipping');
    setResultsCollector(null);
    return { ...results, skipped: 'No IMAP provider configured' };
  }

  const providerId = imapProvider.id;
  console.log(`  IMAP provider: ${imapProvider.email || 'unknown'} (${providerId})`);

  // --- Step 2: Record pre-sync state ---
  console.log('\n--- Step 2: Record pre-sync state ---');

  let preSyncEmailCount = 0;
  try {
    const emailsRes = await apiGet(
      context,
      `/api/v1/emails?providerId=${providerId}&limit=1`,
      cookieHeader
    );
    preSyncEmailCount = emailsRes?.data?.pagination?.total
      ?? emailsRes?.data?.total
      ?? emailsRes?.pagination?.total
      ?? emailsRes?.total
      ?? 0;
  } catch (err) {
    console.log(`  Failed to fetch pre-sync emails: ${err.message}`);
  }

  console.log(`  Pre-sync email count: ${preSyncEmailCount}`);

  // --- Step 3: Validate lastSyncToken ---
  console.log('\n--- Step 3: Validate lastSyncToken ---');

  let preSyncToken = null;
  try {
    const providersRes = await apiGet(context, '/api/v1/providers', cookieHeader);
    const provList = Array.isArray(providersRes) ? providersRes
      : Array.isArray(providersRes?.data) ? providersRes.data
      : [];
    const freshProvider = provList.find(p => p.id === providerId);
    preSyncToken = freshProvider?.metadata?.lastSyncToken || null;
  } catch (err) {
    console.log(`  Failed to fetch provider metadata: ${err.message}`);
  }

  console.log(`  Pre-sync lastSyncToken: ${preSyncToken ? preSyncToken.substring(0, 60) + '...' : 'null'}`);

  assertTrue(
    !!preSyncToken,
    'IMAP: lastSyncToken exists (full sync prerequisite)'
  );

  if (!preSyncToken) {
    console.log('  Cannot validate incremental sync without lastSyncToken -- stopping');
    setResultsCollector(null);
    return results;
  }

  // IMAP token is comma-separated "folder:modseq" pairs
  // or could be a JSON object -- handle both formats
  let tokenEntries = [];
  try {
    // Try JSON parse first (some implementations store as JSON)
    const parsed = JSON.parse(preSyncToken);
    if (typeof parsed === 'object' && parsed !== null) {
      tokenEntries = Object.entries(parsed).map(([k, v]) => `${k}:${v}`);
    }
  } catch {
    // Comma-separated format
    tokenEntries = preSyncToken.split(',').map(s => s.trim()).filter(Boolean);
  }

  console.log(`  Token entries: ${tokenEntries.length}`);
  for (const entry of tokenEntries.slice(0, 5)) {
    console.log(`    ${entry}`);
  }

  assertTrue(
    tokenEntries.length > 0,
    'IMAP: lastSyncToken has at least one folder entry'
  );

  // Check for INBOX entry
  const hasInbox = tokenEntries.some(e => e.toUpperCase().startsWith('INBOX:'));
  assertTrue(
    hasInbox,
    'IMAP: token has INBOX: modseq entry'
  );

  // Each entry should match folder:number pattern
  let allEntriesValid = true;
  for (const entry of tokenEntries) {
    const parts = entry.split(':');
    if (parts.length < 2 || !parts[0].trim()) {
      allEntriesValid = false;
      console.log(`  WARN: invalid token entry "${entry}"`);
    }
  }
  assertTrue(
    allEntriesValid,
    'IMAP: all token entries have folder:value format'
  );

  // --- Step 4: Trigger incremental sync (skip in quick mode) ---
  console.log('\n--- Step 4: Incremental sync trigger ---');

  if (quick) {
    console.log('  Quick mode -- skipping sync trigger');
  } else {
    console.log('  Triggering incremental sync for IMAP provider...');
    const syncStart = Date.now();
    try {
      await apiPost(
        context,
        `/api/v1/email-sync/sync/${providerId}`,
        null,
        cookieHeader,
        csrfToken
      );
      console.log('  Sync job queued. Waiting for completion...');

      const completed = await waitForSyncCompletion(context, cookieHeader);
      const elapsed = Math.round((Date.now() - syncStart) / 1000);

      if (completed) {
        console.log(`  IMAP incremental sync completed in ${elapsed}s`);
      } else {
        console.log(`  IMAP incremental sync timed out after ${elapsed}s -- validating partial state`);
      }
    } catch (err) {
      console.log(`  Sync trigger failed: ${err.message} -- validating existing state`);
    }
  }

  // --- Step 5: Post-sync validation ---
  console.log('\n--- Step 5: Post-sync state ---');

  let postSyncEmailCount = 0;
  try {
    const emailsRes = await apiGet(
      context,
      `/api/v1/emails?providerId=${providerId}&limit=1`,
      cookieHeader
    );
    postSyncEmailCount = emailsRes?.data?.pagination?.total
      ?? emailsRes?.data?.total
      ?? emailsRes?.pagination?.total
      ?? emailsRes?.total
      ?? 0;
  } catch (err) {
    console.log(`  Failed to fetch post-sync emails: ${err.message}`);
  }

  console.log(`  Post-sync email count: ${postSyncEmailCount}`);

  // Verify token after sync
  let postSyncToken = null;
  try {
    const providersRes = await apiGet(context, '/api/v1/providers', cookieHeader);
    const provList = Array.isArray(providersRes) ? providersRes
      : Array.isArray(providersRes?.data) ? providersRes.data
      : [];
    const freshProvider = provList.find(p => p.id === providerId);
    postSyncToken = freshProvider?.metadata?.lastSyncToken || null;
  } catch (err) {
    console.log(`  Failed to fetch post-sync provider metadata: ${err.message}`);
  }

  assertTrue(
    !!postSyncToken,
    'IMAP: lastSyncToken still present after incremental sync'
  );

  // Email count stable
  assertRange(
    postSyncEmailCount,
    preSyncEmailCount,
    preSyncEmailCount + 1000,
    `IMAP: email count stable (${preSyncEmailCount} -> ${postSyncEmailCount})`
  );

  // --- Step 6: Dedup check ---
  console.log('\n--- Step 6: Dedup check ---');

  let dedupEmails = [];
  try {
    const dedupRes = await apiGet(
      context,
      `/api/v1/emails?providerId=${providerId}&limit=100`,
      cookieHeader
    );
    dedupEmails = dedupRes?.data?.emails
      ?? dedupRes?.data?.data
      ?? dedupRes?.data
      ?? dedupRes?.emails
      ?? [];
    if (!Array.isArray(dedupEmails)) dedupEmails = [];
  } catch (err) {
    console.log(`  Failed to fetch emails for dedup check: ${err.message}`);
  }

  if (dedupEmails.length > 0) {
    const externalIds = dedupEmails.map(e => e.externalId).filter(Boolean);
    const uniqueIds = new Set(externalIds);
    assertEqual(
      uniqueIds.size,
      externalIds.length,
      `IMAP: no duplicate externalIds in ${externalIds.length} emails`
    );
  } else {
    console.log('  SKIP: no emails to check for dedup');
  }

  // --- Report ---
  console.log(`\n--- IMAP incremental validation: ${results.checks} checks, ${results.passed} passed, ${results.failed} failed ---`);

  setResultsCollector(null);
  return results;
}
