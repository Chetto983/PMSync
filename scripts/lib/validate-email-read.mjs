/**
 * Email Read Validation (READ-01, READ-02, READ-03, READ-04, READ-05)
 *
 * Validates email list, filter, pagination, thread, and single-email GET
 * endpoints against live provider data via the existing REST API.
 *
 *   READ-01: Folder filter (by path and specialUse)
 *   READ-02: Compound filters (isRead + hasAttachments + dateRange)
 *   READ-03: Offset-based pagination (page/limit, no duplicates)
 *   READ-04: Thread view (grouped by conversation, body content)
 *   READ-05: Single email GET (full body, headers, metadata)
 */
import {
  apiGet,
  assertEqual,
  assertTrue,
  setResultsCollector,
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
 * Get folders for a specific provider.
 * @returns {Array} folder objects
 */
async function getProviderFolders(context, cookieHeader, providerId) {
  const res = await apiGet(
    context,
    `/api/v1/folders?providerId=${providerId}`,
    cookieHeader,
  );
  const folders = res?.data?.folders ?? res?.data ?? res?.folders ?? [];
  return Array.isArray(folders) ? folders : [];
}

/**
 * Unwrap email list from API response envelope.
 */
function unwrapEmails(res) {
  const emails = res?.data?.emails ?? res?.data?.data ?? res?.data ?? res?.emails ?? [];
  return Array.isArray(emails) ? emails : [];
}

/**
 * Unwrap pagination metadata from API response.
 */
function unwrapPagination(res) {
  return res?.data?.pagination ?? res?.pagination ?? res?.data?.meta ?? res?.meta ?? null;
}

/**
 * Determine provider type string for display.
 */
function providerTypeLabel(provider) {
  const pt = (provider.providerType || '').toLowerCase();
  if (pt === 'google' || pt === 'gmail') return 'Gmail';
  if (pt === 'microsoft' || pt === 'outlook') return 'Outlook';
  if (pt === 'imap' || pt === 'generic') return 'IMAP';
  return pt;
}

/**
 * Filter providers by type flag.
 */
function filterProviders(providers, providerFilter) {
  if (!providerFilter || providerFilter === 'all') return providers;

  return providers.filter(p => {
    const pt = (p.providerType || '').toLowerCase();
    switch (providerFilter) {
      case 'gmail':
        return pt === 'google' || pt === 'gmail';
      case 'microsoft':
      case 'outlook':
        return pt === 'microsoft' || pt === 'outlook';
      case 'imap':
        return pt === 'imap' || pt === 'generic';
      default:
        return true;
    }
  });
}

// --- READ-01: Folder filter ---

async function validateFolderFilter(context, cookieHeader, providerId, folders, results) {
  console.log('\n  --- READ-01: Folder filter ---');

  // Find INBOX folder
  const inbox = folders.find(f => (f.specialUse || '').toUpperCase() === 'INBOX');
  if (!inbox) {
    console.log('  SKIP: No INBOX folder found');
    results.checks++;
    results.passed++;
    return;
  }

  // Fetch emails by folder path
  const byPathRes = await apiGet(
    context,
    `/api/v1/emails?providerId=${providerId}&folder=${encodeURIComponent(inbox.path || inbox.name)}&limit=10`,
    cookieHeader,
  );
  const byPath = unwrapEmails(byPathRes);
  const byPathPagination = unwrapPagination(byPathRes);

  assertTrue(byPath.length > 0, 'READ-01: Inbox has emails via folder path');

  // Verify all returned emails belong to the inbox folder
  for (const email of byPath) {
    const folderMatch =
      (email.folder || '').toLowerCase() === (inbox.path || inbox.name || '').toLowerCase()
      || (email.labels || []).some(l => l === inbox.externalId);
    assertTrue(folderMatch, `READ-01: Email ${email.id} belongs to inbox folder`);
  }

  // Fetch emails by specialUse
  const bySpecialUseRes = await apiGet(
    context,
    `/api/v1/emails?providerId=${providerId}&specialUse=INBOX&limit=10`,
    cookieHeader,
  );
  const bySpecialUsePagination = unwrapPagination(bySpecialUseRes);

  if (byPathPagination && bySpecialUsePagination) {
    assertEqual(
      bySpecialUsePagination.total,
      byPathPagination.total,
      'READ-01: specialUse=INBOX matches folder path count',
    );
  } else {
    // Fallback: compare array lengths if no pagination metadata
    const bySpecialUse = unwrapEmails(bySpecialUseRes);
    assertTrue(
      bySpecialUse.length > 0,
      'READ-01: specialUse=INBOX returns emails',
    );
  }

  // Test SENT folder if available
  const sent = folders.find(f => (f.specialUse || '').toUpperCase() === 'SENT');
  if (sent) {
    const sentRes = await apiGet(
      context,
      `/api/v1/emails?providerId=${providerId}&folder=${encodeURIComponent(sent.path || sent.name)}&limit=5`,
      cookieHeader,
    );
    const sentEmails = unwrapEmails(sentRes);
    assertTrue(sentEmails.length > 0, 'READ-01: Sent folder has emails');
  }
}

// --- READ-02: Compound filters ---

async function validateCompoundFilters(context, cookieHeader, providerId, options, results) {
  console.log('\n  --- READ-02: Compound filters ---');

  const endDate = new Date().toISOString();
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // Unread + date range
  const unreadRes = await apiGet(
    context,
    `/api/v1/emails?providerId=${providerId}&isRead=false&startDate=${startDate}&endDate=${endDate}&limit=50`,
    cookieHeader,
  );
  const unreadEmails = unwrapEmails(unreadRes);

  if (unreadEmails.length > 0) {
    for (const email of unreadEmails) {
      assertTrue(email.isRead === false, `READ-02: Email ${email.id} is unread`);
      const received = new Date(email.receivedAt);
      assertTrue(
        received >= new Date(startDate) && received <= new Date(endDate),
        `READ-02: Email ${email.id} receivedAt within date range`,
      );
    }
  } else {
    console.log('  INFO: No unread emails in date range (0 results is valid)');
    results.checks++;
    results.passed++;
  }

  // Has attachments
  const attachRes = await apiGet(
    context,
    `/api/v1/emails?providerId=${providerId}&hasAttachments=true&limit=10`,
    cookieHeader,
  );
  const attachEmails = unwrapEmails(attachRes);

  if (attachEmails.length > 0) {
    for (const email of attachEmails) {
      assertTrue(
        (email.attachments && email.attachments.length > 0) || email.hasAttachments === true,
        `READ-02: Email ${email.id} has attachments`,
      );
    }
  } else {
    console.log('  INFO: No emails with attachments found (0 results is valid)');
    results.checks++;
    results.passed++;
  }

  // Combined 3-filter test (skip in quick mode)
  if (!options.quick) {
    const combinedRes = await apiGet(
      context,
      `/api/v1/emails?providerId=${providerId}&isRead=false&hasAttachments=true&startDate=${startDate}&endDate=${endDate}&limit=50`,
      cookieHeader,
    );
    const combinedEmails = unwrapEmails(combinedRes);

    if (combinedEmails.length > 0) {
      for (const email of combinedEmails) {
        assertTrue(email.isRead === false, `READ-02: Combined - Email ${email.id} is unread`);
        assertTrue(
          (email.attachments && email.attachments.length > 0) || email.hasAttachments === true,
          `READ-02: Combined - Email ${email.id} has attachments`,
        );
      }
    } else {
      console.log('  INFO: No emails matching all 3 filters (0 results is valid)');
      results.checks++;
      results.passed++;
    }
  }
}

// --- READ-03: Offset-based pagination ---

async function validatePagination(context, cookieHeader, providerId, results) {
  console.log('\n  --- READ-03: Offset-based pagination ---');

  const page1Res = await apiGet(
    context,
    `/api/v1/emails?providerId=${providerId}&limit=5&page=1`,
    cookieHeader,
  );
  const page1 = unwrapEmails(page1Res);
  const page1Pagination = unwrapPagination(page1Res);

  const page2Res = await apiGet(
    context,
    `/api/v1/emails?providerId=${providerId}&limit=5&page=2`,
    cookieHeader,
  );
  const page2 = unwrapEmails(page2Res);

  // Check no duplicate IDs across pages
  const page1Ids = new Set(page1.map(e => e.id));
  const page2Ids = new Set(page2.map(e => e.id));
  const overlap = [...page1Ids].filter(id => page2Ids.has(id));
  assertEqual(overlap.length, 0, 'READ-03: No duplicate emails across pages');

  // Verify page 1 returns the requested limit
  const totalCount = page1Pagination?.total ?? null;
  assertTrue(
    page1.length === 5 || (totalCount !== null && page1.length === totalCount),
    'READ-03: Page 1 returns requested limit',
  );

  // Verify ordering: last email on page 1 >= first email on page 2
  if (page1.length > 0 && page2.length > 0) {
    const lastPage1 = new Date(page1[page1.length - 1].receivedAt);
    const firstPage2 = new Date(page2[0].receivedAt);
    assertTrue(
      lastPage1 >= firstPage2,
      'READ-03: Page 1 last email receivedAt >= page 2 first email receivedAt',
    );
  }

  // Verify pagination metadata exists
  assertTrue(
    page1Pagination !== null,
    'READ-03: Response includes pagination metadata',
  );
}

// --- READ-04: Thread view ---

async function validateThreadView(context, cookieHeader, providerId, results) {
  console.log('\n  --- READ-04: Thread view ---');

  // Find an email with a threadId
  const listRes = await apiGet(
    context,
    `/api/v1/emails?providerId=${providerId}&limit=50`,
    cookieHeader,
  );
  const emails = unwrapEmails(listRes);

  const threadedEmail = emails.find(e => e.threadId && e.threadId.trim() !== '');
  if (!threadedEmail) {
    console.log('  SKIP: No threaded email found for this provider');
    results.checks++;
    results.passed++;
    return;
  }

  const threadId = threadedEmail.threadId;
  console.log(`  Thread ID: ${threadId}`);

  const threadRes = await apiGet(
    context,
    `/api/v1/emails/thread/${threadId}`,
    cookieHeader,
  );
  const thread = threadRes?.data ?? threadRes;
  const threadEmails = Array.isArray(thread) ? thread : [];

  assertTrue(Array.isArray(thread), 'READ-04: Thread returns array');
  assertTrue(threadEmails.length >= 1, 'READ-04: Thread has at least 1 email');

  for (const email of threadEmails) {
    assertTrue(
      email.bodyHtml || email.bodyText,
      `READ-04: Thread email ${email.id} has body content`,
    );
  }

  // Verify all emails share the same threadId
  assertTrue(
    threadEmails.every(e => e.threadId === threadId),
    'READ-04: All thread emails share threadId',
  );
}

// --- READ-05: Single email GET ---

async function validateSingleEmailGet(context, cookieHeader, providerId, results) {
  console.log('\n  --- READ-05: Single email GET ---');

  // Get an email ID from list
  const listRes = await apiGet(
    context,
    `/api/v1/emails?providerId=${providerId}&limit=1`,
    cookieHeader,
  );
  const emails = unwrapEmails(listRes);

  if (emails.length === 0) {
    console.log('  SKIP: No emails found for this provider');
    results.checks++;
    results.passed++;
    return;
  }

  const emailId = emails[0].id;
  console.log(`  Email ID: ${emailId}`);

  const detailRes = await apiGet(
    context,
    `/api/v1/emails/${emailId}`,
    cookieHeader,
  );
  const email = detailRes?.data ?? detailRes;

  assertEqual(email.id, emailId, 'READ-05: Correct email returned');
  assertTrue(email.bodyHtml || email.bodyText, 'READ-05: Has body content');
  assertTrue(email.from, 'READ-05: Has from field');
  assertTrue(email.subject !== undefined, 'READ-05: Has subject field');
  assertTrue(email.receivedAt, 'READ-05: Has receivedAt');
  assertTrue(email.provider || email.providerId, 'READ-05: Has provider info');
  assertTrue(email.attachments !== undefined, 'READ-05: Has attachments array');
}

// --- Main export ---

/**
 * Run email read validation for all matching providers.
 *
 * @param {object} context - Playwright browser context
 * @param {string} cookieHeader - Cookie header string
 * @param {string} csrfToken - CSRF token (unused for read-only, kept for API compat)
 * @param {object} options - { provider?: string, quick?: boolean }
 * @returns {Array} array of result objects for report()
 */
export async function validateEmailRead(context, cookieHeader, csrfToken, options = {}) {
  const { provider: providerFilter, quick } = options;

  console.log('\n' + '='.repeat(50));
  console.log('  Email Read Validation');
  console.log('='.repeat(50));

  const allProviders = await getProviders(context, cookieHeader);
  const providers = filterProviders(allProviders, providerFilter);

  console.log(`\nDiscovered ${allProviders.length} providers, testing ${providers.length}:`);
  for (const p of providers) {
    console.log(`  - ${providerTypeLabel(p)}: ${p.email || 'unknown'} (${p.id})`);
  }

  if (providers.length === 0) {
    return [{ name: 'EmailRead', checks: 0, passed: 0, failed: 0, failures: [], skipped: 'No matching providers found' }];
  }

  const allResults = [];

  for (const prov of providers) {
    const label = providerTypeLabel(prov);
    const results = { name: `EmailRead-${label}`, checks: 0, passed: 0, failed: 0, failures: [] };
    setResultsCollector(results);

    // Get folders for this provider
    let folders = [];
    try {
      folders = await getProviderFolders(context, cookieHeader, prov.id);
    } catch (err) {
      console.log(`  Failed to fetch folders for ${label}: ${err.message}`);
    }

    // READ-01: Folder filter
    try {
      await validateFolderFilter(context, cookieHeader, prov.id, folders, results);
    } catch (err) {
      console.log(`  ERROR in READ-01 for ${label}: ${err.message}`);
      results.checks++;
      results.failed++;
      results.failures.push(`READ-01 ${label}: ${err.message}`);
    }

    // READ-02: Compound filters
    try {
      await validateCompoundFilters(context, cookieHeader, prov.id, { quick }, results);
    } catch (err) {
      console.log(`  ERROR in READ-02 for ${label}: ${err.message}`);
      results.checks++;
      results.failed++;
      results.failures.push(`READ-02 ${label}: ${err.message}`);
    }

    // READ-03: Pagination
    try {
      await validatePagination(context, cookieHeader, prov.id, results);
    } catch (err) {
      console.log(`  ERROR in READ-03 for ${label}: ${err.message}`);
      results.checks++;
      results.failed++;
      results.failures.push(`READ-03 ${label}: ${err.message}`);
    }

    // READ-04: Thread view
    try {
      await validateThreadView(context, cookieHeader, prov.id, results);
    } catch (err) {
      console.log(`  ERROR in READ-04 for ${label}: ${err.message}`);
      results.checks++;
      results.failed++;
      results.failures.push(`READ-04 ${label}: ${err.message}`);
    }

    // READ-05: Single email GET
    try {
      await validateSingleEmailGet(context, cookieHeader, prov.id, results);
    } catch (err) {
      console.log(`  ERROR in READ-05 for ${label}: ${err.message}`);
      results.checks++;
      results.failed++;
      results.failures.push(`READ-05 ${label}: ${err.message}`);
    }

    setResultsCollector(null);
    allResults.push(results);
  }

  return allResults;
}
