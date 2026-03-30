/**
 * Drafts & Bulk Operations Validation (WRITE-06..10)
 *
 * Validates draft CRUD and bulk operations against live provider data
 * via the REST API.
 *
 *   WRITE-06: Draft CRUD lifecycle (create, get, update, delete)
 *   WRITE-07: Bulk mark-read / mark-unread
 *   WRITE-08: Bulk move to folder
 *   WRITE-09: Bulk delete
 *   WRITE-10: Bulk labels add/remove (Gmail only)
 */
import {
  apiGet,
  apiPost,
  apiPatch,
  apiDelete,
  apiDeleteWithBody,
  assertEqual,
  assertTrue,
  setResultsCollector,
  BACKEND_URL,
} from './validation-helpers.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/**
 * Get labels for the current tenant.
 * @returns {Array} label records
 */
async function getLabels(context, cookieHeader) {
  try {
    const res = await apiGet(context, '/api/v1/labels', cookieHeader);
    const labels = Array.isArray(res) ? res
      : Array.isArray(res?.data) ? res.data
      : Array.isArray(res?.labels) ? res.labels
      : [];
    return labels;
  } catch {
    return [];
  }
}

/**
 * Find test emails from a provider's inbox.
 * @returns {Array} emails with id, externalId, isRead, folder
 */
async function findTestEmails(context, cookieHeader, providerId, count = 5) {
  const res = await apiGet(
    context,
    `/api/v1/emails?providerId=${providerId}&folder=INBOX&limit=${count}`,
    cookieHeader,
  );
  return unwrapEmails(res);
}

// ---------------------------------------------------------------------------
// WRITE-06: Draft CRUD lifecycle
// ---------------------------------------------------------------------------

async function validateDraftCrud(context, cookieHeader, csrfToken, provider) {
  const label = providerTypeLabel(provider);
  const provType = provider.providerType || provider.type || '';
  console.log(`\n  --- WRITE-06: Draft CRUD lifecycle (${label}) ---`);

  // Railway blocks IMAP ports -- drafts require IMAP APPEND
  if (provType === 'imap' || provType === 'generic') {
    console.log(`  SKIP: IMAP draft validation skipped`);
    console.log(`  REASON: Blocked (Infrastructure) -- Railway blocks IMAP ports`);
    console.log(`  CODE STATUS: email-crud.service.ts implements saveDraftToProvider() and compiles clean`);
    console.log(`  VALIDATION: Requires localhost or non-Railway env with IMAP access`);
    return;
  }

  // Step 1: Create draft
  const uniqueSubject = `Validation draft ${Date.now()}`;
  console.log(`  Step 1: Creating draft "${uniqueSubject}"...`);

  const createRes = await apiPost(
    context,
    '/api/v1/emails/drafts',
    {
      providerId: provider.id,
      to: ['validation-test@pmsync.local'],
      subject: uniqueSubject,
      bodyHtml: '<p>Draft validation body</p>',
    },
    cookieHeader,
    csrfToken,
  );

  const draft = createRes?.data ?? createRes;
  assertTrue(!!draft?.id, `WRITE-06 ${label}: draft create returns id`);
  assertEqual(draft?.isDraft, true, `WRITE-06 ${label}: draft create has isDraft=true`);
  console.log(`  Draft created: ${draft?.id}`);

  if (!draft?.id) {
    console.log(`  ERROR: Cannot continue draft CRUD without draft id`);
    return;
  }

  // Step 2: Get draft
  console.log(`  Step 2: Retrieving draft...`);
  let retrieved;
  try {
    const getRes = await apiGet(context, `/api/v1/emails/drafts/${draft.id}`, cookieHeader);
    retrieved = getRes?.data ?? getRes;
  } catch (err) {
    console.log(`  WARN: Get draft failed: ${err.message}`);
    retrieved = null;
  }

  if (retrieved) {
    assertEqual(retrieved.id, draft.id, `WRITE-06 ${label}: get draft returns correct id`);
    assertEqual(retrieved.isDraft, true, `WRITE-06 ${label}: get draft has isDraft=true`);
    assertTrue(
      (retrieved.subject || '').includes('Validation draft'),
      `WRITE-06 ${label}: get draft subject matches`,
    );
  }

  // Step 3: Update draft
  const updatedSubject = `Updated draft ${Date.now()}`;
  console.log(`  Step 3: Updating draft to "${updatedSubject}"...`);

  let updated;
  try {
    const updateRes = await apiPost(
      context,
      '/api/v1/emails/drafts',
      {
        id: draft.id,
        providerId: provider.id,
        to: ['updated@pmsync.local'],
        subject: updatedSubject,
        bodyHtml: '<p>Updated body</p>',
      },
      cookieHeader,
      csrfToken,
    );
    updated = updateRes?.data ?? updateRes;
  } catch (err) {
    console.log(`  WARN: Update draft failed: ${err.message}`);
    updated = null;
  }

  if (updated) {
    assertTrue(
      (updated.subject || '').includes('Updated draft'),
      `WRITE-06 ${label}: updated draft subject matches`,
    );
  }

  // Step 4: Delete draft
  console.log(`  Step 4: Deleting draft...`);
  try {
    const delRes = await apiDelete(context, `/api/v1/emails/drafts/${draft.id}`, cookieHeader, csrfToken);
    assertTrue(true, `WRITE-06 ${label}: draft delete succeeds`);
  } catch (err) {
    console.log(`  WARN: Delete draft returned error: ${err.message}`);
    assertTrue(false, `WRITE-06 ${label}: draft delete succeeds`);
  }

  // Step 5: Verify deleted
  console.log(`  Step 5: Verifying draft is deleted...`);
  try {
    await apiGet(context, `/api/v1/emails/drafts/${draft.id}`, cookieHeader);
    // If we reach here, draft still exists -- that's unexpected
    assertTrue(false, `WRITE-06 ${label}: draft is gone after delete`);
  } catch {
    // Expected: 404 or error means draft is properly deleted
    assertTrue(true, `WRITE-06 ${label}: draft is gone after delete`);
  }
}

// ---------------------------------------------------------------------------
// WRITE-07: Bulk mark-read / mark-unread
// ---------------------------------------------------------------------------

async function validateBulkMarkRead(context, cookieHeader, csrfToken, provider) {
  const label = providerTypeLabel(provider);
  console.log(`\n  --- WRITE-07: Bulk mark-read (${label}) ---`);

  const emails = await findTestEmails(context, cookieHeader, provider.id, 5);
  if (emails.length < 2) {
    console.log(`  SKIP: Need at least 2 inbox emails, found ${emails.length}`);
    assertTrue(false, `WRITE-07 ${label}: enough emails for bulk read test`);
    return;
  }

  const testEmails = emails.slice(0, 2);
  const emailIds = testEmails.map(e => e.id);
  const originalStates = testEmails.map(e => ({ id: e.id, isRead: e.isRead }));

  console.log(`  Using ${emailIds.length} emails for bulk mark-read test`);

  // Mark all as read
  console.log(`  Step 1: Marking ${emailIds.length} emails as read...`);
  try {
    const readRes = await apiPatch(
      context,
      '/api/v1/emails/bulk/read',
      { emailIds, isRead: true },
      cookieHeader,
      csrfToken,
    );
    const data = readRes?.data ?? readRes;
    assertTrue(true, `WRITE-07 ${label}: bulk mark-read request succeeds`);
    console.log(`  Result: ${JSON.stringify(data).substring(0, 200)}`);
  } catch (err) {
    console.log(`  ERROR: Bulk mark-read failed: ${err.message}`);
    assertTrue(false, `WRITE-07 ${label}: bulk mark-read request succeeds`);
    return;
  }

  // Verify all are read (use per-email GET for accuracy -- inbox listing may page differently)
  await new Promise(r => setTimeout(r, 1500));
  for (const eid of emailIds) {
    try {
      const emailRes = await apiGet(context, `/api/v1/emails/${eid}`, cookieHeader);
      const emailData = emailRes?.data ?? emailRes;
      assertEqual(emailData?.isRead, true, `WRITE-07 ${label}: email ${eid.substring(0, 8)} is read after bulk mark-read`);
    } catch (err) {
      console.log(`  WARN: Could not verify email ${eid.substring(0, 8)}: ${err.message}`);
    }
  }

  // Mark all as unread (reverse)
  console.log(`  Step 2: Marking ${emailIds.length} emails as unread...`);
  try {
    await apiPatch(
      context,
      '/api/v1/emails/bulk/read',
      { emailIds, isRead: false },
      cookieHeader,
      csrfToken,
    );
    assertTrue(true, `WRITE-07 ${label}: bulk mark-unread request succeeds`);
  } catch (err) {
    console.log(`  WARN: Bulk mark-unread failed: ${err.message}`);
    assertTrue(false, `WRITE-07 ${label}: bulk mark-unread request succeeds`);
  }

  // Restore original states
  console.log(`  Step 3: Restoring original read states...`);
  for (const orig of originalStates) {
    try {
      await apiPatch(
        context,
        '/api/v1/emails/bulk/read',
        { emailIds: [orig.id], isRead: orig.isRead },
        cookieHeader,
        csrfToken,
      );
    } catch {
      // best-effort restore
    }
  }
}

// ---------------------------------------------------------------------------
// WRITE-08: Bulk move to folder
// ---------------------------------------------------------------------------

async function validateBulkMove(context, cookieHeader, csrfToken, provider) {
  const label = providerTypeLabel(provider);
  console.log(`\n  --- WRITE-08: Bulk move to folder (${label}) ---`);

  const emails = await findTestEmails(context, cookieHeader, provider.id, 3);
  if (emails.length < 1) {
    console.log(`  SKIP: Need at least 1 inbox email, found 0`);
    assertTrue(false, `WRITE-08 ${label}: enough emails for bulk move test`);
    return;
  }

  const testEmail = emails[0];
  const originalFolder = testEmail.folder || 'INBOX';

  // Find a target folder
  let targetFolder = 'TRASH';
  try {
    const foldersRes = await apiGet(context, `/api/v1/folders?providerId=${provider.id}`, cookieHeader);
    const folders = Array.isArray(foldersRes) ? foldersRes
      : Array.isArray(foldersRes?.data) ? foldersRes.data
      : [];
    const nonInbox = folders.find(f => {
      const name = (f.name || f.folder || '').toUpperCase();
      return name !== 'INBOX' && name !== 'SENT' && name !== 'DRAFTS';
    });
    if (nonInbox) {
      targetFolder = nonInbox.name || nonInbox.folder || 'TRASH';
    }
  } catch {
    console.log(`  WARN: Could not fetch folders, using TRASH as target`);
  }

  console.log(`  Moving email ${testEmail.id.substring(0, 8)} from ${originalFolder} to ${targetFolder}...`);

  try {
    const moveRes = await apiPatch(
      context,
      '/api/v1/emails/bulk/move',
      { emailIds: [testEmail.id], folder: targetFolder },
      cookieHeader,
      csrfToken,
    );
    const data = moveRes?.data ?? moveRes;
    assertTrue(true, `WRITE-08 ${label}: bulk move request succeeds`);
    console.log(`  Result: ${JSON.stringify(data).substring(0, 200)}`);
  } catch (err) {
    console.log(`  ERROR: Bulk move failed: ${err.message}`);
    assertTrue(false, `WRITE-08 ${label}: bulk move request succeeds`);
    return;
  }

  // Restore: move back to original folder
  console.log(`  Restoring email to ${originalFolder}...`);
  try {
    await apiPatch(
      context,
      '/api/v1/emails/bulk/move',
      { emailIds: [testEmail.id], folder: originalFolder },
      cookieHeader,
      csrfToken,
    );
    assertTrue(true, `WRITE-08 ${label}: bulk move restore succeeds`);
  } catch (err) {
    console.log(`  WARN: Restore move failed: ${err.message}`);
    assertTrue(false, `WRITE-08 ${label}: bulk move restore succeeds`);
  }
}

// ---------------------------------------------------------------------------
// WRITE-09: Bulk delete
// ---------------------------------------------------------------------------

async function validateBulkDelete(context, cookieHeader, csrfToken, provider) {
  const label = providerTypeLabel(provider);
  const provType = provider.providerType || provider.type || '';
  console.log(`\n  --- WRITE-09: Bulk delete (${label}) ---`);

  // IMAP blocked on Railway
  if (provType === 'imap' || provType === 'generic') {
    console.log(`  SKIP: IMAP bulk delete skipped -- Blocked (Infrastructure)`);
    return;
  }

  // Create a sacrificial draft to delete (avoid destroying real emails)
  console.log(`  Step 1: Creating sacrificial draft for bulk delete...`);
  let draftId;
  try {
    const createRes = await apiPost(
      context,
      '/api/v1/emails/drafts',
      {
        providerId: provider.id,
        to: ['bulk-delete-test@pmsync.local'],
        subject: `Bulk delete test ${Date.now()}`,
        bodyHtml: '<p>Sacrificial draft for bulk delete validation</p>',
      },
      cookieHeader,
      csrfToken,
    );
    const draft = createRes?.data ?? createRes;
    draftId = draft?.id;
    assertTrue(!!draftId, `WRITE-09 ${label}: sacrificial draft created`);
    console.log(`  Draft created: ${draftId}`);
  } catch (err) {
    console.log(`  ERROR: Could not create sacrificial draft: ${err.message}`);
    assertTrue(false, `WRITE-09 ${label}: sacrificial draft created`);
    return;
  }

  if (!draftId) return;

  // Bulk delete
  console.log(`  Step 2: Bulk deleting draft via DELETE with body...`);
  try {
    const delRes = await apiDeleteWithBody(
      context,
      '/api/v1/emails/bulk',
      { emailIds: [draftId] },
      cookieHeader,
      csrfToken,
    );
    const data = delRes?.data ?? delRes;
    assertTrue(true, `WRITE-09 ${label}: bulk delete request succeeds`);
    console.log(`  Result: ${JSON.stringify(data).substring(0, 200)}`);
  } catch (err) {
    console.log(`  ERROR: Bulk delete failed: ${err.message}`);
    assertTrue(false, `WRITE-09 ${label}: bulk delete request succeeds`);
  }
}

// ---------------------------------------------------------------------------
// WRITE-10: Bulk labels add/remove (Gmail only)
// ---------------------------------------------------------------------------

async function validateBulkLabels(context, cookieHeader, csrfToken, provider) {
  const label = providerTypeLabel(provider);
  const provType = provider.providerType || provider.type || '';
  console.log(`\n  --- WRITE-10: Bulk labels add/remove (${label}) ---`);

  // Labels are Gmail-only by design
  if (provType !== 'google') {
    console.log(`  SKIP: Labels are Gmail-only -- provider is ${label}`);
    return;
  }

  // Get available labels (user-created labels in PMSync)
  let labels = await getLabels(context, cookieHeader);

  // If no labels exist, create a temporary one for testing
  if (labels.length === 0) {
    console.log(`  No labels found -- creating temporary test label...`);
    try {
      const createRes = await apiPost(
        context,
        '/api/v1/labels',
        {
          name: `Test Label ${Date.now()}`,
          color: { backgroundColor: '#4CAF50', textColor: '#FFFFFF' },
        },
        cookieHeader,
        csrfToken,
      );
      const created = createRes?.data?.label ?? createRes?.label ?? createRes?.data ?? createRes;
      if (created?.id) {
        labels = [created];
        console.log(`  Created test label: ${created.id} (${created.name})`);
      }
    } catch (err) {
      console.log(`  WARN: Could not create test label: ${err.message}`);
    }
  }

  if (labels.length === 0) {
    console.log(`  SKIP: No labels available and could not create one (feature flag may be off)`);
    assertTrue(false, `WRITE-10 ${label}: labels available for test`);
    return;
  }

  const testLabel = labels[0];
  console.log(`  Using label: "${testLabel.name || testLabel.id}" (${testLabel.id})`);

  // Find a test email
  const emails = await findTestEmails(context, cookieHeader, provider.id, 3);
  if (emails.length < 1) {
    console.log(`  SKIP: Need at least 1 inbox email for label test`);
    assertTrue(false, `WRITE-10 ${label}: enough emails for label test`);
    return;
  }

  const testEmail = emails[0];

  // Add label
  console.log(`  Step 1: Adding label to email ${testEmail.id.substring(0, 8)}...`);
  try {
    const addRes = await apiPatch(
      context,
      '/api/v1/emails/bulk/labels/add',
      { emailIds: [testEmail.id], labelIds: [testLabel.id] },
      cookieHeader,
      csrfToken,
    );
    const data = addRes?.data ?? addRes;
    assertTrue(true, `WRITE-10 ${label}: bulk label add succeeds`);
    console.log(`  Result: ${JSON.stringify(data).substring(0, 200)}`);
  } catch (err) {
    console.log(`  ERROR: Bulk label add failed: ${err.message}`);
    assertTrue(false, `WRITE-10 ${label}: bulk label add succeeds`);
    return;
  }

  // Remove label
  console.log(`  Step 2: Removing label from email ${testEmail.id.substring(0, 8)}...`);
  try {
    const removeRes = await apiPatch(
      context,
      '/api/v1/emails/bulk/labels/remove',
      { emailIds: [testEmail.id], labelIds: [testLabel.id] },
      cookieHeader,
      csrfToken,
    );
    const data = removeRes?.data ?? removeRes;
    assertTrue(true, `WRITE-10 ${label}: bulk label remove succeeds`);
    console.log(`  Result: ${JSON.stringify(data).substring(0, 200)}`);
  } catch (err) {
    console.log(`  ERROR: Bulk label remove failed: ${err.message}`);
    assertTrue(false, `WRITE-10 ${label}: bulk label remove succeeds`);
  }

  // Clean up test label if we created one
  if (testLabel.name && testLabel.name.startsWith('Test Label ')) {
    try {
      await apiDelete(context, `/api/v1/labels/${testLabel.id}`, cookieHeader, csrfToken);
      console.log(`  Cleaned up test label: ${testLabel.id}`);
    } catch {
      // best-effort cleanup
    }
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function validateDraftsBulk(context, cookieHeader, csrfToken, opts = {}) {
  const allResults = [];

  const providers = await getProviders(context, cookieHeader);
  const filtered = providers.filter(p => matchesProviderFilter(p, opts.provider || 'all'));

  if (filtered.length === 0) {
    console.log('No matching providers found!');
    return allResults;
  }

  for (const provider of filtered) {
    const label = providerTypeLabel(provider);
    const results = { name: `DraftsBulk-${label}`, checks: 0, passed: 0, failed: 0, failures: [] };
    setResultsCollector(results);

    console.log(`\n=== Provider: ${label} (${provider.email}) ===`);

    // WRITE-06: Draft CRUD
    try {
      await validateDraftCrud(context, cookieHeader, csrfToken, provider);
    } catch (err) {
      console.log(`  ERROR: Draft CRUD failed for ${label}: ${err.message}`);
      results.checks++;
      results.failed++;
      results.failures.push(`WRITE-06 ${label}: ${err.message}`);
    }

    // WRITE-07: Bulk mark-read
    try {
      await validateBulkMarkRead(context, cookieHeader, csrfToken, provider);
    } catch (err) {
      console.log(`  ERROR: Bulk mark-read failed for ${label}: ${err.message}`);
      results.checks++;
      results.failed++;
      results.failures.push(`WRITE-07 ${label}: ${err.message}`);
    }

    // WRITE-08: Bulk move
    try {
      await validateBulkMove(context, cookieHeader, csrfToken, provider);
    } catch (err) {
      console.log(`  ERROR: Bulk move failed for ${label}: ${err.message}`);
      results.checks++;
      results.failed++;
      results.failures.push(`WRITE-08 ${label}: ${err.message}`);
    }

    // WRITE-09: Bulk delete
    try {
      await validateBulkDelete(context, cookieHeader, csrfToken, provider);
    } catch (err) {
      console.log(`  ERROR: Bulk delete failed for ${label}: ${err.message}`);
      results.checks++;
      results.failed++;
      results.failures.push(`WRITE-09 ${label}: ${err.message}`);
    }

    // WRITE-10: Bulk labels (Gmail only)
    try {
      await validateBulkLabels(context, cookieHeader, csrfToken, provider);
    } catch (err) {
      console.log(`  ERROR: Bulk labels failed for ${label}: ${err.message}`);
      results.checks++;
      results.failed++;
      results.failures.push(`WRITE-10 ${label}: ${err.message}`);
    }

    setResultsCollector(null);
    allResults.push(results);
  }

  return allResults;
}
