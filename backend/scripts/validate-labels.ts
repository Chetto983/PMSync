/**
 * Label Validation Script
 *
 * Comprehensive validation of all labels in the database:
 * - Tenant isolation verification
 * - Duplicate slug detection (including archived)
 * - Orphaned parent references
 * - Circular hierarchy detection
 * - EmailLabel relationship integrity
 * - Redis cache consistency
 * - BullMQ queue health
 *
 * Run with: npx ts-node scripts/validate-labels.ts
 *
 * Options:
 *   --fix    Attempt to auto-fix issues
 *   --tenant <id>  Validate specific tenant only
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from backend directory
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { Redis } from 'ioredis';
import { getRedisConnectionOptions } from '../src/config/configuration';

interface ValidationResult {
  category: string;
  check: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'FIXED';
  count?: number;
  details?: unknown;
}

const results: ValidationResult[] = [];
const args = process.argv.slice(2);
const shouldFix = args.includes('--fix');
const tenantFilter = args.includes('--tenant')
  ? args[args.indexOf('--tenant') + 1]
  : null;

function log(result: ValidationResult) {
  results.push(result);
  const icon =
    result.status === 'PASS'
      ? '✅'
      : result.status === 'WARN'
        ? '⚠️'
        : result.status === 'FIXED'
          ? '🔧'
          : '❌';
  console.log(
    `  ${icon} ${result.check}: ${result.status}${result.count !== undefined ? ` (${result.count})` : ''}`,
  );
  if (result.details && result.status !== 'PASS') {
    const detailStr = JSON.stringify(result.details);
    console.log(`     Details: ${detailStr.substring(0, 300)}${detailStr.length > 300 ? '...' : ''}`);
  }
}

async function main() {
  console.log('============================================================');
  console.log('LABEL VALIDATION SCRIPT');
  console.log('============================================================');
  console.log(`Started at: ${new Date().toISOString()}`);
  if (shouldFix) console.log('🔧 FIX MODE ENABLED');
  if (tenantFilter) console.log(`📌 Filtering tenant: ${tenantFilter}`);
  console.log('');

  const prisma = createPrismaClient();
  let redis: Redis | null = null;

  try {
    // Connect to Redis
    try {
      const redisOpts = getRedisConnectionOptions();
      redis = new Redis({
        ...redisOpts,
        lazyConnect: false,
        connectionName: 'label-validation',
      });
      await redis.ping();
      console.log('✅ Redis connected\n');
    } catch (err) {
      console.log('⚠️ Redis not available - skipping Redis checks\n');
      redis = null;
    }

    // ============================================================
    // 1. BASIC LABEL STATS
    // ============================================================
    console.log('============================================================');
    console.log('1. LABEL STATISTICS');
    console.log('============================================================');

    const tenantWhere = tenantFilter ? `WHERE "tenantId" = '${tenantFilter}'` : '';
    const tenantWhereAnd = tenantFilter ? `AND "tenantId" = '${tenantFilter}'` : '';

    const labelStats = await prisma.$queryRawUnsafe<
      { total: bigint; active: bigint; archived: bigint; with_parent: bigint; root: bigint }[]
    >(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE "isArchived" = false) as active,
        COUNT(*) FILTER (WHERE "isArchived" = true) as archived,
        COUNT(*) FILTER (WHERE "parentId" IS NOT NULL AND "isArchived" = false) as with_parent,
        COUNT(*) FILTER (WHERE "parentId" IS NULL AND "isArchived" = false) as root
      FROM user_labels
      ${tenantWhere}
    `);

    const stats = labelStats[0];
    console.log(`  Total labels: ${stats.total}`);
    console.log(`  Active labels: ${stats.active}`);
    console.log(`  Archived labels: ${stats.archived}`);
    console.log(`  Root labels: ${stats.root}`);
    console.log(`  Nested labels: ${stats.with_parent}`);

    // Labels by tenant
    const labelsByTenant = await prisma.$queryRawUnsafe<
      { tenantId: string; cnt: bigint; active: bigint }[]
    >(`
      SELECT "tenantId", COUNT(*) as cnt, COUNT(*) FILTER (WHERE "isArchived" = false) as active
      FROM user_labels
      ${tenantWhere}
      GROUP BY "tenantId"
      ORDER BY cnt DESC
    `);

    console.log('\n  Labels by tenant:');
    labelsByTenant.forEach((t) => {
      console.log(`    - ${t.tenantId}: ${t.cnt} total, ${t.active} active`);
    });

    // ============================================================
    // 2. TENANT ISOLATION CHECK
    // ============================================================
    console.log('\n============================================================');
    console.log('2. TENANT ISOLATION CHECK');
    console.log('============================================================');

    // Labels without valid tenant
    const labelsWithoutTenant = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`
      SELECT COUNT(*) as count FROM user_labels l
      WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = l."tenantId")
      ${tenantWhereAnd}
    `);
    log({
      category: 'isolation',
      check: 'Labels without valid tenant',
      status: Number(labelsWithoutTenant[0]?.count || 0) === 0 ? 'PASS' : 'FAIL',
      count: Number(labelsWithoutTenant[0]?.count || 0),
    });

    // Cross-tenant parent references
    const crossTenantParents = await prisma.$queryRawUnsafe<
      { id: string; tenantId: string; parentId: string; parentTenant: string }[]
    >(`
      SELECT l.id, l."tenantId", l."parentId", p."tenantId" as "parentTenant"
      FROM user_labels l
      JOIN user_labels p ON l."parentId" = p.id
      WHERE l."tenantId" != p."tenantId"
      ${tenantWhereAnd}
    `);
    log({
      category: 'isolation',
      check: 'Cross-tenant parent references',
      status: crossTenantParents.length === 0 ? 'PASS' : 'FAIL',
      count: crossTenantParents.length,
      details: crossTenantParents.length > 0 ? crossTenantParents.slice(0, 5) : undefined,
    });

    // EmailLabel cross-tenant check
    const crossTenantEmailLabels = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`
      SELECT COUNT(*) as count
      FROM email_labels el
      JOIN user_labels l ON el."labelId" = l.id
      JOIN emails e ON el."emailId" = e.id
      WHERE l."tenantId" != e."tenantId"
    `);
    log({
      category: 'isolation',
      check: 'EmailLabel cross-tenant references',
      status: Number(crossTenantEmailLabels[0]?.count || 0) === 0 ? 'PASS' : 'FAIL',
      count: Number(crossTenantEmailLabels[0]?.count || 0),
    });

    // ============================================================
    // 3. DUPLICATE SLUG CHECK
    // ============================================================
    console.log('\n============================================================');
    console.log('3. DUPLICATE SLUG CHECK');
    console.log('============================================================');

    // Duplicate active slugs (same tenant)
    const duplicateActiveSlugs = await prisma.$queryRawUnsafe<
      { tenantId: string; slug: string; cnt: bigint }[]
    >(`
      SELECT "tenantId", slug, COUNT(*) as cnt
      FROM user_labels
      WHERE "isArchived" = false
      ${tenantWhereAnd}
      GROUP BY "tenantId", slug
      HAVING COUNT(*) > 1
    `);
    log({
      category: 'duplicates',
      check: 'Duplicate active slugs (same tenant)',
      status: duplicateActiveSlugs.length === 0 ? 'PASS' : 'FAIL',
      count: duplicateActiveSlugs.length,
      details: duplicateActiveSlugs.length > 0 ? duplicateActiveSlugs : undefined,
    });

    // Archived slugs that conflict with potential new labels
    const archivedSlugsWithoutTimestamp = await prisma.$queryRawUnsafe<
      { id: string; tenantId: string; slug: string; name: string }[]
    >(`
      SELECT id, "tenantId", slug, name
      FROM user_labels
      WHERE "isArchived" = true
      AND slug NOT LIKE '%-deleted-%'
      ${tenantWhereAnd}
    `);

    if (archivedSlugsWithoutTimestamp.length > 0) {
      log({
        category: 'duplicates',
        check: 'Archived slugs without timestamp (potential conflicts)',
        status: shouldFix ? 'FIXED' : 'WARN',
        count: archivedSlugsWithoutTimestamp.length,
        details: archivedSlugsWithoutTimestamp.slice(0, 10),
      });

      if (shouldFix) {
        console.log('     🔧 Fixing archived slugs...');
        for (const label of archivedSlugsWithoutTimestamp) {
          const newSlug = `${label.slug}-deleted-${Date.now()}`;
          await prisma.$executeRawUnsafe(
            `UPDATE user_labels SET slug = $1 WHERE id = $2`,
            newSlug,
            label.id,
          );
          console.log(`       Fixed: ${label.slug} -> ${newSlug}`);
        }
      }
    } else {
      log({
        category: 'duplicates',
        check: 'Archived slugs without timestamp',
        status: 'PASS',
        count: 0,
      });
    }

    // ============================================================
    // 4. ORPHANED REFERENCES CHECK
    // ============================================================
    console.log('\n============================================================');
    console.log('4. ORPHANED REFERENCES CHECK');
    console.log('============================================================');

    // Labels with non-existent parent
    const orphanedParents = await prisma.$queryRawUnsafe<
      { id: string; tenantId: string; name: string; parentId: string }[]
    >(`
      SELECT l.id, l."tenantId", l.name, l."parentId"
      FROM user_labels l
      WHERE l."parentId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM user_labels p WHERE p.id = l."parentId")
      ${tenantWhereAnd}
    `);

    if (orphanedParents.length > 0) {
      log({
        category: 'orphans',
        check: 'Labels with non-existent parent',
        status: shouldFix ? 'FIXED' : 'FAIL',
        count: orphanedParents.length,
        details: orphanedParents.slice(0, 10),
      });

      if (shouldFix) {
        console.log('     🔧 Fixing orphaned parent references...');
        for (const label of orphanedParents) {
          await prisma.$executeRawUnsafe(
            `UPDATE user_labels SET "parentId" = NULL, level = 0 WHERE id = $1`,
            label.id,
          );
          console.log(`       Fixed: ${label.name} (set parentId to NULL)`);
        }
      }
    } else {
      log({
        category: 'orphans',
        check: 'Labels with non-existent parent',
        status: 'PASS',
        count: 0,
      });
    }

    // Labels pointing to archived parent
    const archivedParentRefs = await prisma.$queryRawUnsafe<
      { id: string; name: string; parentId: string; parentName: string }[]
    >(`
      SELECT l.id, l.name, l."parentId", p.name as "parentName"
      FROM user_labels l
      JOIN user_labels p ON l."parentId" = p.id
      WHERE l."isArchived" = false
      AND p."isArchived" = true
      ${tenantWhereAnd}
    `);
    log({
      category: 'orphans',
      check: 'Active labels with archived parent',
      status: archivedParentRefs.length === 0 ? 'PASS' : 'WARN',
      count: archivedParentRefs.length,
      details: archivedParentRefs.length > 0 ? archivedParentRefs.slice(0, 10) : undefined,
    });

    // EmailLabels with non-existent label
    const orphanedEmailLabels = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`
      SELECT COUNT(*) as count FROM email_labels el
      WHERE NOT EXISTS (SELECT 1 FROM user_labels l WHERE l.id = el."labelId")
    `);
    log({
      category: 'orphans',
      check: 'EmailLabels with non-existent label',
      status: Number(orphanedEmailLabels[0]?.count || 0) === 0 ? 'PASS' : 'FAIL',
      count: Number(orphanedEmailLabels[0]?.count || 0),
    });

    // EmailLabels with non-existent email
    const orphanedEmailLabelsEmail = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`
      SELECT COUNT(*) as count FROM email_labels el
      WHERE NOT EXISTS (SELECT 1 FROM emails e WHERE e.id = el."emailId")
    `);
    log({
      category: 'orphans',
      check: 'EmailLabels with non-existent email',
      status: Number(orphanedEmailLabelsEmail[0]?.count || 0) === 0 ? 'PASS' : 'FAIL',
      count: Number(orphanedEmailLabelsEmail[0]?.count || 0),
    });

    // ============================================================
    // 5. CIRCULAR REFERENCE CHECK
    // ============================================================
    console.log('\n============================================================');
    console.log('5. CIRCULAR REFERENCE CHECK');
    console.log('============================================================');

    // Get all labels with parents
    const labelsWithParents = await prisma.$queryRawUnsafe<
      { id: string; parentId: string; name: string; tenantId: string }[]
    >(`
      SELECT id, "parentId", name, "tenantId"
      FROM user_labels
      WHERE "parentId" IS NOT NULL
      AND "isArchived" = false
      ${tenantWhereAnd}
    `);

    const circularRefs: { labelId: string; chain: string[] }[] = [];

    for (const label of labelsWithParents) {
      const visited = new Set<string>();
      let currentId: string | null = label.id;
      const chain: string[] = [];

      while (currentId) {
        if (visited.has(currentId)) {
          circularRefs.push({ labelId: label.id, chain: [...chain, currentId] });
          break;
        }
        visited.add(currentId);
        chain.push(currentId);

        const parent = labelsWithParents.find((l) => l.id === currentId);
        currentId = parent?.parentId || null;
      }
    }

    log({
      category: 'hierarchy',
      check: 'Circular parent references',
      status: circularRefs.length === 0 ? 'PASS' : 'FAIL',
      count: circularRefs.length,
      details: circularRefs.length > 0 ? circularRefs.slice(0, 5) : undefined,
    });

    // ============================================================
    // 6. LEVEL CONSISTENCY CHECK
    // ============================================================
    console.log('\n============================================================');
    console.log('6. LEVEL CONSISTENCY CHECK');
    console.log('============================================================');

    // Labels with incorrect level
    const incorrectLevels = await prisma.$queryRawUnsafe<
      { id: string; name: string; level: number; parentLevel: number }[]
    >(`
      SELECT l.id, l.name, l.level, p.level as "parentLevel"
      FROM user_labels l
      JOIN user_labels p ON l."parentId" = p.id
      WHERE l.level != p.level + 1
      AND l."isArchived" = false
      ${tenantWhereAnd}
    `);

    if (incorrectLevels.length > 0) {
      log({
        category: 'hierarchy',
        check: 'Labels with incorrect level',
        status: shouldFix ? 'FIXED' : 'WARN',
        count: incorrectLevels.length,
        details: incorrectLevels.slice(0, 10),
      });

      if (shouldFix) {
        console.log('     🔧 Fixing incorrect levels...');
        for (const label of incorrectLevels) {
          const correctLevel = label.parentLevel + 1;
          await prisma.$executeRawUnsafe(
            `UPDATE user_labels SET level = $1 WHERE id = $2`,
            correctLevel,
            label.id,
          );
          console.log(`       Fixed: ${label.name} level ${label.level} -> ${correctLevel}`);
        }
      }
    } else {
      log({
        category: 'hierarchy',
        check: 'Labels with incorrect level',
        status: 'PASS',
        count: 0,
      });
    }

    // Root labels with non-zero level
    const rootNonZeroLevel = await prisma.$queryRawUnsafe<
      { id: string; name: string; level: number }[]
    >(`
      SELECT id, name, level
      FROM user_labels
      WHERE "parentId" IS NULL
      AND level != 0
      AND "isArchived" = false
      ${tenantWhereAnd}
    `);

    if (rootNonZeroLevel.length > 0) {
      log({
        category: 'hierarchy',
        check: 'Root labels with non-zero level',
        status: shouldFix ? 'FIXED' : 'WARN',
        count: rootNonZeroLevel.length,
        details: rootNonZeroLevel.slice(0, 10),
      });

      if (shouldFix) {
        console.log('     🔧 Fixing root label levels...');
        await prisma.$executeRawUnsafe(`
          UPDATE user_labels
          SET level = 0
          WHERE "parentId" IS NULL AND level != 0 AND "isArchived" = false
        `);
        console.log(`       Fixed ${rootNonZeroLevel.length} root labels`);
      }
    } else {
      log({
        category: 'hierarchy',
        check: 'Root labels with non-zero level',
        status: 'PASS',
        count: 0,
      });
    }

    // ============================================================
    // 7. REDIS CACHE CHECK
    // ============================================================
    console.log('\n============================================================');
    console.log('7. REDIS CACHE CHECK');
    console.log('============================================================');

    if (redis) {
      // Check for label-related cache keys
      const labelCacheKeys = await redis.keys('*label*');
      log({
        category: 'redis',
        check: 'Label-related cache keys in Redis',
        status: 'PASS',
        count: labelCacheKeys.length,
        details: labelCacheKeys.length > 0 ? labelCacheKeys.slice(0, 10) : undefined,
      });

      // Check for tenant-specific label caches
      for (const tenant of labelsByTenant.slice(0, 5)) {
        const tenantLabelKeys = await redis.keys(`*${tenant.tenantId}*label*`);
        console.log(`    Tenant ${tenant.tenantId.substring(0, 8)}...: ${tenantLabelKeys.length} cache keys`);
      }

      // Check Redis memory usage
      const memoryInfo = await redis.info('memory');
      const usedMemoryMatch = memoryInfo.match(/used_memory_human:(\S+)/);
      console.log(`\n  Redis memory: ${usedMemoryMatch?.[1] || 'unknown'}`);
    } else {
      log({
        category: 'redis',
        check: 'Redis connection',
        status: 'WARN',
        details: 'Redis not available',
      });
    }

    // ============================================================
    // 8. BULLMQ QUEUE CHECK
    // ============================================================
    console.log('\n============================================================');
    console.log('8. BULLMQ QUEUE CHECK');
    console.log('============================================================');

    if (redis) {
      // Check for BullMQ queues
      const bullQueues = await redis.keys('bull:*');
      const queueNames = [...new Set(bullQueues.map((k) => k.split(':')[1]))];

      console.log(`  Found ${queueNames.length} BullMQ queues`);

      // Check for label-related queues (if any)
      const labelQueues = queueNames.filter((q) => q?.toLowerCase().includes('label'));
      if (labelQueues.length > 0) {
        log({
          category: 'bullmq',
          check: 'Label-related BullMQ queues',
          status: 'PASS',
          count: labelQueues.length,
          details: labelQueues,
        });
      }

      // Check dead letter queue for label-related jobs
      const dlqKeys = await redis.keys('bull:dead-letter-queue:*');
      if (dlqKeys.length > 0) {
        // Check first few DLQ entries for label operations
        const dlqJobs = await redis.lrange('bull:dead-letter-queue:failed', 0, 20);
        const labelDlqJobs = dlqJobs.filter((j) => j.toLowerCase().includes('label'));
        log({
          category: 'bullmq',
          check: 'Label-related jobs in dead-letter queue',
          status: labelDlqJobs.length === 0 ? 'PASS' : 'WARN',
          count: labelDlqJobs.length,
        });
      }

      // Check tenant isolation in queues
      console.log('\n  Queue tenant isolation check:');
      for (const queueName of queueNames.slice(0, 10)) {
        if (!queueName) continue;
        const waitingJobs = await redis.lrange(`bull:${queueName}:wait`, 0, 5);
        if (waitingJobs.length > 0) {
          console.log(`    ${queueName}: ${waitingJobs.length}+ waiting jobs`);
        }
      }
    } else {
      log({
        category: 'bullmq',
        check: 'BullMQ queue check',
        status: 'WARN',
        details: 'Redis not available',
      });
    }

    // ============================================================
    // 9. DATA INTEGRITY CHECK
    // ============================================================
    console.log('\n============================================================');
    console.log('9. DATA INTEGRITY CHECK');
    console.log('============================================================');

    // Labels with empty name
    const emptyNames = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`
      SELECT COUNT(*) as count FROM user_labels
      WHERE name IS NULL OR name = '' OR TRIM(name) = ''
      ${tenantWhereAnd}
    `);
    log({
      category: 'integrity',
      check: 'Labels with empty name',
      status: Number(emptyNames[0]?.count || 0) === 0 ? 'PASS' : 'FAIL',
      count: Number(emptyNames[0]?.count || 0),
    });

    // Labels with empty slug
    const emptySlugs = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`
      SELECT COUNT(*) as count FROM user_labels
      WHERE slug IS NULL OR slug = '' OR TRIM(slug) = ''
      ${tenantWhereAnd}
    `);
    log({
      category: 'integrity',
      check: 'Labels with empty slug',
      status: Number(emptySlugs[0]?.count || 0) === 0 ? 'PASS' : 'FAIL',
      count: Number(emptySlugs[0]?.count || 0),
    });

    // Labels with invalid color JSON
    const invalidColors = await prisma.$queryRawUnsafe<
      { id: string; name: string; color: unknown }[]
    >(`
      SELECT id, name, color
      FROM user_labels
      WHERE color IS NOT NULL
      AND (
        color::text NOT LIKE '{%}'
        OR color->>'backgroundColor' IS NULL
        OR color->>'textColor' IS NULL
      )
      ${tenantWhereAnd}
      LIMIT 20
    `);
    log({
      category: 'integrity',
      check: 'Labels with invalid color format',
      status: invalidColors.length === 0 ? 'PASS' : 'WARN',
      count: invalidColors.length,
      details: invalidColors.length > 0 ? invalidColors.map((l) => ({ id: l.id, name: l.name })) : undefined,
    });

    // Duplicate orderIndex within same parent
    const duplicateOrderIndex = await prisma.$queryRawUnsafe<
      { tenantId: string; parentId: string | null; orderIndex: number; cnt: bigint }[]
    >(`
      SELECT "tenantId", "parentId", "orderIndex", COUNT(*) as cnt
      FROM user_labels
      WHERE "isArchived" = false
      ${tenantWhereAnd}
      GROUP BY "tenantId", "parentId", "orderIndex"
      HAVING COUNT(*) > 1
    `);
    log({
      category: 'integrity',
      check: 'Duplicate orderIndex within same parent',
      status: duplicateOrderIndex.length === 0 ? 'PASS' : 'WARN',
      count: duplicateOrderIndex.length,
      details: duplicateOrderIndex.length > 0 ? duplicateOrderIndex.slice(0, 10) : undefined,
    });

    // ============================================================
    // SUMMARY
    // ============================================================
    console.log('\n============================================================');
    console.log('VALIDATION SUMMARY');
    console.log('============================================================');

    const passed = results.filter((r) => r.status === 'PASS').length;
    const warnings = results.filter((r) => r.status === 'WARN').length;
    const failed = results.filter((r) => r.status === 'FAIL').length;
    const fixed = results.filter((r) => r.status === 'FIXED').length;

    console.log(`\nTotal Checks: ${results.length}`);
    console.log(`  ✅ Passed: ${passed}`);
    console.log(`  ⚠️  Warnings: ${warnings}`);
    console.log(`  ❌ Failed: ${failed}`);
    if (fixed > 0) console.log(`  🔧 Fixed: ${fixed}`);

    if (failed > 0) {
      console.log('\n❌ FAILED CHECKS:');
      results
        .filter((r) => r.status === 'FAIL')
        .forEach((r) => {
          console.log(`  - ${r.check}: ${r.count ?? ''}`);
        });
    }

    if (warnings > 0) {
      console.log('\n⚠️  WARNING CHECKS:');
      results
        .filter((r) => r.status === 'WARN')
        .forEach((r) => {
          console.log(`  - ${r.check}: ${r.count !== undefined ? r.count : ''}`);
        });
    }

    if (!shouldFix && (failed > 0 || warnings > 0)) {
      console.log('\n💡 TIP: Run with --fix to auto-repair some issues');
    }

    console.log(`\n============================================================`);
    console.log(`Completed at: ${new Date().toISOString()}`);
    console.log('============================================================');

    process.exit(failed > 0 ? 1 : 0);
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Fatal error:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    if (redis) {
      redis.disconnect();
    }
  }
}

main();
