/**
 * Attachments & Search Validation (READ-06, READ-07, READ-08, READ-09)
 *
 * Validates attachment download, on-demand fetch, folder stats, and
 * full-text search endpoints against live provider data via the REST API.
 *
 *   READ-06: Attachment download (metadata + binary content)
 *   READ-07: On-demand fetch (S3 cache or provider fetch)
 *   READ-08: Folder stats (total, unread, byFolder)
 *   READ-09: Full-text search (known subject word match)
 */
import {
  apiGet,
  assertEqual,
  assertTrue,
  setResultsCollector,
  BACKEND_URL,
} from './validation-helpers.mjs';

/**
 * Get list of configured providers.
 * @returns {Array} provider records
 */
async function getProviders(context, cookieHeader) {
  const res = await apiGet(context, '/api/v1/providers', cookieHeader);
  const providers = Array.isArray(res) ? res
    : Array.isArray(res?.data) ? res.data
    : [];
  return providers;
}

/**
 * Unwrap email list from API response envelope.
 */
function unwrapEmails(res) {
  const emails = res?.data?.emails ?? res?.data?.data ?? res?.data ?? res?.emails ?? [];
  return Array.isArray(emails) ? emails : [];
}

/**
 * Determine provider type string for display.
 */
function providerTypeLabel(provider) {
  const type = provider.providerType || provider.type || '';
  if (type === 'google') return 'Gmail';
  if (type === 'microsoft') return 'Outlook';
  if (type === 'imap') return 'IMAP';
  return type;
}

/**
 * Check if provider matches the CLI filter.
 */
function matchesProviderFilter(provider, filter) {
  if (filter === 'all') return true;
  const type = provider.providerType || provider.type || '';
  if (filter === 'gmail') return type === 'google';
  if (filter === 'outlook' || filter === 'microsoft') return type === 'microsoft';
  if (filter === 'imap') return type === 'imap';
  return false;
}

// --- READ-06: Attachment download ---

async function validateAttachmentDownload(context, cookieHeader, providerId, results) {
  console.log('\n  --- READ-06: Attachment download ---');

  // Find emails with attachments
  const res = await apiGet(
    context,
    `/api/v1/emails?providerId=${providerId}&hasAttachments=true&limit=5`,
    cookieHeader,
  );
  const emails = unwrapEmails(res);

  // Find first email that actually has attachment objects
  const emailWithAttach = emails.find(e => e.attachments?.length > 0);
  if (!emailWithAttach) {
    console.log('  SKIP: No emails with attachments for provider');
    return { attachmentId: null, meta: null, dlStatus: null, bodyLength: 0 };
  }

  const attachmentId = emailWithAttach.attachments[0].id;
  console.log(`  Attachment ID: ${attachmentId}`);

  // GET metadata (singular /email/attachments/)
  const metaRes = await apiGet(
    context,
    `/api/v1/email/attachments/${attachmentId}/metadata`,
    cookieHeader,
  );
  const meta = metaRes?.data ?? metaRes;

  assertTrue(meta.filename, 'READ-06: Attachment has filename');
  assertTrue(meta.mimeType, 'READ-06: Attachment has mimeType');
  assertTrue(meta.size > 0, 'READ-06: Attachment has positive size');

  // Download binary content via context.request.get (NOT apiGet which expects JSON)
  const dlResponse = await context.request.get(
    BACKEND_URL + `/api/v1/email/attachments/${attachmentId}/download`,
    { headers: { Cookie: cookieHeader } },
  );

  const dlStatus = dlResponse.status();
  assertEqual(dlStatus, 200, 'READ-06: Download returns 200');

  const contentType = dlResponse.headers()['content-type'];
  assertTrue(
    contentType && contentType !== 'application/json',
    'READ-06: Content-Type is not JSON',
  );

  const contentDisposition = dlResponse.headers()['content-disposition'];
  assertTrue(
    contentDisposition?.includes('attachment'),
    'READ-06: Content-Disposition is attachment',
  );

  const body = await dlResponse.body();
  assertTrue(body.byteLength > 0, 'READ-06: Downloaded file has content');

  return { attachmentId, meta, dlStatus, bodyLength: body.byteLength };
}

// --- READ-07: On-demand fetch ---

async function validateOnDemandFetch(context, cookieHeader, providerId, attachData, results) {
  console.log('\n  --- READ-07: On-demand fetch ---');

  const { attachmentId, meta, dlStatus, bodyLength } = attachData;

  if (!attachmentId) {
    console.log('  SKIP: No attachment available (skipped in READ-06)');
    return;
  }

  // Check cache state
  const isInS3 = meta?.isInS3 || meta?.storageType === 's3';
  console.log('  INFO: Attachment ' + (isInS3 ? 'served from S3 cache' : 'fetched on-demand from provider'));

  assertTrue(dlStatus === 200, 'READ-07: Download succeeds regardless of cache state');
  assertTrue(bodyLength > 0, 'READ-07: File content returned regardless of cache state');
}

// --- READ-08: Folder stats ---

async function validateFolderStats(context, cookieHeader, providerId, results) {
  console.log('\n  --- READ-08: Folder stats ---');

  const res = await apiGet(
    context,
    `/api/v1/emails/stats?providerId=${providerId}`,
    cookieHeader,
  );
  const stats = res?.data ?? res;

  assertTrue(
    typeof stats.total === 'number' && stats.total >= 0,
    'READ-08: total is non-negative number',
  );
  assertTrue(
    typeof stats.unread === 'number' && stats.unread >= 0,
    'READ-08: unread is non-negative number',
  );
  assertTrue(stats.total >= stats.unread, 'READ-08: total >= unread');
  assertTrue(typeof stats.starred === 'number', 'READ-08: starred is number');
  assertTrue(typeof stats.today === 'number', 'READ-08: today is number');
  assertTrue(typeof stats.thisWeek === 'number', 'READ-08: thisWeek is number');
  assertTrue(typeof stats.attachments === 'number', 'READ-08: attachments count is number');

  assertTrue(
    typeof stats.byFolder === 'object' && stats.byFolder !== null,
    'READ-08: byFolder is object',
  );
  assertTrue(
    Object.keys(stats.byFolder).length > 0,
    'READ-08: byFolder has entries',
  );

  const allNonNegative = Object.values(stats.byFolder).every(
    v => typeof v === 'number' && v >= 0,
  );
  assertTrue(allNonNegative, 'READ-08: All byFolder values are non-negative numbers');
}

// --- READ-09: Full-text search ---

async function validateSearch(context, cookieHeader, providerId, results) {
  console.log('\n  --- READ-09: Full-text search ---');

  // Get a real email to extract a search term from
  const listRes = await apiGet(
    context,
    `/api/v1/emails?providerId=${providerId}&limit=1`,
    cookieHeader,
  );
  const emails = unwrapEmails(listRes);

  if (emails.length === 0) {
    console.log('  SKIP: No emails found for this provider');
    return;
  }

  const subject = emails[0].subject || '';
  const words = subject.split(/\s+/).filter(w => w.length >= 4);
  const cleanWords = words.map(w => w.replace(/[^a-zA-Z0-9]/g, '')).filter(w => w.length >= 4);

  if (cleanWords.length === 0) {
    console.log(`  SKIP: No suitable search word found in subject "${subject}"`);
    return;
  }

  const searchTerm = cleanWords[0];
  console.log(`  Search term: "${searchTerm}" (from subject: "${subject.substring(0, 60)}")`);

  const searchRes = await apiGet(
    context,
    `/api/v1/emails/search?q=${encodeURIComponent(searchTerm)}&providerId=${providerId}&limit=20`,
    cookieHeader,
  );
  const searchData = searchRes?.data ?? searchRes;
  const searchEmails = searchData?.emails ?? searchData ?? [];

  assertTrue(Array.isArray(searchEmails), 'READ-09: Search returns array');
  assertTrue(
    searchEmails.length > 0,
    'READ-09: Search returns at least 1 result for known term "' + searchTerm + '"',
  );

  if (Array.isArray(searchEmails) && searchEmails.length > 0) {
    const hasMatch = searchEmails.some(e =>
      (e.subject || '').toLowerCase().includes(searchTerm.toLowerCase())
      || (e.from || '').toLowerCase().includes(searchTerm.toLowerCase()),
    );
    assertTrue(hasMatch, 'READ-09: At least one result contains the search term');
  }
}

// --- Main export ---

/**
 * Run attachments and search validation for all matching providers.
 *
 * @param {object} context - Playwright browser context
 * @param {string} cookieHeader - Cookie header string
 * @param {string} csrfToken - CSRF token (unused for read-only, kept for API compat)
 * @param {object} options - { provider?: string, quick?: boolean }
 * @returns {Array} array of result objects for report()
 */
export async function validateAttachmentsSearch(context, cookieHeader, csrfToken, options = {}) {
  const { provider: providerFilter = 'all', quick = false } = options;

  console.log('\n' + '='.repeat(50));
  console.log('  Attachments & Search Validation');
  console.log('='.repeat(50));

  const allProviders = await getProviders(context, cookieHeader);
  const providers = allProviders.filter(p => matchesProviderFilter(p, providerFilter));

  console.log(`\nDiscovered ${allProviders.length} providers, testing ${providers.length}:`);
  for (const p of providers) {
    console.log(`  - ${providerTypeLabel(p)}: ${p.email || 'unknown'} (${p.id})`);
  }

  if (providers.length === 0) {
    return [{
      name: 'AttachmentsSearch',
      checks: 0,
      passed: 0,
      failed: 0,
      failures: [],
      skipped: 'No matching providers found',
    }];
  }

  const allResults = [];

  for (const prov of providers) {
    const label = providerTypeLabel(prov);
    const results = { name: `AttachmentsSearch-${label}`, checks: 0, passed: 0, failed: 0, failures: [] };
    setResultsCollector(results);

    // READ-06: Attachment download
    let attachData = { attachmentId: null, meta: null, dlStatus: null, bodyLength: 0 };
    try {
      attachData = await validateAttachmentDownload(context, cookieHeader, prov.id, results);
    } catch (err) {
      console.log(`  ERROR in READ-06 for ${label}: ${err.message}`);
      results.checks++;
      results.failed++;
      results.failures.push(`READ-06 ${label}: ${err.message}`);
    }

    // READ-07: On-demand fetch (reuses attachment data from READ-06)
    try {
      await validateOnDemandFetch(context, cookieHeader, prov.id, attachData, results);
    } catch (err) {
      console.log(`  ERROR in READ-07 for ${label}: ${err.message}`);
      results.checks++;
      results.failed++;
      results.failures.push(`READ-07 ${label}: ${err.message}`);
    }

    // READ-08: Folder stats
    try {
      await validateFolderStats(context, cookieHeader, prov.id, results);
    } catch (err) {
      console.log(`  ERROR in READ-08 for ${label}: ${err.message}`);
      results.checks++;
      results.failed++;
      results.failures.push(`READ-08 ${label}: ${err.message}`);
    }

    // READ-09: Full-text search
    try {
      await validateSearch(context, cookieHeader, prov.id, results);
    } catch (err) {
      console.log(`  ERROR in READ-09 for ${label}: ${err.message}`);
      results.checks++;
      results.failed++;
      results.failures.push(`READ-09 ${label}: ${err.message}`);
    }

    setResultsCollector(null);
    allResults.push(results);
  }

  return allResults;
}
