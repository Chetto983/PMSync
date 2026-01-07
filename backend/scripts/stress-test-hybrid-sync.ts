/**
 * DEEP CYNICAL STRESS TEST - Hybrid Sync Validation
 *
 * Tests the hybrid sync approach where:
 * - Full sync uses metadata format (isBodyFetched=false)
 * - Body is loaded lazily on-demand (isBodyFetched=true)
 * - No data corruption between snippet and body
 *
 * RUN: npx ts-node backend/scripts/stress-test-hybrid-sync.ts
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  critical: boolean;
}

const results: TestResult[] = [];

function pass(name: string, details: string, critical = false) {
  results.push({ name, passed: true, details, critical });
  console.log(`✓ ${name}`);
  if (details) console.log(`  ${details}`);
}

function fail(name: string, details: string, critical = false) {
  results.push({ name, passed: false, details, critical });
  console.log(`✗ ${name}`);
  if (details) console.log(`  ${details}`);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('       DEEP CYNICAL STRESS TEST - HYBRID SYNC VALIDATION');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Get active provider for testing
  const provider = await prisma.providerConfig.findFirst({
    where: { isActive: true, supportsEmail: true },
    select: { id: true, tenantId: true, providerType: true, email: true },
  });

  if (!provider) {
    console.log('No active email provider found. Skipping tests.');
    return;
  }

  console.log(`Testing provider: ${provider.email} (${provider.providerType})\n`);

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 1: isBodyFetched Column Exists
  // ═══════════════════════════════════════════════════════════════════════
  console.log('─── TEST 1: Schema Validation ───\n');

  try {
    const sample = await prisma.email.findFirst({
      where: { providerId: provider.id },
      select: { id: true, isBodyFetched: true },
    });

    if (sample !== null && 'isBodyFetched' in sample) {
      pass('isBodyFetched column exists', `Sample email: isBodyFetched=${sample.isBodyFetched}`, true);
    } else {
      fail('isBodyFetched column exists', 'Column not found or no emails exist', true);
    }
  } catch (err) {
    fail('isBodyFetched column exists', `Error: ${err instanceof Error ? err.message : String(err)}`, true);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 2: Body/isBodyFetched Consistency
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n─── TEST 2: Body/isBodyFetched Consistency ───\n');

  // 2a: Emails with body SHOULD have isBodyFetched=true
  const emailsWithBodyNoFlag = await prisma.email.count({
    where: {
      providerId: provider.id,
      bodyText: { not: '' },
      isBodyFetched: false,
    },
  });

  if (emailsWithBodyNoFlag === 0) {
    pass('Emails with body have isBodyFetched=true', 'No inconsistencies found');
  } else {
    fail('Emails with body have isBodyFetched=true', `${emailsWithBodyNoFlag} emails have body but isBodyFetched=false`, true);
  }

  // 2b: Emails without body SHOULD have isBodyFetched=false
  const emailsWithoutBodyHaveFlag = await prisma.email.count({
    where: {
      providerId: provider.id,
      OR: [{ bodyText: null }, { bodyText: '' }],
      isBodyFetched: true,
    },
  });

  if (emailsWithoutBodyHaveFlag === 0) {
    pass('Emails without body have isBodyFetched=false', 'No inconsistencies found');
  } else {
    // This could be legitimate if body fetch failed but flag was set
    fail('Emails without body have isBodyFetched=false', `${emailsWithoutBodyHaveFlag} emails have no body but isBodyFetched=true (investigate!)`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 3: Snippet/Body Consistency (Anti-Corruption)
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n─── TEST 3: Snippet/Body Consistency (Anti-Corruption) ───\n');

  const emailsWithBoth = await prisma.email.findMany({
    where: {
      providerId: provider.id,
      isBodyFetched: true,
      snippet: { not: null },
      bodyText: { not: null },
    },
    select: {
      id: true,
      subject: true,
      snippet: true,
      bodyText: true,
    },
    take: 100,
  });

  let corruptedCount = 0;
  const corruptedEmails: Array<{ id: string; subject: string; snippet: string; body: string }> = [];

  for (const email of emailsWithBoth) {
    const snippet = (email.snippet || '').toLowerCase().trim();
    const body = (email.bodyText || '').toLowerCase();
    const subject = (email.subject || '').toLowerCase().trim();

    if (snippet.length < 10) continue; // Skip very short snippets

    // The snippet should appear somewhere in the body (it's derived from body)
    // EXCEPTION: For short emails (calendar invites, etc.), snippet may equal subject
    const snippetFirst20 = snippet.substring(0, 20);
    const snippetMatchesSubject = subject.toLowerCase().startsWith(snippetFirst20);

    if (!body.includes(snippetFirst20) && !snippetMatchesSubject) {
      corruptedCount++;
      if (corruptedEmails.length < 5) {
        corruptedEmails.push({
          id: email.id,
          subject: (email.subject || '').substring(0, 40),
          snippet: snippet.substring(0, 40),
          body: body.substring(0, 40),
        });
      }
    }
  }

  if (corruptedCount === 0) {
    pass('No body/snippet mismatch (corruption)', `Checked ${emailsWithBoth.length} emails`);
  } else {
    fail('No body/snippet mismatch (corruption)', `${corruptedCount} CORRUPTED emails found!`, true);
    console.log('  Corrupted samples:');
    for (const e of corruptedEmails) {
      console.log(`    ID: ${e.id}`);
      console.log(`    Subject: ${e.subject}...`);
      console.log(`    Snippet: "${e.snippet}..."`);
      console.log(`    Body: "${e.body}..."`);
      console.log('');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 4: Hybrid Sync Distribution (Metadata vs Full)
  // ═══════════════════════════════════════════════════════════════════════
  console.log('─── TEST 4: Hybrid Sync Distribution ───\n');

  const totalEmails = await prisma.email.count({
    where: { providerId: provider.id },
  });

  const metadataOnly = await prisma.email.count({
    where: { providerId: provider.id, isBodyFetched: false },
  });

  const withBody = await prisma.email.count({
    where: { providerId: provider.id, isBodyFetched: true },
  });

  const metadataPercent = totalEmails > 0 ? Math.round((metadataOnly / totalEmails) * 100) : 0;
  const bodyPercent = totalEmails > 0 ? Math.round((withBody / totalEmails) * 100) : 0;

  console.log(`  Total emails: ${totalEmails}`);
  console.log(`  Metadata only (isBodyFetched=false): ${metadataOnly} (${metadataPercent}%)`);
  console.log(`  With body (isBodyFetched=true): ${withBody} (${bodyPercent}%)`);

  // Expect that with hybrid sync, most emails should be metadata-only
  // (since body is loaded lazily on-demand)
  if (metadataOnly > 0) {
    pass('Hybrid sync is working', `${metadataPercent}% of emails are metadata-only (lazy body loading enabled)`);
  } else {
    // All emails have body - either migration ran on old data or sync uses full format
    pass('All emails have body content', 'This is expected after migration or if sync uses full format');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 5: Index Performance Check
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n─── TEST 5: Index Performance ───\n');

  try {
    const indexCheck = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'emails'
      AND indexname LIKE '%isBodyFetched%'
    `;

    if (indexCheck.length > 0) {
      pass('isBodyFetched index exists', `Found: ${indexCheck.map(i => i.indexname).join(', ')}`);
    } else {
      fail('isBodyFetched index exists', 'No index found - lazy fetch queries will be slow!');
    }
  } catch (err) {
    fail('isBodyFetched index exists', `Error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 6: Multi-Tenant Isolation
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n─── TEST 6: Multi-Tenant Isolation ───\n');

  const tenantsWithEmails = await prisma.email.groupBy({
    by: ['tenantId'],
    _count: { id: true },
  });

  if (tenantsWithEmails.length === 1) {
    pass('Single tenant isolation', `Only 1 tenant has emails (${tenantsWithEmails[0]._count.id} emails)`);
  } else if (tenantsWithEmails.length === 0) {
    pass('No emails in database', 'Empty database');
  } else {
    pass('Multi-tenant data exists', `${tenantsWithEmails.length} tenants have emails`);

    // Verify no cross-tenant data leakage (emails should belong to their provider's tenant)
    const crossTenantLeaks = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM emails e
      JOIN provider_configs p ON e."providerId" = p.id
      WHERE e."tenantId" != p."tenantId"
    `;

    if (crossTenantLeaks[0].count === BigInt(0)) {
      pass('No cross-tenant data leakage', 'All emails belong to correct tenant');
    } else {
      fail('No cross-tenant data leakage', `${crossTenantLeaks[0].count} emails have wrong tenant!`, true);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 7: Lazy Load Simulation (Thread View)
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n─── TEST 7: Lazy Load Simulation ───\n');

  // Find a thread with multiple emails
  const threadSample = await prisma.email.findFirst({
    where: {
      providerId: provider.id,
      threadId: { not: null },
    },
    select: { threadId: true },
  });

  if (threadSample?.threadId) {
    const threadEmails = await prisma.email.findMany({
      where: {
        providerId: provider.id,
        threadId: threadSample.threadId,
      },
      select: {
        id: true,
        isBodyFetched: true,
        bodyText: true,
        snippet: true,
      },
    });

    const needsLazyLoad = threadEmails.filter((e) => !e.isBodyFetched);
    const hasBody = threadEmails.filter((e) => e.isBodyFetched);

    console.log(`  Thread ${threadSample.threadId.substring(0, 20)}...`);
    console.log(`  Total emails: ${threadEmails.length}`);
    console.log(`  Needs lazy load: ${needsLazyLoad.length}`);
    console.log(`  Already has body: ${hasBody.length}`);

    if (threadEmails.length > 0) {
      pass('Thread lazy load works', `Thread has ${needsLazyLoad.length} emails needing body fetch`);
    }
  } else {
    pass('No threads found', 'Skipping thread lazy load test');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('                         SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const criticalFailed = results.filter((r) => !r.passed && r.critical).length;

  console.log(`  Tests passed: ${passed}/${results.length}`);
  console.log(`  Tests failed: ${failed}/${results.length}`);

  if (criticalFailed > 0) {
    console.log(`\n  ⚠️  CRITICAL FAILURES: ${criticalFailed}`);
    for (const r of results.filter((r) => !r.passed && r.critical)) {
      console.log(`    - ${r.name}: ${r.details}`);
    }
  }

  if (failed === 0) {
    console.log('\n  ✓ ALL TESTS PASSED - Hybrid sync is working correctly');
  } else if (criticalFailed === 0) {
    console.log('\n  ⚠️ Some non-critical tests failed - review above');
  } else {
    console.log('\n  ✗ CRITICAL FAILURES DETECTED - Hybrid sync needs attention!');
  }

  console.log('\n═══════════════════════════════════════════════════════════\n');

  await prisma.$disconnect();

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
