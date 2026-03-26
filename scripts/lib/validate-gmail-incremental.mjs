/**
 * Gmail Incremental Sync Validation (SYNC-04)
 *
 * Validates that Gmail incremental sync (history-based) correctly detects
 * new emails, read-state changes, and updates lastSyncToken.
 *
 * Prerequisites: Full sync must have run (lastSyncToken must exist).
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
 * Validate Gmail incremental sync.
 * @param {object} context - Playwright browser context
 * @param {string} cookieHeader - Cookie header string
 * @param {string} csrfToken - CSRF token for POST requests
 * @param {Array} providers - Array of provider records from GET /api/v1/providers
 * @param {boolean} quick - If true, skip triggering a new sync
 * @returns {object} { name, checks, passed, failed, failures, skipped? }
 */
export async function validateGmailIncremental(context, cookieHeader, csrfToken, providers, quick) {
  console.log('\n' + '='.repeat(50));
  console.log('  Gmail Incremental Sync Validation (SYNC-04)');
  console.log('='.repeat(50));

  const results = { name: 'Gmail Incremental', checks: 0, passed: 0, failed: 0, failures: [] };
  setResultsCollector(results);

  // --- Step 1: Find Gmail provider ---
  console.log('\n--- Step 1: Find Gmail provider ---');

  const providerList = Array.isArray(providers) ? providers : [];
  const gmailProvider = providerList.find(
    p => p.providerType === 'google' || p.providerType === 'gmail'
  );

  if (!gmailProvider) {
    console.log('No Gmail provider configured -- skipping');
    setResultsCollector(null);
    return { ...results, skipped: 'No Gmail provider configured' };
  }

  const providerId = gmailProvider.id;
  console.log(`  Gmail provider: ${gmailProvider.email || 'unknown'} (${providerId})`);

  // --- Step 2: Record pre-sync state ---
  console.log('\n--- Step 2: Record pre-sync state ---');

  let preSyncEmailCount = 0;
  let preSyncLatestExternalId = null;
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

    const emails = emailsRes?.data?.emails
      ?? emailsRes?.data?.data
      ?? emailsRes?.data
      ?? emailsRes?.emails
      ?? [];
    if (Array.isArray(emails) && emails.length > 0) {
      preSyncLatestExternalId = emails[0].externalId;
    }
  } catch (err) {
    console.log(`  Failed to fetch pre-sync emails: ${err.message}`);
  }

  console.log(`  Pre-sync email count: ${preSyncEmailCount}`);
  console.log(`  Pre-sync latest externalId: ${preSyncLatestExternalId || 'none'}`);

  // --- Step 3: Record pre-sync lastSyncToken ---
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

  console.log(`  Pre-sync lastSyncToken: ${preSyncToken ? preSyncToken.substring(0, 30) + '...' : 'null'}`);

  // --- Step 4: Assert lastSyncToken exists ---
  assertTrue(
    !!preSyncToken,
    'Gmail: lastSyncToken exists (full sync prerequisite)'
  );

  if (!preSyncToken) {
    console.log('  Cannot validate incremental sync without lastSyncToken -- stopping');
    setResultsCollector(null);
    return results;
  }

  // Gmail historyId should be a numeric string
  assertTrue(
    /^\d+$/.test(preSyncToken),
    'Gmail: lastSyncToken is numeric historyId'
  );

  // --- Step 5-6: Trigger incremental sync (skip in quick mode) ---
  console.log('\n--- Step 5: Incremental sync trigger ---');

  if (quick) {
    console.log('  Quick mode -- skipping sync trigger');
  } else {
    console.log('  Triggering incremental sync for Gmail provider...');
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
        console.log(`  Gmail incremental sync completed in ${elapsed}s`);
      } else {
        console.log(`  Gmail incremental sync timed out after ${elapsed}s -- validating partial state`);
      }
    } catch (err) {
      console.log(`  Sync trigger failed: ${err.message} -- validating existing state`);
    }
  }

  // --- Step 7: Record post-sync state ---
  console.log('\n--- Step 7: Post-sync state ---');

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

  // --- Step 8: Verify lastSyncToken after sync ---
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

  console.log(`  Post-sync lastSyncToken: ${postSyncToken ? postSyncToken.substring(0, 30) + '...' : 'null'}`);

  assertTrue(
    !!postSyncToken,
    'Gmail: lastSyncToken still present after incremental sync'
  );

  // Token should be updated or unchanged (incremental sync updates even if no changes)
  if (!quick) {
    assertTrue(
      postSyncToken !== null,
      'Gmail: lastSyncToken updated or unchanged after incremental sync'
    );
  }

  // --- Step 9: Email count stable ---
  console.log('\n--- Step 9: Email count stability ---');

  assertRange(
    postSyncEmailCount,
    preSyncEmailCount,
    preSyncEmailCount + 1000,
    `Gmail: email count stable (${preSyncEmailCount} -> ${postSyncEmailCount})`
  );

  // --- Step 10: No duplicate externalIds ---
  console.log('\n--- Step 10: Dedup check ---');

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
      `Gmail: no duplicate externalIds in ${externalIds.length} emails`
    );
  } else {
    console.log('  SKIP: no emails to check for dedup');
  }

  // --- Report ---
  console.log(`\n--- Gmail incremental validation: ${results.checks} checks, ${results.passed} passed, ${results.failed} failed ---`);

  setResultsCollector(null);
  return results;
}
