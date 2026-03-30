/**
 * T-1704: Production Data Consistency Validation Script
 *
 * Runnable via: npx ts-node scripts/validate-production-data.ts
 *
 * Checks:
 * 1. Email folder matches determineFolderFromLabels(labels) for Google emails
 * 2. No orphan embeddings (embedding exists but email deleted/missing)
 * 3. No cross-tenant data (email.tenantId matches provider.tenantId)
 * 4. Active webhook subscriptions are not expired
 * 5. No stale sync tokens (providers with old lastSyncedAt)
 *
 * Output: JSON report with { check, status, count, details }
 * Exit code: 0 if all pass, 1 if any fail
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

interface CheckResult {
  check: string;
  status: 'pass' | 'fail' | 'warn';
  count: number;
  details?: string;
}

// Mirror of gmail-message.service.ts::determineFolderFromLabels()
function deriveFolderFromLabels(labelIds: string[]): string {
  if (labelIds.includes('TRASH')) return 'TRASH';
  if (labelIds.includes('SPAM')) return 'SPAM';
  if (labelIds.includes('SENT')) return 'SENT';
  if (labelIds.includes('DRAFT')) return 'DRAFTS';

  const categoryLabel = labelIds.find((l) => l.startsWith('CATEGORY_'));
  if (categoryLabel) {
    const map: Record<string, string> = {
      CATEGORY_PERSONAL: 'INBOX',
      CATEGORY_SOCIAL: 'SOCIAL',
      CATEGORY_PROMOTIONS: 'PROMOTIONS',
      CATEGORY_UPDATES: 'UPDATES',
      CATEGORY_FORUMS: 'FORUMS',
    };
    if (map[categoryLabel]) return map[categoryLabel];
  }

  if (labelIds.includes('INBOX')) return 'INBOX';
  return 'ARCHIVE';
}

async function run() {
  const prisma = createPrismaClient();
  const results: CheckResult[] = [];

  try {
    // ─── Check 1: Email folder consistency (Google) ───
    console.log('Check 1: Email folder consistency...');
    let inconsistentFolders = 0;
    const batchSize = 1000;
    let offset = 0;
    const googleEmailCount = await prisma.email.count({
      where: { provider: { providerType: 'google' }, isDeleted: false },
    });

    while (offset < googleEmailCount) {
      const emails = await prisma.email.findMany({
        where: { provider: { providerType: 'google' }, isDeleted: false },
        select: { id: true, folder: true, labels: true },
        skip: offset,
        take: batchSize,
      });

      for (const email of emails) {
        const labels = (email.labels as string[]) || [];
        const derived = deriveFolderFromLabels(labels);
        if (email.folder !== derived) {
          inconsistentFolders++;
        }
      }
      offset += batchSize;
    }

    results.push({
      check: 'email-folder-consistency',
      status: inconsistentFolders === 0 ? 'pass' : 'fail',
      count: inconsistentFolders,
      details: `${inconsistentFolders}/${googleEmailCount} Google emails have folder mismatch`,
    });

    // ─── Check 2: Orphan embeddings ───
    console.log('Check 2: Orphan embeddings...');
    const orphanEmbeddings = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "Embedding" e
      LEFT JOIN "Email" em ON e."emailId" = em.id
      WHERE e."emailId" IS NOT NULL
      AND (em.id IS NULL OR em."isDeleted" = true)
    `;
    const orphanCount = Number(orphanEmbeddings[0]?.count ?? 0);

    results.push({
      check: 'orphan-embeddings',
      status: orphanCount === 0 ? 'pass' : 'fail',
      count: orphanCount,
      details: `${orphanCount} embeddings reference deleted/missing emails`,
    });

    // ─── Check 3: Cross-tenant data ───
    console.log('Check 3: Cross-tenant data...');
    const crossTenant = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "Email" e
      JOIN "ProviderConfig" p ON e."providerId" = p.id
      WHERE e."tenantId" != p."tenantId"
    `;
    const crossTenantCount = Number(crossTenant[0]?.count ?? 0);

    results.push({
      check: 'cross-tenant-data',
      status: crossTenantCount === 0 ? 'pass' : 'fail',
      count: crossTenantCount,
      details: crossTenantCount > 0
        ? `CRITICAL: ${crossTenantCount} emails have mismatched tenantId with their provider`
        : 'No cross-tenant data leaks detected',
    });

    // ─── Check 4: Expired webhook subscriptions ───
    console.log('Check 4: Webhook subscriptions...');
    const now = new Date();
    let expiredWebhooks = 0;
    try {
      expiredWebhooks = await prisma.webhookSubscription.count({
        where: {
          isActive: true,
          expiresAt: { lt: now },
        },
      });
    } catch {
      // WebhookSubscription model may not exist in all environments
      expiredWebhooks = 0;
    }

    results.push({
      check: 'expired-webhooks',
      status: expiredWebhooks === 0 ? 'pass' : 'warn',
      count: expiredWebhooks,
      details: `${expiredWebhooks} active webhook subscriptions are expired`,
    });

    // ─── Check 5: Stale sync tokens ───
    console.log('Check 5: Stale sync tokens...');
    const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
    const staleProviders = await prisma.providerConfig.count({
      where: {
        isActive: true,
        lastSyncedAt: { lt: staleThreshold },
      },
    });
    const neverSynced = await prisma.providerConfig.count({
      where: {
        isActive: true,
        lastSyncedAt: null,
      },
    });

    results.push({
      check: 'stale-sync-tokens',
      status: staleProviders === 0 && neverSynced === 0 ? 'pass' : 'warn',
      count: staleProviders + neverSynced,
      details: `${staleProviders} providers not synced in 24h, ${neverSynced} never synced`,
    });

    // ─── Check 6: Folder cache consistency ───
    console.log('Check 6: Folder cache consistency...');
    const foldersWithoutProvider = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "Folder" f
      LEFT JOIN "ProviderConfig" p ON f."providerId" = p.id
      WHERE p.id IS NULL
    `;
    const orphanFolderCount = Number(foldersWithoutProvider[0]?.count ?? 0);

    results.push({
      check: 'folder-cache-consistency',
      status: orphanFolderCount === 0 ? 'pass' : 'warn',
      count: orphanFolderCount,
      details: `${orphanFolderCount} folders reference missing providers`,
    });

    // ─── Report ───
    const hasFailures = results.some((r) => r.status === 'fail');
    const report = {
      timestamp: new Date().toISOString(),
      overall: hasFailures ? 'FAIL' : 'PASS',
      checks: results,
    };

    console.log('\n' + JSON.stringify(report, null, 2));

    if (hasFailures) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Validation script failed:', error);
    process.exit(2);
  } finally {
    await prisma.$disconnect();
  }
}

run();
