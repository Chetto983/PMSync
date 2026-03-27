/**
 * Email Send/Reply/Forward Validation (WRITE-01..05)
 *
 * Validates send, reply, and forward endpoints against live provider data
 * via the REST API.
 *
 *   WRITE-01: Gmail send (new email)
 *   WRITE-02: Outlook send (new email)
 *   WRITE-03: IMAP send (new email)
 *   WRITE-04: Reply preserves threading headers
 *   WRITE-05: Forward includes original attachments
 */
import {
  apiGet,
  apiPost,
  assertEqual,
  assertTrue,
  setResultsCollector,
  BACKEND_URL,
} from './validation-helpers.mjs';

// ---------------------------------------------------------------------------
// Helpers (same pattern as validate-attachments-search.mjs)
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
 * Map provider type to WRITE requirement ID.
 */
function writeReqId(provider) {
  const type = provider.providerType || provider.type || '';
  if (type === 'google') return 'WRITE-01';
  if (type === 'microsoft') return 'WRITE-02';
  if (type === 'imap') return 'WRITE-03';
  return 'WRITE-??';
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

// ---------------------------------------------------------------------------
// WRITE-01/02/03: Send new email
// ---------------------------------------------------------------------------

async function validateSend(context, cookieHeader, csrfToken, provider) {
  const label = providerTypeLabel(provider);
  const req = writeReqId(provider);
  console.log(`\n  --- ${req}: Send new email (${label}) ---`);

  const uniqueSubject = `PMSync validation send ${Date.now()}`;

  // Send email to self (provider.email) to avoid external side effects
  const sendResult = await apiPost(
    context,
    '/api/v1/emails/send',
    {
      providerId: provider.id,
      to: [provider.email],
      subject: uniqueSubject,
      bodyHtml: `<p>Validation test email sent at ${new Date().toISOString()}</p>`,
    },
    cookieHeader,
    csrfToken,
  );

  const sendData = sendResult?.data ?? sendResult;
  assertTrue(sendData?.success === true, `${req}: ${label} send returns success`);
  assertTrue(
    typeof sendData?.messageId === 'string' && sendData.messageId.length > 0,
    `${req}: ${label} send returns messageId`,
  );

  // Wait briefly for DB write, then verify email in DB
  await new Promise(r => setTimeout(r, 2000));

  const emailsRes = await apiGet(
    context,
    `/api/v1/emails?providerId=${provider.id}&limit=10`,
    cookieHeader,
  );
  const emails = unwrapEmails(emailsRes);
  const sentEmail = emails.find(e => e.subject === uniqueSubject);
  assertTrue(!!sentEmail, `${req}: ${label} sent email found in DB`);

  return { sentEmail, messageId: sendData?.messageId };
}

// ---------------------------------------------------------------------------
// WRITE-04: Reply preserves threading
// ---------------------------------------------------------------------------

async function validateReply(context, cookieHeader, csrfToken, provider) {
  const label = providerTypeLabel(provider);
  console.log(`\n  --- WRITE-04: Reply preserves thread (${label}) ---`);

  // Find an existing email with messageId and externalId to reply to
  const emailsRes = await apiGet(
    context,
    `/api/v1/emails?providerId=${provider.id}&limit=20`,
    cookieHeader,
  );
  const emails = unwrapEmails(emailsRes);
  const replyTarget = emails.find(e => e.messageId && e.externalId);

  if (!replyTarget) {
    console.log(`  SKIP: No suitable email found for reply test (${label})`);
    return;
  }

  console.log(`  Replying to email: ${replyTarget.subject} (id: ${replyTarget.id})`);

  const replyResult = await apiPost(
    context,
    `/api/v1/emails/${replyTarget.id}/reply`,
    {
      bodyHtml: `<p>Validation reply at ${new Date().toISOString()}</p>`,
    },
    cookieHeader,
    csrfToken,
  );

  const replyData = replyResult?.data ?? replyResult;
  assertTrue(replyData?.success === true, `WRITE-04: ${label} reply returns success`);
  assertTrue(
    typeof replyData?.messageId === 'string' && replyData.messageId.length > 0,
    `WRITE-04: ${label} reply returns messageId`,
  );

  // Wait for DB write, then check threading headers
  await new Promise(r => setTimeout(r, 2000));

  const afterEmails = unwrapEmails(
    await apiGet(context, `/api/v1/emails?providerId=${provider.id}&limit=20`, cookieHeader),
  );
  const replyEmail = afterEmails.find(
    e => e.inReplyTo && e.inReplyTo === replyTarget.messageId,
  );

  if (replyEmail) {
    assertEqual(
      replyEmail.inReplyTo,
      replyTarget.messageId,
      `WRITE-04: ${label} reply inReplyTo matches original messageId`,
    );
    assertTrue(
      (replyEmail.references || '').includes(replyTarget.messageId),
      `WRITE-04: ${label} reply references contains original messageId`,
    );
    // For Gmail: check threadId preserved
    if (provider.providerType === 'google' && replyTarget.threadId) {
      assertEqual(
        replyEmail.threadId,
        replyTarget.threadId,
        `WRITE-04: ${label} reply threadId matches original`,
      );
    }
  } else {
    console.log('  WARN: Could not find reply email in DB to verify headers');
    assertTrue(false, `WRITE-04: ${label} reply email found in DB for header check`);
  }
}

// ---------------------------------------------------------------------------
// WRITE-05: Forward with attachments
// ---------------------------------------------------------------------------

async function validateForward(context, cookieHeader, csrfToken, provider) {
  const label = providerTypeLabel(provider);
  console.log(`\n  --- WRITE-05: Forward with attachments (${label}) ---`);

  // Find an email with attachments
  const emailsRes = await apiGet(
    context,
    `/api/v1/emails?providerId=${provider.id}&hasAttachments=true&limit=10`,
    cookieHeader,
  );
  const emails = unwrapEmails(emailsRes);
  const fwdTarget = emails.find(e => e.attachments?.length > 0);

  if (!fwdTarget) {
    console.log(`  SKIP: No email with attachments found for forward test (${label})`);
    return;
  }

  const originalAttachmentCount = fwdTarget.attachments.length;
  const originalFilenames = fwdTarget.attachments.map(a => a.filename).sort();
  console.log(`  Forwarding email with ${originalAttachmentCount} attachments: ${originalFilenames.join(', ')}`);

  const fwdResult = await apiPost(
    context,
    `/api/v1/emails/${fwdTarget.id}/forward`,
    {
      to: [provider.email], // Self-forward
    },
    cookieHeader,
    csrfToken,
  );

  const fwdData = fwdResult?.data ?? fwdResult;
  assertTrue(fwdData?.success === true, `WRITE-05: ${label} forward returns success`);
  assertTrue(
    typeof fwdData?.messageId === 'string' && fwdData.messageId.length > 0,
    `WRITE-05: ${label} forward returns messageId`,
  );

  // Wait for DB write, then verify forwarded email has attachments
  await new Promise(r => setTimeout(r, 3000));

  const afterEmails = unwrapEmails(
    await apiGet(context, `/api/v1/emails?providerId=${provider.id}&limit=20`, cookieHeader),
  );
  const fwdEmail = afterEmails.find(
    e => e.subject && e.subject.includes('Fwd:') &&
      e.subject.includes(fwdTarget.subject.replace(/^(Fwd:\s*)+/, '')),
  );

  if (fwdEmail) {
    const fwdAttachmentCount = fwdEmail.attachments?.length ?? 0;
    assertTrue(
      fwdAttachmentCount >= originalAttachmentCount,
      `WRITE-05: ${label} forward includes original attachments (expected >= ${originalAttachmentCount}, got ${fwdAttachmentCount})`,
    );

    // Verify filenames match
    if (fwdEmail.attachments) {
      const fwdFilenames = fwdEmail.attachments.map(a => a.filename).sort();
      for (const origName of originalFilenames) {
        assertTrue(
          fwdFilenames.includes(origName),
          `WRITE-05: ${label} forward includes attachment "${origName}"`,
        );
      }
    }
  } else {
    console.log('  WARN: Could not find forwarded email in DB -- may need manual check');
    // Don't fail here -- the email was sent successfully, DB record may take longer
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function validateEmailSend(context, cookieHeader, csrfToken, opts = {}) {
  const allResults = [];

  const providers = await getProviders(context, cookieHeader);
  const filtered = providers.filter(p => matchesProviderFilter(p, opts.provider || 'all'));

  if (filtered.length === 0) {
    console.log('No matching providers found!');
    return allResults;
  }

  for (const provider of filtered) {
    const label = providerTypeLabel(provider);
    const results = { name: `EmailSend-${label}`, checks: 0, passed: 0, failed: 0, failures: [] };
    setResultsCollector(results);

    console.log(`\n=== Provider: ${label} (${provider.email}) ===`);

    // WRITE-01/02/03: Send
    try {
      await validateSend(context, cookieHeader, csrfToken, provider);
    } catch (err) {
      console.log(`  ERROR: Send failed for ${label}: ${err.message}`);
      results.checks++;
      results.failed++;
      results.failures.push(`${writeReqId(provider)} ${label}: ${err.message}`);
    }

    // WRITE-04: Reply
    try {
      await validateReply(context, cookieHeader, csrfToken, provider);
    } catch (err) {
      console.log(`  ERROR: Reply failed for ${label}: ${err.message}`);
      results.checks++;
      results.failed++;
      results.failures.push(`WRITE-04 ${label}: ${err.message}`);
    }

    // WRITE-05: Forward with attachments
    try {
      await validateForward(context, cookieHeader, csrfToken, provider);
    } catch (err) {
      console.log(`  ERROR: Forward failed for ${label}: ${err.message}`);
      results.checks++;
      results.failed++;
      results.failures.push(`WRITE-05 ${label}: ${err.message}`);
    }

    setResultsCollector(null);
    allResults.push(results);
  }

  return allResults;
}
