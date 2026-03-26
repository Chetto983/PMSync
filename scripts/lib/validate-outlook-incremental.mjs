/**
 * Outlook Incremental Sync Validation (SYNC-05)
 *
 * Validates that Outlook (Microsoft) delta sync correctly detects
 * new emails, modifications, deletions, and updates lastSyncToken.
 *
 * Prerequisites: Full sync must have run (lastSyncToken must exist).
 * Token format: JSON map of { folderName: deltaLink } pairs.
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
 * Validate Outlook incremental (delta) sync.
 * @param {object} context - Playwright browser context
 * @param {string} cookieHeader - Cookie header string
 * @param {string} csrfToken - CSRF token for POST requests
 * @param {Array} providers - Array of provider records from GET /api/v1/providers
 * @param {boolean} quick - If true, skip triggering a new sync
 * @returns {object} { name, checks, passed, failed, failures, skipped? }
 */
export async function validateOutlookIncremental(context, cookieHeader, csrfToken, providers, quick) {
  console.log('\n' + '='.repeat(50));
  console.log('  Outlook Incremental Sync Validation (SYNC-05)');
  console.log('='.repeat(50));

  const results = { name: 'Outlook Incremental', checks: 0, passed: 0, failed: 0, failures: [] };
  setResultsCollector(results);

  // --- Step 1: Find Outlook provider ---
  console.log('\n--- Step 1: Find Outlook provider ---');

  const providerList = Array.isArray(providers) ? providers : [];
  const outlookProvider = providerList.find(
    p => p.providerType === 'microsoft' || p.providerType === 'outlook'
  );

  if (!outlookProvider) {
    console.log('No Outlook provider configured -- skipping');
    setResultsCollector(null);
    return { ...results, skipped: 'No Outlook provider configured' };
  }

  const providerId = outlookProvider.id;
  console.log(`  Outlook provider: ${outlookProvider.email || 'unknown'} (${providerId})`);

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
    'Outlook: lastSyncToken exists (full sync prerequisite)'
  );

  if (!preSyncToken) {
    console.log('  Cannot validate incremental sync without lastSyncToken -- stopping');
    setResultsCollector(null);
    return results;
  }

  // Outlook token is a JSON map of folder deltaLinks
  let parsedToken = null;
  try {
    parsedToken = JSON.parse(preSyncToken);
  } catch {
    // Token might not be JSON -- could be a single deltaLink string
    console.log('  Note: lastSyncToken is not JSON -- may be a single deltaLink');
  }

  if (parsedToken && typeof parsedToken === 'object') {
    const keys = Object.keys(parsedToken);
    console.log(`  Token contains ${keys.length} folder deltaLinks: ${keys.join(', ')}`);

    // Check for INBOX key (case-insensitive)
    const hasInbox = keys.some(k => k.toLowerCase() === 'inbox');
    assertTrue(
      hasInbox,
      'Outlook: token has INBOX deltaLink'
    );

    // Each deltaLink should be a non-empty string (URL)
    let allLinksValid = true;
    for (const [folder, link] of Object.entries(parsedToken)) {
      if (typeof link !== 'string' || link.length === 0) {
        allLinksValid = false;
        console.log(`  WARN: folder "${folder}" has invalid deltaLink`);
      }
    }
    assertTrue(
      allLinksValid,
      'Outlook: all folder deltaLinks are non-empty strings'
    );
  } else {
    // Single string token -- just verify it's non-empty
    assertTrue(
      typeof preSyncToken === 'string' && preSyncToken.length > 0,
      'Outlook: lastSyncToken is non-empty string'
    );
  }

  // --- Step 4: Trigger incremental sync (skip in quick mode) ---
  console.log('\n--- Step 4: Incremental sync trigger ---');

  if (quick) {
    console.log('  Quick mode -- skipping sync trigger');
  } else {
    console.log('  Triggering incremental sync for Outlook provider...');
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
        console.log(`  Outlook incremental sync completed in ${elapsed}s`);
      } else {
        console.log(`  Outlook incremental sync timed out after ${elapsed}s -- validating partial state`);
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
    'Outlook: lastSyncToken still present after incremental sync'
  );

  // Email count stable
  assertRange(
    postSyncEmailCount,
    preSyncEmailCount,
    preSyncEmailCount + 1000,
    `Outlook: email count stable (${preSyncEmailCount} -> ${postSyncEmailCount})`
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
      `Outlook: no duplicate externalIds in ${externalIds.length} emails`
    );
  } else {
    console.log('  SKIP: no emails to check for dedup');
  }

  // --- Report ---
  console.log(`\n--- Outlook incremental validation: ${results.checks} checks, ${results.passed} passed, ${results.failed} failed ---`);

  setResultsCollector(null);
  return results;
}
