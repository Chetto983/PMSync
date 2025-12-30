/**
 * Folder Validation Script
 *
 * Comprehensive validation of all folders in the database:
 * - Tenant isolation verification
 * - Provider relationship integrity
 * - Orphaned parent references
 * - Circular hierarchy detection
 * - Path consistency check
 * - SpecialUse validation
 * - Redis cache consistency
 * - BullMQ queue health
 *
 * Run with: npx ts-node scripts/validate-folders.ts
 *
 * Options:
 *   --fix    Attempt to auto-fix issues
 *   --tenant <id>  Validate specific tenant only
 *   --provider <id>  Validate specific provider only
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
const providerFilter = args.includes('--provider')
  ? args[args.indexOf('--provider') + 1]
  : null;

// Custom JSON stringifier to handle BigInt
function safeStringify(obj: unknown): string {
  return JSON.stringify(obj, (_, value) =>
    typeof value === 'bigint' ? value.toString() : value
  );
}

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
    const detailStr = safeStringify(result.details);
    console.log(`     Details: ${detailStr.substring(0, 300)}${detailStr.length > 300 ? '...' : ''}`);
  }
}

async function main() {
  console.log('============================================================');
  console.log('FOLDER VALIDATION SCRIPT');
  console.log('============================================================');
  console.log(`Started at: ${new Date().toISOString()}`);
  if (shouldFix) console.log('🔧 FIX MODE ENABLED');
  if (tenantFilter) console.log(`📌 Filtering tenant: ${tenantFilter}`);
  if (providerFilter) console.log(`📌 Filtering provider: ${providerFilter}`);
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
        connectionName: 'folder-validation',
      });
      await redis.ping();
      console.log('✅ Redis connected\n');
    } catch {
      console.log('⚠️ Redis not available - skipping Redis checks\n');
      redis = null;
    }

    // Build where clauses
    const tenantWhere = tenantFilter ? `WHERE "tenantId" = '${tenantFilter}'` : '';
    const tenantWhereAnd = tenantFilter ? `AND "tenantId" = '${tenantFilter}'` : '';
    const providerWhereAnd = providerFilter ? `AND "providerId" = '${providerFilter}'` : '';
    const combinedWhereAnd = `${tenantWhereAnd} ${providerWhereAnd}`;

    // ============================================================
    // 1. BASIC FOLDER STATS
    // ============================================================
    console.log('============================================================');
    console.log('1. FOLDER STATISTICS');
    console.log('============================================================');

    const folderStats = await prisma.$queryRawUnsafe<
      { total: bigint; with_parent: bigint; root: bigint; system: bigint; custom: bigint }[]
    >(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE "parentId" IS NOT NULL) as with_parent,
        COUNT(*) FILTER (WHERE "parentId" IS NULL) as root,
        COUNT(*) FILTER (WHERE "specialUse" IS NOT NULL) as system,
        COUNT(*) FILTER (WHERE "specialUse" IS NULL) as custom
      FROM folders
      ${tenantWhere}
    `);

    const stats = folderStats[0];
    console.log(`  Total folders: ${stats.total}`);
    console.log(`  Root folders: ${stats.root}`);
    console.log(`  Nested folders: ${stats.with_parent}`);
    console.log(`  System folders (specialUse): ${stats.system}`);
    console.log(`  Custom folders: ${stats.custom}`);

    // Folders by tenant
    const foldersByTenant = await prisma.$queryRawUnsafe<
      { tenantId: string; cnt: bigint; providers: bigint }[]
    >(`
      SELECT "tenantId", COUNT(*) as cnt, COUNT(DISTINCT "providerId") as providers
      FROM folders
      ${tenantWhere}
      GROUP BY "tenantId"
      ORDER BY cnt DESC
    `);

    console.log('\n  Folders by tenant:');
    foldersByTenant.forEach((t) => {
      console.log(`    - ${t.tenantId}: ${t.cnt} folders, ${t.providers} providers`);
    });

    // Folders by provider
    const foldersByProvider = await prisma.$queryRawUnsafe<
      { providerId: string; email: string; cnt: bigint }[]
    >(`
      SELECT f."providerId", p.email, COUNT(*) as cnt
      FROM folders f
      JOIN provider_configs p ON f."providerId" = p.id
      ${tenantWhere}
      GROUP BY f."providerId", p.email
      ORDER BY cnt DESC
      LIMIT 10
    `);

    console.log('\n  Folders by provider (top 10):');
    foldersByProvider.forEach((p) => {
      console.log(`    - ${p.email}: ${p.cnt} folders`);
    });

    // SpecialUse distribution
    const specialUseStats = await prisma.$queryRawUnsafe<
      { specialUse: string | null; cnt: bigint }[]
    >(`
      SELECT "specialUse", COUNT(*) as cnt
      FROM folders
      ${tenantWhere}
      GROUP BY "specialUse"
      ORDER BY cnt DESC
    `);

    console.log('\n  SpecialUse distribution:');
    specialUseStats.forEach((s) => {
      console.log(`    - ${s.specialUse || '(custom)'}}: ${s.cnt}`);
    });

    // ============================================================
    // 2. TENANT ISOLATION CHECK
    // ============================================================
    console.log('\n============================================================');
    console.log('2. TENANT ISOLATION CHECK');
    console.log('============================================================');

    // Folders without valid tenant
    const foldersWithoutTenant = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`
      SELECT COUNT(*) as count FROM folders f
      WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = f."tenantId")
      ${combinedWhereAnd}
    `);
    log({
      category: 'isolation',
      check: 'Folders without valid tenant',
      status: Number(foldersWithoutTenant[0]?.count || 0) === 0 ? 'PASS' : 'FAIL',
      count: Number(foldersWithoutTenant[0]?.count || 0),
    });

    // Folders with provider from different tenant
    const crossTenantProviders = await prisma.$queryRawUnsafe<
      { id: string; tenantId: string; providerId: string; providerTenant: string }[]
    >(`
      SELECT f.id, f."tenantId", f."providerId", p."tenantId" as "providerTenant"
      FROM folders f
      JOIN provider_configs p ON f."providerId" = p.id
      WHERE f."tenantId" != p."tenantId"
      ${combinedWhereAnd}
    `);
    log({
      category: 'isolation',
      check: 'Folders with cross-tenant provider',
      status: crossTenantProviders.length === 0 ? 'PASS' : 'FAIL',
      count: crossTenantProviders.length,
      details: crossTenantProviders.length > 0 ? crossTenantProviders.slice(0, 5) : undefined,
    });

    // Cross-tenant parent references
    const crossTenantParents = await prisma.$queryRawUnsafe<
      { id: string; tenantId: string; parentId: string; parentTenant: string }[]
    >(`
      SELECT f.id, f."tenantId", f."parentId", p."tenantId" as "parentTenant"
      FROM folders f
      JOIN folders p ON f."parentId" = p.id
      WHERE f."tenantId" != p."tenantId"
      ${combinedWhereAnd}
    `);
    log({
      category: 'isolation',
      check: 'Cross-tenant parent references',
      status: crossTenantParents.length === 0 ? 'PASS' : 'FAIL',
      count: crossTenantParents.length,
      details: crossTenantParents.length > 0 ? crossTenantParents.slice(0, 5) : undefined,
    });

    // Cross-provider parent references
    const crossProviderParents = await prisma.$queryRawUnsafe<
      { id: string; providerId: string; parentId: string; parentProvider: string }[]
    >(`
      SELECT f.id, f."providerId", f."parentId", p."providerId" as "parentProvider"
      FROM folders f
      JOIN folders p ON f."parentId" = p.id
      WHERE f."providerId" != p."providerId"
      ${combinedWhereAnd}
    `);
    log({
      category: 'isolation',
      check: 'Cross-provider parent references',
      status: crossProviderParents.length === 0 ? 'PASS' : 'FAIL',
      count: crossProviderParents.length,
      details: crossProviderParents.length > 0 ? crossProviderParents.slice(0, 5) : undefined,
    });

    // ============================================================
    // 3. PROVIDER RELATIONSHIP CHECK
    // ============================================================
    console.log('\n============================================================');
    console.log('3. PROVIDER RELATIONSHIP CHECK');
    console.log('============================================================');

    // Folders with non-existent provider
    const orphanedProviders = await prisma.$queryRawUnsafe<
      { id: string; tenantId: string; providerId: string; name: string }[]
    >(`
      SELECT f.id, f."tenantId", f."providerId", f.name
      FROM folders f
      WHERE NOT EXISTS (SELECT 1 FROM provider_configs p WHERE p.id = f."providerId")
      ${combinedWhereAnd}
    `);
    log({
      category: 'provider',
      check: 'Folders with non-existent provider',
      status: orphanedProviders.length === 0 ? 'PASS' : 'FAIL',
      count: orphanedProviders.length,
      details: orphanedProviders.length > 0 ? orphanedProviders.slice(0, 10) : undefined,
    });

    // Folders with inactive provider
    const inactiveProviderFolders = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`
      SELECT COUNT(*) as count
      FROM folders f
      JOIN provider_configs p ON f."providerId" = p.id
      WHERE p."isActive" = false
      ${combinedWhereAnd}
    `);
    log({
      category: 'provider',
      check: 'Folders with inactive provider',
      status: 'PASS', // This is informational
      count: Number(inactiveProviderFolders[0]?.count || 0),
    });

    // ============================================================
    // 4. DUPLICATE PATH CHECK
    // ============================================================
    console.log('\n============================================================');
    console.log('4. DUPLICATE PATH CHECK');
    console.log('============================================================');

    // Duplicate paths within same provider (should never happen due to unique constraint)
    const duplicatePaths = await prisma.$queryRawUnsafe<
      { providerId: string; path: string; cnt: bigint }[]
    >(`
      SELECT "providerId", path, COUNT(*) as cnt
      FROM folders
      WHERE 1=1
      ${combinedWhereAnd}
      GROUP BY "providerId", path
      HAVING COUNT(*) > 1
    `);
    log({
      category: 'duplicates',
      check: 'Duplicate paths within same provider',
      status: duplicatePaths.length === 0 ? 'PASS' : 'FAIL',
      count: duplicatePaths.length,
      details: duplicatePaths.length > 0 ? duplicatePaths : undefined,
    });

    // Duplicate names within same parent
    const duplicateNames = await prisma.$queryRawUnsafe<
      { providerId: string; parentId: string | null; name: string; cnt: bigint }[]
    >(`
      SELECT "providerId", "parentId", name, COUNT(*) as cnt
      FROM folders
      WHERE 1=1
      ${combinedWhereAnd}
      GROUP BY "providerId", "parentId", name
      HAVING COUNT(*) > 1
    `);
    log({
      category: 'duplicates',
      check: 'Duplicate names within same parent',
      status: duplicateNames.length === 0 ? 'PASS' : 'WARN',
      count: duplicateNames.length,
      details: duplicateNames.length > 0 ? duplicateNames.slice(0, 10) : undefined,
    });

    // ============================================================
    // 5. ORPHANED REFERENCES CHECK
    // ============================================================
    console.log('\n============================================================');
    console.log('5. ORPHANED REFERENCES CHECK');
    console.log('============================================================');

    // Folders with non-existent parent
    const orphanedParents = await prisma.$queryRawUnsafe<
      { id: string; tenantId: string; name: string; path: string; parentId: string }[]
    >(`
      SELECT f.id, f."tenantId", f.name, f.path, f."parentId"
      FROM folders f
      WHERE f."parentId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM folders p WHERE p.id = f."parentId")
      ${combinedWhereAnd}
    `);

    if (orphanedParents.length > 0) {
      log({
        category: 'orphans',
        check: 'Folders with non-existent parent',
        status: shouldFix ? 'FIXED' : 'FAIL',
        count: orphanedParents.length,
        details: orphanedParents.slice(0, 10),
      });

      if (shouldFix) {
        console.log('     🔧 Fixing orphaned parent references...');
        for (const folder of orphanedParents) {
          await prisma.$executeRawUnsafe(
            `UPDATE folders SET "parentId" = NULL, level = 0 WHERE id = $1`,
            folder.id,
          );
          console.log(`       Fixed: ${folder.name} (set parentId to NULL)`);
        }
      }
    } else {
      log({
        category: 'orphans',
        check: 'Folders with non-existent parent',
        status: 'PASS',
        count: 0,
      });
    }

    // Emails with folder path that doesn't match any folder
    // Note: Email.folder is a string field, not a foreign key
    const orphanedEmailFolders = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`
      SELECT COUNT(*) as count FROM emails e
      WHERE NOT EXISTS (
        SELECT 1 FROM folders f
        WHERE f."providerId" = e."providerId"
        AND (f.path = e.folder OR UPPER(f."specialUse") = UPPER(e.folder) OR f.name = e.folder)
      )
    `);
    log({
      category: 'orphans',
      check: 'Emails with unmatched folder path',
      status: Number(orphanedEmailFolders[0]?.count || 0) === 0 ? 'PASS' : 'WARN',
      count: Number(orphanedEmailFolders[0]?.count || 0),
    });

    // ============================================================
    // 6. CIRCULAR REFERENCE CHECK
    // ============================================================
    console.log('\n============================================================');
    console.log('6. CIRCULAR REFERENCE CHECK');
    console.log('============================================================');

    // Get all folders with parents
    const foldersWithParents = await prisma.$queryRawUnsafe<
      { id: string; parentId: string; name: string; providerId: string }[]
    >(`
      SELECT id, "parentId", name, "providerId"
      FROM folders
      WHERE "parentId" IS NOT NULL
      ${combinedWhereAnd}
    `);

    const circularRefs: { folderId: string; chain: string[] }[] = [];

    for (const folder of foldersWithParents) {
      const visited = new Set<string>();
      let currentId: string | null = folder.id;
      const chain: string[] = [];

      while (currentId) {
        if (visited.has(currentId)) {
          circularRefs.push({ folderId: folder.id, chain: [...chain, currentId] });
          break;
        }
        visited.add(currentId);
        chain.push(currentId);

        const parent = foldersWithParents.find((f) => f.id === currentId);
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
    // 7. LEVEL CONSISTENCY CHECK
    // ============================================================
    console.log('\n============================================================');
    console.log('7. LEVEL CONSISTENCY CHECK');
    console.log('============================================================');

    // Folders with incorrect level
    const incorrectLevels = await prisma.$queryRawUnsafe<
      { id: string; name: string; level: number; parentLevel: number }[]
    >(`
      SELECT f.id, f.name, f.level, p.level as "parentLevel"
      FROM folders f
      JOIN folders p ON f."parentId" = p.id
      WHERE f.level != p.level + 1
      ${combinedWhereAnd}
    `);

    if (incorrectLevels.length > 0) {
      log({
        category: 'hierarchy',
        check: 'Folders with incorrect level',
        status: shouldFix ? 'FIXED' : 'WARN',
        count: incorrectLevels.length,
        details: incorrectLevels.slice(0, 10),
      });

      if (shouldFix) {
        console.log('     🔧 Fixing incorrect levels...');
        for (const folder of incorrectLevels) {
          const correctLevel = folder.parentLevel + 1;
          await prisma.$executeRawUnsafe(
            `UPDATE folders SET level = $1 WHERE id = $2`,
            correctLevel,
            folder.id,
          );
          console.log(`       Fixed: ${folder.name} level ${folder.level} -> ${correctLevel}`);
        }
      }
    } else {
      log({
        category: 'hierarchy',
        check: 'Folders with incorrect level',
        status: 'PASS',
        count: 0,
      });
    }

    // Root folders with non-zero level
    const rootNonZeroLevel = await prisma.$queryRawUnsafe<
      { id: string; name: string; level: number }[]
    >(`
      SELECT id, name, level
      FROM folders
      WHERE "parentId" IS NULL
      AND level != 0
      ${combinedWhereAnd}
    `);

    if (rootNonZeroLevel.length > 0) {
      log({
        category: 'hierarchy',
        check: 'Root folders with non-zero level',
        status: shouldFix ? 'FIXED' : 'WARN',
        count: rootNonZeroLevel.length,
        details: rootNonZeroLevel.slice(0, 10),
      });

      if (shouldFix) {
        console.log('     🔧 Fixing root folder levels...');
        await prisma.$executeRawUnsafe(`
          UPDATE folders
          SET level = 0
          WHERE "parentId" IS NULL AND level != 0
        `);
        console.log(`       Fixed ${rootNonZeroLevel.length} root folders`);
      }
    } else {
      log({
        category: 'hierarchy',
        check: 'Root folders with non-zero level',
        status: 'PASS',
        count: 0,
      });
    }

    // ============================================================
    // 8. PATH CONSISTENCY CHECK
    // ============================================================
    console.log('\n============================================================');
    console.log('8. PATH CONSISTENCY CHECK');
    console.log('============================================================');

    // Folders with empty path
    const emptyPaths = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`
      SELECT COUNT(*) as count FROM folders
      WHERE path IS NULL OR path = '' OR TRIM(path) = ''
      ${combinedWhereAnd}
    `);
    log({
      category: 'path',
      check: 'Folders with empty path',
      status: Number(emptyPaths[0]?.count || 0) === 0 ? 'PASS' : 'FAIL',
      count: Number(emptyPaths[0]?.count || 0),
    });

    // Folders with empty name
    const emptyNames = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`
      SELECT COUNT(*) as count FROM folders
      WHERE name IS NULL OR name = '' OR TRIM(name) = ''
      ${combinedWhereAnd}
    `);
    log({
      category: 'path',
      check: 'Folders with empty name',
      status: Number(emptyNames[0]?.count || 0) === 0 ? 'PASS' : 'FAIL',
      count: Number(emptyNames[0]?.count || 0),
    });

    // Check if path ends with folder name (basic consistency)
    const pathNameMismatch = await prisma.$queryRawUnsafe<
      { id: string; name: string; path: string }[]
    >(`
      SELECT id, name, path
      FROM folders
      WHERE NOT (
        path = name
        OR path LIKE '%/' || name
        OR path LIKE '%' || delimiter || name
      )
      ${combinedWhereAnd}
      LIMIT 20
    `);
    log({
      category: 'path',
      check: 'Folders where path doesn\'t end with name',
      status: pathNameMismatch.length === 0 ? 'PASS' : 'WARN',
      count: pathNameMismatch.length,
      details: pathNameMismatch.length > 0 ? pathNameMismatch.slice(0, 5) : undefined,
    });

    // ============================================================
    // 9. SPECIALUSE VALIDATION
    // ============================================================
    console.log('\n============================================================');
    console.log('9. SPECIALUSE VALIDATION');
    console.log('============================================================');

    // Valid specialUse values - Complete list from:
    // 1. IMAP RFC 6154 special-use flags: \All, \Archive, \Drafts, \Flagged, \Junk, \Sent, \Trash
    // 2. IMAP RFC 8457: \Important
    // 3. Microsoft Graph API wellKnownName: https://learn.microsoft.com/en-us/graph/api/resources/mailfolder
    // 4. Gmail API system labels: https://developers.google.com/workspace/gmail/api/guides/labels
    const validSpecialUses = [
      // IMAP RFC 6154 standard special-use flags
      'INBOX', 'SENT', 'DRAFTS', 'TRASH', 'JUNK', 'ARCHIVE', 'ALL', 'FLAGGED',
      // IMAP RFC 8457 - Important
      'IMPORTANT',
      // Common aliases/variants
      'SPAM', 'STARRED', 'SCHEDULED', 'SNOOZED',
      // Microsoft Graph API wellKnownName values (lowercase in API, uppercase here)
      'OUTBOX',
      'CONVERSATIONHISTORY', 'CONVERSATION HISTORY',  // Skype/Teams IM history
      'DELETEDITEMS', 'DELETED ITEMS',                 // Trash alias
      'SENTITEMS', 'SENT ITEMS',                       // Sent alias
      'JUNKEMAIL', 'JUNK EMAIL',                       // Spam alias
      'CLUTTER',                                       // Low-priority messages
      'CONFLICTS',                                     // Sync conflicts
      'LOCALFAILURES', 'LOCAL FAILURES',               // Local sync failures
      'SERVERFAILURES', 'SERVER FAILURES',             // Server sync failures
      'SYNCISSUES', 'SYNC ISSUES',                     // Sync logs
      'RECOVERABLEITEMSDELETIONS',                     // Soft-deleted items
      'MSGFOLDERROOT',                                 // Root folder
      'SEARCHFOLDERS',                                 // Search folder parent
      // Gmail API system labels
      'DRAFT',                                         // Gmail uses DRAFT not DRAFTS
      'UNREAD',                                        // Gmail unread label
      'CHAT',                                          // Gmail chat messages
      'CATEGORY_PERSONAL',                             // Gmail category
      'CATEGORY_SOCIAL',                               // Gmail category
      'CATEGORY_PROMOTIONS',                           // Gmail category
      'CATEGORY_UPDATES',                              // Gmail category
      'CATEGORY_FORUMS',                               // Gmail category
    ];

    // Invalid specialUse values
    const invalidSpecialUse = await prisma.$queryRawUnsafe<
      { id: string; name: string; specialUse: string }[]
    >(`
      SELECT id, name, "specialUse"
      FROM folders
      WHERE "specialUse" IS NOT NULL
      AND UPPER("specialUse") NOT IN (${validSpecialUses.map((s) => `'${s}'`).join(', ')})
      ${combinedWhereAnd}
    `);
    log({
      category: 'specialUse',
      check: 'Folders with invalid specialUse value',
      status: invalidSpecialUse.length === 0 ? 'PASS' : 'WARN',
      count: invalidSpecialUse.length,
      details: invalidSpecialUse.length > 0 ? invalidSpecialUse : undefined,
    });

    // Duplicate specialUse per provider (e.g., two INBOX folders)
    const duplicateSpecialUse = await prisma.$queryRawUnsafe<
      { providerId: string; specialUse: string; cnt: bigint }[]
    >(`
      SELECT "providerId", "specialUse", COUNT(*) as cnt
      FROM folders
      WHERE "specialUse" IS NOT NULL
      ${combinedWhereAnd}
      GROUP BY "providerId", "specialUse"
      HAVING COUNT(*) > 1
    `);
    log({
      category: 'specialUse',
      check: 'Duplicate specialUse per provider',
      status: duplicateSpecialUse.length === 0 ? 'PASS' : 'WARN',
      count: duplicateSpecialUse.length,
      details: duplicateSpecialUse.length > 0 ? duplicateSpecialUse : undefined,
    });

    // Providers missing essential folders (INBOX)
    const providersMissingInbox = await prisma.$queryRawUnsafe<
      { providerId: string; email: string }[]
    >(`
      SELECT p.id as "providerId", p.email
      FROM provider_configs p
      WHERE p."isActive" = true
      AND NOT EXISTS (
        SELECT 1 FROM folders f
        WHERE f."providerId" = p.id
        AND UPPER(f."specialUse") = 'INBOX'
      )
      ${providerFilter ? `AND p.id = '${providerFilter}'` : ''}
    `);
    log({
      category: 'specialUse',
      check: 'Active providers missing INBOX folder',
      status: providersMissingInbox.length === 0 ? 'PASS' : 'WARN',
      count: providersMissingInbox.length,
      details: providersMissingInbox.length > 0 ? providersMissingInbox : undefined,
    });

    // ============================================================
    // 10. REDIS CACHE CHECK
    // ============================================================
    console.log('\n============================================================');
    console.log('10. REDIS CACHE CHECK');
    console.log('============================================================');

    if (redis) {
      // Check for folder-related cache keys
      const folderCacheKeys = await redis.keys('*folder*');
      log({
        category: 'redis',
        check: 'Folder-related cache keys in Redis',
        status: 'PASS',
        count: folderCacheKeys.length,
        details: folderCacheKeys.length > 0 ? folderCacheKeys.slice(0, 10) : undefined,
      });

      // Check for tenant-specific folder caches
      console.log('\n  Tenant folder cache distribution:');
      for (const tenant of foldersByTenant.slice(0, 5)) {
        const tenantFolderKeys = await redis.keys(`*${tenant.tenantId}*folder*`);
        console.log(`    Tenant ${tenant.tenantId.substring(0, 8)}...: ${tenantFolderKeys.length} cache keys`);
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
    // 11. BULLMQ QUEUE CHECK
    // ============================================================
    console.log('\n============================================================');
    console.log('11. BULLMQ QUEUE CHECK');
    console.log('============================================================');

    if (redis) {
      // Check for BullMQ queues
      const bullQueues = await redis.keys('bull:*');
      const queueNames = [...new Set(bullQueues.map((k) => k.split(':')[1]))];

      console.log(`  Found ${queueNames.length} BullMQ queues`);

      // Check for folder-related queues
      const folderQueues = queueNames.filter((q) => q?.toLowerCase().includes('folder'));
      if (folderQueues.length > 0) {
        log({
          category: 'bullmq',
          check: 'Folder-related BullMQ queues',
          status: 'PASS',
          count: folderQueues.length,
          details: folderQueues,
        });

        // Check each folder queue status
        for (const queueName of folderQueues) {
          if (!queueName) continue;
          const waiting = await redis.llen(`bull:${queueName}:wait`);
          const active = await redis.llen(`bull:${queueName}:active`);
          const completed = await redis.zcard(`bull:${queueName}:completed`);
          const failed = await redis.zcard(`bull:${queueName}:failed`);
          console.log(`    ${queueName}: waiting=${waiting}, active=${active}, completed=${completed}, failed=${failed}`);
        }
      }

      // Check dead letter queue for folder-related jobs
      const dlqJobs = await redis.lrange('bull:dead-letter-queue:failed', 0, 50);
      const folderDlqJobs = dlqJobs.filter((j) => j.toLowerCase().includes('folder'));
      log({
        category: 'bullmq',
        check: 'Folder-related jobs in dead-letter queue',
        status: folderDlqJobs.length === 0 ? 'PASS' : 'WARN',
        count: folderDlqJobs.length,
      });
    } else {
      log({
        category: 'bullmq',
        check: 'BullMQ queue check',
        status: 'WARN',
        details: 'Redis not available',
      });
    }

    // ============================================================
    // 12. SYNC STATUS CHECK
    // ============================================================
    console.log('\n============================================================');
    console.log('12. SYNC STATUS CHECK');
    console.log('============================================================');

    // Folders never synced
    const neverSynced = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`
      SELECT COUNT(*) as count FROM folders
      WHERE "lastSyncedAt" IS NULL
      ${combinedWhereAnd}
    `);
    log({
      category: 'sync',
      check: 'Folders never synced',
      status: 'PASS', // Informational
      count: Number(neverSynced[0]?.count || 0),
    });

    // Folders with stale sync (>7 days)
    const staleSynced = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`
      SELECT COUNT(*) as count FROM folders f
      JOIN provider_configs p ON f."providerId" = p.id
      WHERE p."isActive" = true
      AND f."lastSyncedAt" < NOW() - INTERVAL '7 days'
      ${combinedWhereAnd}
    `);
    log({
      category: 'sync',
      check: 'Active folders with stale sync (>7 days)',
      status: Number(staleSynced[0]?.count || 0) === 0 ? 'PASS' : 'WARN',
      count: Number(staleSynced[0]?.count || 0),
    });

    // Folders with invalid uidValidity
    const invalidUidValidity = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`
      SELECT COUNT(*) as count FROM folders
      WHERE "uidValidity" IS NOT NULL
      AND "uidValidity" !~ '^[0-9]+$'
      ${combinedWhereAnd}
    `);
    log({
      category: 'sync',
      check: 'Folders with invalid uidValidity format',
      status: Number(invalidUidValidity[0]?.count || 0) === 0 ? 'PASS' : 'WARN',
      count: Number(invalidUidValidity[0]?.count || 0),
    });

    // ============================================================
    // 13. EMAIL COUNT CONSISTENCY
    // ============================================================
    console.log('\n============================================================');
    console.log('13. EMAIL COUNT CONSISTENCY');
    console.log('============================================================');

    // Check if totalCount matches actual email count
    // Note: emails.folder is a string, match by path or specialUse
    // Using a CTE to compute actual counts
    const countMismatch = await prisma.$queryRawUnsafe<
      { id: string; name: string; totalCount: number; actualCount: bigint }[]
    >(`
      WITH folder_counts AS (
        SELECT f.id, f.name, f."totalCount", f."providerId", f.path, f."specialUse",
          (SELECT COUNT(*) FROM emails e
           WHERE e."providerId" = f."providerId"
           AND (e.folder = f.path OR UPPER(e.folder) = UPPER(COALESCE(f."specialUse", '')) OR e.folder = f.name)
          ) as "actualCount"
        FROM folders f
        ${tenantWhere}
      )
      SELECT id, name, "totalCount", "actualCount"
      FROM folder_counts
      WHERE "totalCount" != "actualCount"
      LIMIT 20
    `);
    log({
      category: 'counts',
      check: 'Folders with mismatched totalCount',
      status: countMismatch.length === 0 ? 'PASS' : 'WARN',
      count: countMismatch.length,
      details: countMismatch.length > 0 ? countMismatch.slice(0, 5) : undefined,
    });

    // Check unread count consistency
    const unreadMismatch = await prisma.$queryRawUnsafe<
      { id: string; name: string; unreadCount: number; actualUnread: bigint }[]
    >(`
      WITH folder_unread AS (
        SELECT f.id, f.name, f."unreadCount", f."providerId", f.path, f."specialUse",
          (SELECT COUNT(*) FROM emails e
           WHERE e."providerId" = f."providerId"
           AND (e.folder = f.path OR UPPER(e.folder) = UPPER(COALESCE(f."specialUse", '')) OR e.folder = f.name)
           AND e."isRead" = false
          ) as "actualUnread"
        FROM folders f
        ${tenantWhere}
      )
      SELECT id, name, "unreadCount", "actualUnread"
      FROM folder_unread
      WHERE "unreadCount" != "actualUnread"
      LIMIT 20
    `);
    log({
      category: 'counts',
      check: 'Folders with mismatched unreadCount',
      status: unreadMismatch.length === 0 ? 'PASS' : 'WARN',
      count: unreadMismatch.length,
      details: unreadMismatch.length > 0 ? unreadMismatch.slice(0, 5) : undefined,
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
