/**
 * Database Integrity Audit Script
 * Checks for orphans, duplicates, mismatches across all tables
 * Run with: npx ts-node scripts/audit-database-integrity.ts
 *
 * NOTE: Tables use snake_case (via @@map), columns use camelCase (Prisma default)
 */

import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

interface AuditResult {
  category: string;
  check: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  count?: number;
  details?: any;
}

const results: AuditResult[] = [];

function log(result: AuditResult) {
  results.push(result);
  const icon = result.status === 'PASS' ? '✅' : result.status === 'WARN' ? '⚠️' : '❌';
  console.log(`  ${icon} ${result.check}: ${result.status}${result.count !== undefined ? ` (${result.count})` : ''}`);
  if (result.details && result.status !== 'PASS') {
    console.log(`     Details: ${JSON.stringify(result.details).substring(0, 200)}`);
  }
}

async function main() {
  console.log('============================================================');
  console.log('DATABASE INTEGRITY AUDIT');
  console.log('============================================================');
  console.log(`Started at: ${new Date().toISOString()}\n`);

  const prisma = createPrismaClient();

  try {
    // ============================================================
    // 1. ORPHANED RECORDS CHECK (using raw SQL)
    // ============================================================
    console.log('============================================================');
    console.log('1. ORPHANED RECORDS CHECK');
    console.log('============================================================');

    // Emails without valid provider
    const orphanedEmails = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM emails e
      WHERE NOT EXISTS (SELECT 1 FROM provider_configs p WHERE p.id = e."providerId")
    `;
    log({
      category: 'orphans',
      check: 'Emails without valid provider',
      status: Number(orphanedEmails[0]?.count || 0) === 0 ? 'PASS' : 'FAIL',
      count: Number(orphanedEmails[0]?.count || 0),
    });

    // Emails without valid tenant
    const emailsWithoutTenant = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM emails e
      WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = e."tenantId")
    `;
    log({
      category: 'orphans',
      check: 'Emails without valid tenant',
      status: Number(emailsWithoutTenant[0]?.count || 0) === 0 ? 'PASS' : 'FAIL',
      count: Number(emailsWithoutTenant[0]?.count || 0),
    });

    // Email attachments without email
    const orphanedAttachments = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM email_attachments a
      WHERE NOT EXISTS (SELECT 1 FROM emails e WHERE e.id = a."emailId")
    `;
    log({
      category: 'orphans',
      check: 'Email attachments without email',
      status: Number(orphanedAttachments[0]?.count || 0) === 0 ? 'PASS' : 'FAIL',
      count: Number(orphanedAttachments[0]?.count || 0),
    });

    // Calendar events without provider
    const orphanedCalEvents = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM calendar_events c
      WHERE NOT EXISTS (SELECT 1 FROM provider_configs p WHERE p.id = c."providerId")
    `;
    log({
      category: 'orphans',
      check: 'Calendar events without provider',
      status: Number(orphanedCalEvents[0]?.count || 0) === 0 ? 'PASS' : 'FAIL',
      count: Number(orphanedCalEvents[0]?.count || 0),
    });

    // Contacts without tenant
    const orphanedContacts = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM unified_contacts c
      WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = c."tenantId")
    `;
    log({
      category: 'orphans',
      check: 'Contacts without tenant',
      status: Number(orphanedContacts[0]?.count || 0) === 0 ? 'PASS' : 'FAIL',
      count: Number(orphanedContacts[0]?.count || 0),
    });

    // Provider contacts without contact
    const orphanedProviderContacts = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM provider_contacts pc
      WHERE NOT EXISTS (SELECT 1 FROM unified_contacts c WHERE c.id = pc."contactId")
    `;
    log({
      category: 'orphans',
      check: 'Provider contacts without contact',
      status: Number(orphanedProviderContacts[0]?.count || 0) === 0 ? 'PASS' : 'FAIL',
      count: Number(orphanedProviderContacts[0]?.count || 0),
    });

    // Provider contacts without provider
    const providerContactsWithoutProvider = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM provider_contacts pc
      WHERE NOT EXISTS (SELECT 1 FROM provider_configs p WHERE p.id = pc."providerId")
    `;
    log({
      category: 'orphans',
      check: 'Provider contacts without provider',
      status: Number(providerContactsWithoutProvider[0]?.count || 0) === 0 ? 'PASS' : 'FAIL',
      count: Number(providerContactsWithoutProvider[0]?.count || 0),
    });

    // Folders without provider
    const orphanedFolders = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM folders f
      WHERE NOT EXISTS (SELECT 1 FROM provider_configs p WHERE p.id = f."providerId")
    `;
    log({
      category: 'orphans',
      check: 'Folders without provider',
      status: Number(orphanedFolders[0]?.count || 0) === 0 ? 'PASS' : 'FAIL',
      count: Number(orphanedFolders[0]?.count || 0),
    });

    // ============================================================
    // 2. DUPLICATE RECORDS CHECK
    // ============================================================
    console.log('\n============================================================');
    console.log('2. DUPLICATE RECORDS CHECK');
    console.log('============================================================');

    // Duplicate emails (same externalId + providerId + folder)
    const duplicateEmails = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM (
        SELECT "externalId", "providerId", folder
        FROM emails
        WHERE "externalId" IS NOT NULL
        GROUP BY "externalId", "providerId", folder
        HAVING COUNT(*) > 1
      ) as dups
    `;
    log({
      category: 'duplicates',
      check: 'Duplicate emails (same externalId + providerId + folder)',
      status: Number(duplicateEmails[0]?.count || 0) === 0 ? 'PASS' : 'FAIL',
      count: Number(duplicateEmails[0]?.count || 0),
    });

    // Duplicate messageIds in same folder (potential confusion)
    const duplicateMessageIds = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM (
        SELECT "messageId", "tenantId", folder
        FROM emails
        WHERE "messageId" IS NOT NULL
        GROUP BY "messageId", "tenantId", folder
        HAVING COUNT(*) > 1
      ) as dups
    `;
    log({
      category: 'duplicates',
      check: 'Duplicate messageIds (same tenant + folder)',
      status: Number(duplicateMessageIds[0]?.count || 0) === 0 ? 'PASS' : 'WARN',
      count: Number(duplicateMessageIds[0]?.count || 0),
    });

    // Show duplicate email details if any
    if (Number(duplicateEmails[0]?.count || 0) > 0 || Number(duplicateMessageIds[0]?.count || 0) > 0) {
      const dupDetails = await prisma.$queryRaw<any[]>`
        SELECT "externalId", "providerId", folder, COUNT(*) as cnt
        FROM emails
        WHERE "externalId" IS NOT NULL
        GROUP BY "externalId", "providerId", folder
        HAVING COUNT(*) > 1
        LIMIT 10
      `;
      console.log('     Duplicate email samples:');
      dupDetails.forEach((d) => {
        console.log(`       - externalId=${d.externalId?.substring(0, 20)}... folder=${d.folder} count=${d.cnt}`);
      });
    }

    // Duplicate calendar events
    const duplicateCalEvents = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM (
        SELECT "externalId", "providerId"
        FROM calendar_events
        WHERE "externalId" IS NOT NULL
        GROUP BY "externalId", "providerId"
        HAVING COUNT(*) > 1
      ) as dups
    `;
    log({
      category: 'duplicates',
      check: 'Duplicate calendar events',
      status: Number(duplicateCalEvents[0]?.count || 0) === 0 ? 'PASS' : 'FAIL',
      count: Number(duplicateCalEvents[0]?.count || 0),
    });

    // Duplicate folders (same path + providerId)
    const duplicateFolders = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM (
        SELECT path, "providerId"
        FROM folders
        GROUP BY path, "providerId"
        HAVING COUNT(*) > 1
      ) as dups
    `;
    log({
      category: 'duplicates',
      check: 'Duplicate folders (same path + provider)',
      status: Number(duplicateFolders[0]?.count || 0) === 0 ? 'PASS' : 'FAIL',
      count: Number(duplicateFolders[0]?.count || 0),
    });

    // ============================================================
    // 3. DATA CONSISTENCY CHECK
    // ============================================================
    console.log('\n============================================================');
    console.log('3. DATA CONSISTENCY CHECK');
    console.log('============================================================');

    // Deleted emails with S3 attachments (potential orphans)
    const deletedEmailsWithS3 = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT e.id) as count
      FROM emails e
      JOIN email_attachments a ON e.id = a."emailId"
      WHERE e."isDeleted" = true
      AND a."storageType" = 's3'
      AND a."storagePath" IS NOT NULL
    `;
    log({
      category: 'consistency',
      check: 'Deleted emails still have S3 attachments',
      status: Number(deletedEmailsWithS3[0]?.count || 0) === 0 ? 'PASS' : 'WARN',
      count: Number(deletedEmailsWithS3[0]?.count || 0),
    });

    // Providers without tenant
    const providersWithoutTenant = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM provider_configs p
      WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = p."tenantId")
    `;
    log({
      category: 'consistency',
      check: 'Providers without tenant',
      status: Number(providersWithoutTenant[0]?.count || 0) === 0 ? 'PASS' : 'FAIL',
      count: Number(providersWithoutTenant[0]?.count || 0),
    });

    // Users without tenant
    const usersWithoutTenant = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM users u
      WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = u."tenantId")
    `;
    log({
      category: 'consistency',
      check: 'Users without tenant',
      status: Number(usersWithoutTenant[0]?.count || 0) === 0 ? 'PASS' : 'FAIL',
      count: Number(usersWithoutTenant[0]?.count || 0),
    });

    // ============================================================
    // 4. S3 STORAGE CHECK
    // ============================================================
    console.log('\n============================================================');
    console.log('4. S3 STORAGE CHECK');
    console.log('============================================================');

    // Total S3 attachments
    const totalS3Attachments = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM email_attachments
      WHERE "storageType" = 's3' AND "storagePath" IS NOT NULL
    `;
    log({
      category: 's3',
      check: 'Total S3 attachments in DB',
      status: 'PASS',
      count: Number(totalS3Attachments[0]?.count || 0),
    });

    // S3 attachments for deleted emails
    const s3ForDeletedEmails = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM email_attachments a
      JOIN emails e ON a."emailId" = e.id
      WHERE a."storageType" = 's3'
      AND a."storagePath" IS NOT NULL
      AND e."isDeleted" = true
    `;
    log({
      category: 's3',
      check: 'S3 attachments for deleted emails (potential orphans)',
      status: Number(s3ForDeletedEmails[0]?.count || 0) === 0 ? 'PASS' : 'WARN',
      count: Number(s3ForDeletedEmails[0]?.count || 0),
    });

    // ============================================================
    // 5. EMBEDDING CHECK
    // ============================================================
    console.log('\n============================================================');
    console.log('5. EMBEDDING CHECK');
    console.log('============================================================');

    // Total embeddings
    const totalEmbeddings = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM embeddings
    `;
    log({
      category: 'embeddings',
      check: 'Total embeddings',
      status: 'PASS',
      count: Number(totalEmbeddings[0]?.count || 0),
    });

    // Embeddings without valid tenant
    const orphanedEmbeddings = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM embeddings em
      WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = em."tenantId")
    `;
    log({
      category: 'embeddings',
      check: 'Orphaned embeddings (invalid tenant)',
      status: Number(orphanedEmbeddings[0]?.count || 0) === 0 ? 'PASS' : 'WARN',
      count: Number(orphanedEmbeddings[0]?.count || 0),
    });

    // Check embedding distribution by tenant
    const embeddingsByTenant = await prisma.$queryRaw<any[]>`
      SELECT "tenantId", COUNT(*) as cnt
      FROM embeddings
      GROUP BY "tenantId"
    `;
    console.log('     Embeddings by tenant:');
    embeddingsByTenant.forEach((e) => {
      console.log(`       - ${e.tenantId}: ${e.cnt} embeddings`);
    });

    // ============================================================
    // 6. PROVIDER SYNC STATE CHECK
    // ============================================================
    console.log('\n============================================================');
    console.log('6. PROVIDER SYNC STATE CHECK');
    console.log('============================================================');

    const providers = await prisma.$queryRaw<any[]>`
      SELECT id, email, "providerType", "lastSyncedAt", "isActive",
             metadata->>'historyId' as "historyId",
             metadata->>'deltaLink' as "deltaLink"
      FROM provider_configs
      WHERE "isActive" = true
    `;

    for (const provider of providers) {
      const emailCount = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM emails
        WHERE "providerId" = ${provider.id} AND "isDeleted" = false
      `;
      const folderCount = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM folders
        WHERE "providerId" = ${provider.id}
      `;
      const calendarCount = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM calendar_events
        WHERE "providerId" = ${provider.id}
      `;

      const hasSyncToken = provider.providerType === 'google'
        ? !!provider.historyId
        : !!provider.deltaLink;

      log({
        category: 'sync',
        check: `${provider.email} (${provider.providerType})`,
        status: hasSyncToken || provider.providerType === 'imap' ? 'PASS' : 'WARN',
        details: {
          emails: Number(emailCount[0]?.count || 0),
          folders: Number(folderCount[0]?.count || 0),
          calendarEvents: Number(calendarCount[0]?.count || 0),
          lastSync: provider.lastSyncedAt || 'never',
          hasSyncToken,
        },
      });
    }

    // ============================================================
    // 7. TENANT ISOLATION CHECK
    // ============================================================
    console.log('\n============================================================');
    console.log('7. TENANT ISOLATION CHECK');
    console.log('============================================================');

    // Cross-tenant emails
    const crossTenantEmails = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM emails e
      JOIN provider_configs p ON e."providerId" = p.id
      WHERE e."tenantId" != p."tenantId"
    `;
    log({
      category: 'isolation',
      check: 'Emails with mismatched tenant (cross-tenant leak)',
      status: Number(crossTenantEmails[0]?.count || 0) === 0 ? 'PASS' : 'FAIL',
      count: Number(crossTenantEmails[0]?.count || 0),
    });

    // Cross-tenant calendar events
    const crossTenantCalEvents = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM calendar_events c
      JOIN provider_configs p ON c."providerId" = p.id
      WHERE c."tenantId" != p."tenantId"
    `;
    log({
      category: 'isolation',
      check: 'Calendar events with mismatched tenant',
      status: Number(crossTenantCalEvents[0]?.count || 0) === 0 ? 'PASS' : 'FAIL',
      count: Number(crossTenantCalEvents[0]?.count || 0),
    });

    // ============================================================
    // 8. COUNT SUMMARY
    // ============================================================
    console.log('\n============================================================');
    console.log('8. DATABASE COUNTS SUMMARY');
    console.log('============================================================');

    const counts = await prisma.$queryRaw<any[]>`
      SELECT
        (SELECT COUNT(*) FROM tenants) as tenants,
        (SELECT COUNT(*) FROM users) as users,
        (SELECT COUNT(*) FROM provider_configs) as providers,
        (SELECT COUNT(*) FROM emails) as emails,
        (SELECT COUNT(*) FROM emails WHERE "isDeleted" = false) as active_emails,
        (SELECT COUNT(*) FROM email_attachments) as attachments,
        (SELECT COUNT(*) FROM folders) as folders,
        (SELECT COUNT(*) FROM unified_contacts) as contacts,
        (SELECT COUNT(*) FROM calendar_events) as calendar_events,
        (SELECT COUNT(*) FROM embeddings) as embeddings
    `;

    const c = counts[0];
    console.log(`  Tenants: ${c.tenants}`);
    console.log(`  Users: ${c.users}`);
    console.log(`  Providers: ${c.providers}`);
    console.log(`  Emails (total): ${c.emails}`);
    console.log(`  Emails (active): ${c.active_emails}`);
    console.log(`  Attachments: ${c.attachments}`);
    console.log(`  Folders: ${c.folders}`);
    console.log(`  Contacts: ${c.contacts}`);
    console.log(`  Calendar Events: ${c.calendar_events}`);
    console.log(`  Embeddings: ${c.embeddings}`);

    // ============================================================
    // SUMMARY
    // ============================================================
    console.log('\n============================================================');
    console.log('AUDIT SUMMARY');
    console.log('============================================================');

    const passed = results.filter((r) => r.status === 'PASS').length;
    const warnings = results.filter((r) => r.status === 'WARN').length;
    const failed = results.filter((r) => r.status === 'FAIL').length;

    console.log(`\nTotal Checks: ${results.length}`);
    console.log(`  ✅ Passed: ${passed}`);
    console.log(`  ⚠️  Warnings: ${warnings}`);
    console.log(`  ❌ Failed: ${failed}`);

    if (failed > 0) {
      console.log('\n❌ FAILED CHECKS:');
      results
        .filter((r) => r.status === 'FAIL')
        .forEach((r) => {
          console.log(`  - ${r.check}: ${r.count || ''}`);
        });
    }

    if (warnings > 0) {
      console.log('\n⚠️  WARNING CHECKS:');
      results
        .filter((r) => r.status === 'WARN')
        .forEach((r) => {
          console.log(`  - ${r.check}: ${r.count !== undefined ? r.count : JSON.stringify(r.details).substring(0, 100)}`);
        });
    }

    console.log(`\n============================================================`);
    console.log(`Completed at: ${new Date().toISOString()}`);
    console.log('============================================================');

    process.exit(failed > 0 ? 1 : 0);
  } catch (error: any) {
    console.error('Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
