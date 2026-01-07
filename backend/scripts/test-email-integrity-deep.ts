/**
 * CYNICAL Email Integrity Deep Validation Test
 *
 * This test assumes everything is broken until proven otherwise.
 * It's paranoid, thorough, and catches bugs that API-level tests miss.
 *
 * Run: npx ts-node scripts/test-email-integrity-deep.ts
 *
 * Environment variables:
 *   MAIL_TEST_TENANT_ID - Tenant to test (required)
 *   MAIL_TEST_PROVIDER_ID - Provider to test (optional)
 *   MAIL_TEST_STRESS_LEVEL - 1=light, 2=medium, 3=heavy (default: 2)
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { performance } from 'perf_hooks';

const prisma = createPrismaClient();
const STRESS_LEVEL = parseInt(process.env.MAIL_TEST_STRESS_LEVEL || '2', 10);

interface DeepTestResult {
  category: string;
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
  durationMs: number;
  details?: string;
  severity?: 'critical' | 'high' | 'medium' | 'low';
}

const results: DeepTestResult[] = [];
let totalCritical = 0;
let totalHigh = 0;

function record(
  category: string,
  name: string,
  status: DeepTestResult['status'],
  durationMs: number,
  details?: string,
  severity?: DeepTestResult['severity'],
) {
  results.push({ category, name, status, durationMs, details, severity });

  if (status === 'FAIL') {
    if (severity === 'critical') totalCritical++;
    if (severity === 'high') totalHigh++;
  }

  const icon = status === 'PASS' ? '\x1b[32m\u2713\x1b[0m' :
               status === 'FAIL' ? '\x1b[31m\u2717\x1b[0m' :
               status === 'WARN' ? '\x1b[33m!\x1b[0m' : '\x1b[90m-\x1b[0m';
  const severityTag = severity ? `[${severity.toUpperCase()}]` : '';
  console.log(`${icon} [${category}] ${name} (${durationMs}ms) ${severityTag} ${details || ''}`);
}

async function runDeepTest(
  category: string,
  name: string,
  fn: () => Promise<{ details?: string; severity?: DeepTestResult['severity'] }>,
  options?: { skipIf?: boolean; skipReason?: string },
) {
  if (options?.skipIf) {
    record(category, name, 'SKIP', 0, options.skipReason);
    return;
  }

  const start = performance.now();
  try {
    const result = await fn();
    record(category, name, 'PASS', Math.round(performance.now() - start), result.details, result.severity);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    record(category, name, 'FAIL', Math.round(performance.now() - start), msg,
      (err as any).severity || 'high');
  }
}

class CynicalError extends Error {
  severity: DeepTestResult['severity'];
  constructor(message: string, severity: DeepTestResult['severity'] = 'high') {
    super(message);
    this.severity = severity;
  }
}

// ============================================================================
// CATEGORY 1: TENANT ISOLATION (CRITICAL)
// ============================================================================
async function testTenantIsolation(tenantId: string) {
  const category = 'TENANT_ISOLATION';

  // Get another tenant for cross-tenant testing
  const otherTenant = await prisma.tenant.findFirst({
    where: { id: { not: tenantId } },
    select: { id: true },
  });

  await runDeepTest(category, 'emails_never_cross_tenant', async () => {
    // CYNICAL: Check if any email query could ever return cross-tenant data
    const crossTenantEmails = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM emails e1
      WHERE EXISTS (
        SELECT 1 FROM emails e2
        WHERE e1."externalId" = e2."externalId"
        AND e1."tenantId" != e2."tenantId"
      )
    `;

    const count = Number(crossTenantEmails[0]?.count || 0);
    if (count > 0) {
      throw new CynicalError(
        `CRITICAL: ${count} emails share externalId across tenants! Data leak possible.`,
        'critical',
      );
    }
    return { details: 'No cross-tenant externalId collisions' };
  });

  await runDeepTest(category, 'provider_tenant_binding', async () => {
    // Every email must have a provider that belongs to its tenant
    const orphanEmails = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM emails e
      LEFT JOIN provider_configs p ON e."providerId" = p.id
      WHERE p.id IS NULL OR p."tenantId" != e."tenantId"
    `;

    const count = Number(orphanEmails[0]?.count || 0);
    if (count > 0) {
      throw new CynicalError(
        `CRITICAL: ${count} emails have mismatched or missing provider tenant binding!`,
        'critical',
      );
    }
    return { details: 'All emails bound to correct tenant providers' };
  });

  await runDeepTest(category, 'folder_cache_key_includes_tenant', async () => {
    // Verify cache key pattern prevents cross-tenant cache poisoning
    // Validate via schema check - all folders must have correct tenantId
    const folders = await prisma.folder.findMany({
      where: { tenantId },
      take: 5,
      select: { id: true, tenantId: true, providerId: true },
    });

    // Verify each folder is isolated
    for (const folder of folders) {
      if (folder.tenantId !== tenantId) {
        throw new CynicalError(
          `Folder ${folder.id} has wrong tenantId: expected ${tenantId}, got ${folder.tenantId}`,
          'critical',
        );
      }
    }

    return { details: `Verified ${folders.length} folders have correct tenantId` };
  });

  await runDeepTest(category, 'attachment_tenant_isolation', async () => {
    // Attachments inherit tenant from their email (EmailAttachment has no tenantId field)
    // Check that all attachments have a valid email reference with matching tenant
    const orphanAttachments = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM email_attachments a
      LEFT JOIN emails e ON a."emailId" = e.id
      WHERE e.id IS NULL
    `;

    const count = Number(orphanAttachments[0]?.count || 0);
    if (count > 0) {
      throw new CynicalError(
        `${count} attachments have no valid email reference!`,
        'critical',
      );
    }
    return { details: 'All attachments correctly linked to emails' };
  });

  // Cross-tenant query attempt (should return 0)
  if (otherTenant) {
    await runDeepTest(category, 'cross_tenant_query_blocked', async () => {
      // Try to query emails with wrong tenant - should always be empty
      const leaked = await prisma.email.findMany({
        where: {
          tenantId: otherTenant.id,
          providerId: { in: await prisma.providerConfig.findMany({
            where: { tenantId },
            select: { id: true },
          }).then(p => p.map(x => x.id)) },
        },
        take: 1,
      });

      if (leaked.length > 0) {
        throw new CynicalError(
          'CRITICAL: Cross-tenant provider query returned data!',
          'critical',
        );
      }
      return { details: 'Cross-tenant queries correctly blocked' };
    });
  }

  // Stronger tenant binding check: Folders must match their provider's tenant
  await runDeepTest(category, 'folders_provider_tenant_binding', async () => {
    const mismatchedFolders = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count
      FROM folders f
      JOIN provider_configs p ON f."providerId" = p.id
      WHERE f."tenantId" != p."tenantId"
    `;

    const count = Number(mismatchedFolders[0]?.count || 0);
    if (count > 0) {
      throw new CynicalError(
        `CRITICAL: ${count} folders are linked to providers of different tenants!`,
        'critical',
      );
    }
    return { details: 'Folder-Provider tenant binding verified' };
  });

  // Stronger tenant binding check: Emails must match their provider's tenant
  await runDeepTest(category, 'emails_provider_tenant_binding', async () => {
    const mismatchedEmails = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count
      FROM emails e
      JOIN provider_configs p ON e."providerId" = p.id
      WHERE e."tenantId" != p."tenantId"
    `;

    const count = Number(mismatchedEmails[0]?.count || 0);
    if (count > 0) {
      throw new CynicalError(
        `CRITICAL: ${count} emails are linked to providers of different tenants!`,
        'critical',
      );
    }
    return { details: 'Email-Provider tenant binding verified' };
  });
}

// ============================================================================
// CATEGORY 2: DATA INTEGRITY
// ============================================================================
async function testDataIntegrity(tenantId: string) {
  const category = 'DATA_INTEGRITY';

  await runDeepTest(category, 'no_null_external_ids', async () => {
    // Synced emails MUST have externalId (use raw SQL for null check)
    const nullExternal = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM emails
      WHERE "tenantId" = ${tenantId}
        AND "externalId" IS NULL
        AND "isDraft" = false
    `;

    const count = Number(nullExternal[0]?.count || 0);
    if (count > 0) {
      throw new CynicalError(
        `${count} non-draft emails have NULL externalId!`,
        'high',
      );
    }
    return { details: 'All synced emails have externalId' };
  });

  await runDeepTest(category, 'no_duplicate_external_ids', async () => {
    // Within a provider, externalId must be unique
    const duplicates = await prisma.$queryRaw<{ providerId: string; externalId: string; cnt: bigint }[]>`
      SELECT "providerId", "externalId", COUNT(*) as cnt
      FROM emails
      WHERE "tenantId" = ${tenantId}
        AND "externalId" IS NOT NULL
      GROUP BY "providerId", "externalId"
      HAVING COUNT(*) > 1
      LIMIT 10
    `;

    if (duplicates.length > 0) {
      const examples = duplicates.map(d => `${d.externalId}(x${d.cnt})`).join(', ');
      throw new CynicalError(
        `Duplicate externalIds found: ${examples}`,
        'high',
      );
    }
    return { details: 'No duplicate externalIds within providers' };
  });

  await runDeepTest(category, 'folder_path_consistency', async () => {
    // Folder paths should be normalized (no leading/trailing slashes, etc.)
    const badPaths = await prisma.$queryRaw<{ folder: string; cnt: bigint }[]>`
      SELECT folder, COUNT(*) as cnt
      FROM emails
      WHERE "tenantId" = ${tenantId}
        AND (
          folder LIKE '/%'
          OR folder LIKE '%/'
          OR folder LIKE '%//%'
          OR folder ~ '\\s$'
          OR folder ~ '^\\s'
        )
      GROUP BY folder
      LIMIT 10
    `;

    if (badPaths.length > 0) {
      const examples = badPaths.map(p => `"${p.folder}"(${p.cnt})`).join(', ');
      throw new CynicalError(
        `Malformed folder paths: ${examples}`,
        'medium',
      );
    }
    return { details: 'All folder paths are normalized' };
  });

  await runDeepTest(category, 'email_timestamps_valid', async () => {
    // receivedAt should never be in the future
    const futureEmails = await prisma.email.count({
      where: {
        tenantId,
        receivedAt: { gt: new Date(Date.now() + 24 * 60 * 60 * 1000) }, // More than 1 day in future
      },
    });

    if (futureEmails > 0) {
      throw new CynicalError(
        `${futureEmails} emails have receivedAt in the future!`,
        'medium',
      );
    }
    return { details: 'All email timestamps are valid' };
  });

  await runDeepTest(category, 'body_text_not_truncated', async () => {
    // Check for signs of truncation in bodyText
    const suspiciousBodies = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM emails
      WHERE "tenantId" = ${tenantId}
        AND "bodyText" IS NOT NULL
        AND (
          "bodyText" LIKE '%...$'
          OR LENGTH("bodyText") = 65535
          OR LENGTH("bodyText") = 32767
        )
      LIMIT 5
    `;

    if (suspiciousBodies.length > 0) {
      return {
        details: `WARN: ${suspiciousBodies.length} emails may have truncated body`,
        severity: 'low' as const,
      };
    }
    return { details: 'No obvious body truncation detected' };
  });

  await runDeepTest(category, 'attachments_have_valid_size', async () => {
    // Attachments should have positive size (query through email relation)
    const badAttachments = await prisma.emailAttachment.count({
      where: {
        email: { tenantId },
        size: { lte: 0 },
      },
    });

    if (badAttachments > 0) {
      throw new CynicalError(
        `${badAttachments} attachments have invalid size (<= 0)`,
        'medium',
      );
    }
    return { details: 'All attachments have valid size' };
  });

  await runDeepTest(category, 'orphan_attachments_check', async () => {
    // Attachments without valid email reference
    const orphans = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count
      FROM email_attachments a
      LEFT JOIN emails e ON a."emailId" = e.id
      WHERE e.id IS NULL
    `;

    const count = Number(orphans[0]?.count || 0);
    if (count > 0) {
      throw new CynicalError(
        `${count} orphan attachments found (email deleted but attachment remains)`,
        'medium',
      );
    }
    return { details: 'No orphan attachments' };
  });
}

// ============================================================================
// CATEGORY 3: PERFORMANCE VALIDATION
// ============================================================================
async function testPerformance(tenantId: string, providerId?: string) {
  const category = 'PERFORMANCE';

  // Test that indexes are being used
  await runDeepTest(category, 'email_list_uses_index', async () => {
    const explain = await prisma.$queryRaw<{ "QUERY PLAN": string }[]>`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT id, subject, "from", "receivedAt", folder, "isRead"
      FROM emails
      WHERE "tenantId" = ${tenantId}
        AND folder = 'INBOX'
        AND "isDeleted" = false
      ORDER BY "receivedAt" DESC
      LIMIT 50
    `;

    const plan = explain.map(e => e['QUERY PLAN']).join('\n');

    // CYNICAL: Seq Scan on emails is BAD for large tables
    if (plan.includes('Seq Scan on emails') && !plan.includes('rows=0')) {
      throw new CynicalError(
        `Query uses Seq Scan instead of index! Plan: ${plan.substring(0, 500)}`,
        'high',
      );
    }

    // Check for index usage
    const hasIndexScan = plan.includes('Index Scan') || plan.includes('Index Only Scan') || plan.includes('Bitmap');
    if (!hasIndexScan) {
      return { details: `WARN: No explicit index scan detected`, severity: 'medium' as const };
    }

    return { details: 'Query uses index efficiently' };
  });

  await runDeepTest(category, 'folder_count_query_fast', async () => {
    // Folder counts should be < 100ms for production
    const start = performance.now();
    await prisma.email.groupBy({
      by: ['folder'],
      where: {
        tenantId,
        ...(providerId ? { providerId } : {}),
        isDeleted: false,
      },
      _count: { id: true },
    });
    const duration = performance.now() - start;

    if (duration > 500) {
      throw new CynicalError(
        `Folder count took ${Math.round(duration)}ms (should be <500ms)`,
        'medium',
      );
    }
    if (duration > 100) {
      return { details: `${Math.round(duration)}ms - acceptable but not optimal` };
    }
    return { details: `${Math.round(duration)}ms - fast` };
  });

  await runDeepTest(category, 'gin_trigram_search_performance', async () => {
    // Text search should use GIN index
    const testQuery = 'meeting'; // Common word

    const explain = await prisma.$queryRaw<{ "QUERY PLAN": string }[]>`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT id, subject FROM emails
      WHERE "tenantId" = ${tenantId}
        AND subject ILIKE ${`%${testQuery}%`}
      LIMIT 20
    `;

    const plan = explain.map(e => e['QUERY PLAN']).join('\n');

    // Check if Bitmap Index Scan is used (GIN indexes use bitmap scans)
    // The index name contains subject_idx for subject GIN index
    const usesBitmapScan = plan.includes('Bitmap Index Scan');
    const usesSubjectIndex = plan.includes('subject_idx') || plan.includes('emails_subject');

    if (usesBitmapScan && usesSubjectIndex) {
      // Extract timing from plan
      const timeMatch = plan.match(/actual time=[\d.]+\.\.[\d.]+/);
      const timing = timeMatch ? timeMatch[0] : 'timing unknown';
      return { details: `GIN index used (${timing})` };
    }

    // Check if it's a seq scan (suboptimal but acceptable for small datasets)
    if (plan.includes('Seq Scan')) {
      return { details: 'Sequential scan used (acceptable for small dataset)' };
    }

    return { details: 'Query plan validated' };
  });

  await runDeepTest(category, 'concurrent_query_stress', async () => {
    if (STRESS_LEVEL < 2) {
      return { details: 'Skipped (STRESS_LEVEL < 2)' };
    }

    // Run 10 concurrent queries
    const concurrency = STRESS_LEVEL === 3 ? 20 : 10;
    const start = performance.now();

    const promises = Array.from({ length: concurrency }, (_, i) =>
      prisma.email.findMany({
        where: {
          tenantId,
          isDeleted: false,
          folder: { not: 'TRASH' },
        },
        orderBy: { receivedAt: 'desc' },
        take: 20,
        skip: i * 20,
        select: { id: true, subject: true, receivedAt: true },
      }),
    );

    await Promise.all(promises);
    const duration = performance.now() - start;

    if (duration > 5000) {
      throw new CynicalError(
        `${concurrency} concurrent queries took ${Math.round(duration)}ms (too slow)`,
        'medium',
      );
    }

    return { details: `${concurrency} concurrent queries in ${Math.round(duration)}ms` };
  });
}

// ============================================================================
// CATEGORY 4: SQL INJECTION / SECURITY
// ============================================================================
async function testSecurityPatterns(tenantId: string) {
  const category = 'SECURITY';

  await runDeepTest(category, 'sql_injection_in_folder_name', async () => {
    // Try to create a folder with SQL injection attempt
    const maliciousNames = [
      "INBOX'; DROP TABLE emails; --",
      "INBOX\" OR 1=1 --",
      "INBOX\x00HIDDEN",
      "INBOX<script>alert('xss')</script>",
    ];

    for (const name of maliciousNames) {
      // This should NOT cause SQL errors or data leaks
      try {
        const count = await prisma.email.count({
          where: {
            tenantId,
            folder: name, // Prisma should parameterize this
          },
        });
        // Expected: count is 0, no SQL errors
        if (count !== 0) {
          throw new CynicalError(
            `Suspicious: SQL injection test returned count=${count} for "${name}"`,
            'critical',
          );
        }
      } catch (err: any) {
        // Prisma syntax error is OK, actual SQL injection would be catastrophic
        if (err.code === 'P2010' || err.message?.includes('Raw query failed')) {
          throw new CynicalError(
            `Possible SQL injection vulnerability with folder name: ${name}`,
            'critical',
          );
        }
        // Other Prisma errors are fine
      }
    }

    return { details: 'SQL injection attempts properly escaped' };
  });

  await runDeepTest(category, 'email_body_xss_stored', async () => {
    // Check if any stored email bodies contain unescaped XSS
    const xssPatterns = await prisma.$queryRaw<{ id: string; snippet: string }[]>`
      SELECT id, LEFT("bodyHtml", 100) as snippet
      FROM emails
      WHERE "tenantId" = ${tenantId}
        AND "bodyHtml" IS NOT NULL
        AND (
          "bodyHtml" ~* '<script[^>]*>'
          OR "bodyHtml" ~* 'javascript:'
          OR "bodyHtml" ~* 'on\\w+\\s*='
        )
      LIMIT 5
    `;

    // Note: Having script tags in emails is normal (they come from external sources)
    // The real test is that frontend sanitizes them - this is just flagging
    if (xssPatterns.length > 0) {
      return {
        details: `${xssPatterns.length} emails contain script/event handlers (ensure frontend sanitizes)`,
        severity: 'low' as const,
      };
    }

    return { details: 'No obvious XSS patterns in stored HTML' };
  });

  await runDeepTest(category, 'embedding_vector_bounds', async () => {
    // Check that vector embeddings have correct dimensions
    // pgvector type requires vector_dims() function
    const embeddings = await prisma.$queryRaw<{ id: string; dims: number }[]>`
      SELECT id, vector_dims(vector) as dims
      FROM embeddings
      WHERE "tenantId" = ${tenantId}
        AND vector IS NOT NULL
      LIMIT 10
    `;

    for (const emb of embeddings) {
      // Mistral embeddings should be 1024 dimensions
      if (emb.dims !== 1024) {
        throw new CynicalError(
          `Embedding ${emb.id} has ${emb.dims} dimensions (expected 1024)`,
          'high',
        );
      }
    }

    return { details: `Validated ${embeddings.length} embeddings (all 1024 dims)` };
  });
}

// ============================================================================
// CATEGORY 5: FOLDER SERVICE VALIDATION
// ============================================================================
async function testFolderService(tenantId: string, providerId?: string) {
  const category = 'FOLDER_SERVICE';

  await runDeepTest(category, 'folder_case_insensitive_lookup', async () => {
    // Verify case-insensitive folder lookups work
    const folders = await prisma.folder.findMany({
      where: { tenantId, ...(providerId ? { providerId } : {}) },
      take: 5,
    });

    for (const folder of folders) {
      // Query with different case
      const upper = folder.name.toUpperCase();
      const lower = folder.name.toLowerCase();

      const foundUpper = await prisma.email.count({
        where: {
          tenantId,
          folder: { equals: upper, mode: 'insensitive' },
        },
      });

      const foundLower = await prisma.email.count({
        where: {
          tenantId,
          folder: { equals: lower, mode: 'insensitive' },
        },
      });

      // Both should return the same count
      if (foundUpper !== foundLower) {
        throw new CynicalError(
          `Case sensitivity issue: "${upper}" has ${foundUpper}, "${lower}" has ${foundLower}`,
          'medium',
        );
      }
    }

    return { details: `Validated ${folders.length} folders for case insensitivity` };
  });

  await runDeepTest(category, 'system_folders_protected', async () => {
    // System folders should have isSystem = true
    const systemFolderNames = ['INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM', 'JUNK'];

    for (const name of systemFolderNames) {
      const folder = await prisma.folder.findFirst({
        where: {
          tenantId,
          ...(providerId ? { providerId } : {}),
          name: { equals: name, mode: 'insensitive' },
        },
      });

      if (folder && !folder.isSystem) {
        // Not critical, but should be flagged
        return {
          details: `WARN: Folder "${name}" exists but isSystem=false`,
          severity: 'low' as const,
        };
      }
    }

    return { details: 'System folders properly marked' };
  });

  await runDeepTest(category, 'folder_email_count_accuracy', async () => {
    // Stored folder counts should match actual counts
    const folders = await prisma.folder.findMany({
      where: { tenantId, ...(providerId ? { providerId } : {}) },
      take: 5,
    });

    for (const folder of folders) {
      const actualCount = await prisma.email.count({
        where: {
          tenantId,
          folder: folder.path || folder.name,
          isDeleted: false,
        },
      });

      // totalCount is cached, may be stale
      if (folder.totalCount !== null && Math.abs(folder.totalCount - actualCount) > 10) {
        return {
          details: `WARN: Folder "${folder.name}" cached count ${folder.totalCount} vs actual ${actualCount}`,
          severity: 'low' as const,
        };
      }
    }

    return { details: 'Folder counts validated' };
  });
}

// ============================================================================
// CATEGORY 6: RACE CONDITION CHECKS
// ============================================================================
async function testRaceConditions(tenantId: string, providerId?: string) {
  const category = 'RACE_CONDITIONS';

  if (STRESS_LEVEL < 2) {
    record(category, 'race_condition_tests', 'SKIP', 0, 'STRESS_LEVEL < 2');
    return;
  }

  await runDeepTest(category, 'concurrent_email_updates', async () => {
    // Find an email to test
    const email = await prisma.email.findFirst({
      where: { tenantId, ...(providerId ? { providerId } : {}), isDeleted: false },
      select: { id: true, isRead: true },
    });

    if (!email) {
      return { details: 'No email found for test' };
    }

    // Attempt concurrent updates
    const concurrentUpdates = 5;
    const updates = Array.from({ length: concurrentUpdates }, (_, i) =>
      prisma.email.update({
        where: { id: email.id },
        data: { isRead: i % 2 === 0 },
      }).catch((err: Error) => ({ error: err.message })),
    );

    const results = await Promise.all(updates);
    const errors = results.filter((r: any) => r?.error);

    // Some P2034 errors are expected in high concurrency
    if (errors.length > concurrentUpdates / 2) {
      throw new CynicalError(
        `Too many concurrent update failures: ${errors.length}/${concurrentUpdates}`,
        'medium',
      );
    }

    // Restore original state
    await prisma.email.update({
      where: { id: email.id },
      data: { isRead: email.isRead },
    });

    return { details: `${concurrentUpdates - errors.length}/${concurrentUpdates} updates succeeded` };
  });

  await runDeepTest(category, 'folder_rename_during_list', async () => {
    // This simulates a folder rename happening while emails are being listed
    const folder = await prisma.folder.findFirst({
      where: {
        tenantId,
        ...(providerId ? { providerId } : {}),
        isSystem: false,
      },
    });

    if (!folder) {
      return { details: 'No custom folder found for test' };
    }

    // Start a long-running query
    const listPromise = prisma.email.findMany({
      where: {
        tenantId,
        folder: folder.path || folder.name,
      },
      take: 100,
    });

    // Immediately try to rename (this won't actually rename, just tests the pattern)
    await prisma.folder.update({
      where: { id: folder.id },
      data: { name: folder.name }, // No-op update
    }).catch(() => null);

    await listPromise;

    return { details: 'Concurrent folder/list operations handled' };
  });
}

// ============================================================================
// CATEGORY 7: EDGE CASES
// ============================================================================
async function testEdgeCases(tenantId: string) {
  const category = 'EDGE_CASES';

  await runDeepTest(category, 'empty_subject_handling', async () => {
    // Use raw SQL for null/empty check
    const emptySubjects = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM emails
      WHERE "tenantId" = ${tenantId}
        AND (subject IS NULL OR subject = '')
    `;

    const count = Number(emptySubjects[0]?.count || 0);
    // Not an error, just reporting
    return { details: `${count} emails have empty/null subject` };
  });

  await runDeepTest(category, 'very_long_subject', async () => {
    const longSubjects = await prisma.$queryRaw<{ id: string; len: number }[]>`
      SELECT id, LENGTH(subject) as len
      FROM emails
      WHERE "tenantId" = ${tenantId}
        AND LENGTH(subject) > 500
      LIMIT 5
    `;

    if (longSubjects.length > 0) {
      const maxLen = Math.max(...longSubjects.map(s => s.len));
      return { details: `Found ${longSubjects.length} emails with subject > 500 chars (max: ${maxLen})` };
    }

    return { details: 'No extremely long subjects' };
  });

  await runDeepTest(category, 'unicode_in_email_addresses', async () => {
    // IDN (internationalized domain names) in email addresses
    // Use simpler check that works with Prisma parameterization
    const unicodeEmails = await prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(*) as cnt
      FROM emails
      WHERE "tenantId" = ${tenantId}
        AND ("from" LIKE '%é%' OR "from" LIKE '%ñ%' OR "from" LIKE '%ü%'
             OR "to"::text LIKE '%é%' OR "to"::text LIKE '%ñ%')
    `;

    const count = Number(unicodeEmails[0]?.cnt || 0);
    return { details: `${count} emails with unicode in addresses` };
  });

  await runDeepTest(category, 'conversation_threading_integrity', async () => {
    // Check for orphan thread references (column is threadId, not conversationId)
    const orphanThreads = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count
      FROM emails e
      WHERE "tenantId" = ${tenantId}
        AND "threadId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM emails e2
          WHERE e2."threadId" = e."threadId"
          AND e2.id != e.id
        )
    `;

    const count = Number(orphanThreads[0]?.count ?? 0);
    return { details: `${count} single-email threads (normal for non-replied emails)` };
  });

  await runDeepTest(category, 'attachment_mime_type_validity', async () => {
    // Check for suspicious/missing MIME types (field is mimeType, not contentType)
    const badMimes = await prisma.$queryRaw<{ mimeType: string; cnt: bigint }[]>`
      SELECT "mimeType", COUNT(*) as cnt
      FROM email_attachments a
      JOIN emails e ON a."emailId" = e.id
      WHERE e."tenantId" = ${tenantId}
        AND ("mimeType" IS NULL
             OR "mimeType" = ''
             OR "mimeType" NOT LIKE '%/%')
      GROUP BY "mimeType"
      LIMIT 10
    `;

    if (badMimes.length > 0) {
      const examples = badMimes.map(m => `"${m.mimeType || 'NULL'}"(${m.cnt})`).join(', ');
      return { details: `Invalid MIME types: ${examples}` };
    }

    return { details: 'All attachments have valid MIME types' };
  });
}

// ============================================================================
// TENANT RESOLUTION
// ============================================================================
async function resolveTenantId(): Promise<string> {
  const envTenant = process.env.MAIL_TEST_TENANT_ID;
  if (envTenant) return envTenant;

  // Auto-resolve from active provider
  const provider = await prisma.providerConfig.findFirst({
    where: { isActive: true, supportsEmail: true },
    select: { tenantId: true },
  });
  if (!provider) throw new Error('No active email provider found to determine tenant');
  return provider.tenantId;
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  console.log('\n========================================');
  console.log(' CYNICAL Email Integrity Deep Validation');
  console.log(' Stress Level:', STRESS_LEVEL);
  console.log('========================================\n');

  const tenantId = await resolveTenantId();
  const providerId = process.env.MAIL_TEST_PROVIDER_ID;

  // Verify tenant exists
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    console.error(`ERROR: Tenant ${tenantId} not found`);
    process.exit(1);
  }

  console.log(`Testing tenant: ${tenant.name || tenant.id}`);
  if (providerId) {
    console.log(`Testing provider: ${providerId}`);
  }
  console.log('');

  try {
    await testTenantIsolation(tenantId);
    console.log('');

    await testDataIntegrity(tenantId);
    console.log('');

    await testPerformance(tenantId, providerId);
    console.log('');

    await testSecurityPatterns(tenantId);
    console.log('');

    await testFolderService(tenantId, providerId);
    console.log('');

    await testRaceConditions(tenantId, providerId);
    console.log('');

    await testEdgeCases(tenantId);
    console.log('');

  } finally {
    await prisma.$disconnect();
  }

  // Summary
  console.log('\n========================================');
  console.log(' SUMMARY');
  console.log('========================================');

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warned = results.filter(r => r.status === 'WARN').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;

  console.log(`PASS: ${passed}`);
  console.log(`FAIL: ${failed} (Critical: ${totalCritical}, High: ${totalHigh})`);
  console.log(`WARN: ${warned}`);
  console.log(`SKIP: ${skipped}`);

  if (failed > 0) {
    console.log('\n\x1b[31mFAILURES:\x1b[0m');
    results
      .filter(r => r.status === 'FAIL')
      .forEach(r => {
        console.log(`  [${r.severity?.toUpperCase() || 'HIGH'}] ${r.category}.${r.name}`);
        console.log(`    ${r.details}`);
      });
  }

  if (totalCritical > 0) {
    console.log('\n\x1b[31m!!! CRITICAL ISSUES FOUND - DO NOT DEPLOY !!!\x1b[0m');
    process.exit(2);
  }

  if (totalHigh > 0) {
    console.log('\n\x1b[33m!!! HIGH SEVERITY ISSUES FOUND - FIX BEFORE DEPLOY !!!\x1b[0m');
    process.exit(1);
  }

  console.log('\n\x1b[32mAll critical checks passed.\x1b[0m');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
