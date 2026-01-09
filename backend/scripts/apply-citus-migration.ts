/**
 * Apply Citus Migration Manually
 *
 * The Prisma migration was marked as done but SQL didn't execute.
 * This script applies the SQL directly.
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import * as fs from 'fs';
import * as path from 'path';

const prisma = createPrismaClient();

async function main() {
  console.log('=== CITUS MIGRATION MANUAL APPLY ===\n');

  // Step 1: Check current state
  console.log('1. Checking current state...');
  const tables = ['user_preferences', 'email_attachments', 'email_labels', 'mfa_secrets', 'calendar_sync_state'];
  let needsMigration = false;

  for (const table of tables) {
    const cols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = '${table}' AND column_name = 'tenantId'`
    );
    const hasTenant = cols.length > 0;
    console.log(`   ${table}: tenantId = ${hasTenant ? '✅' : '❌ MISSING'}`);
    if (!hasTenant) needsMigration = true;
  }

  if (!needsMigration) {
    console.log('\n✅ All tables already have tenantId. No migration needed.');
    await prisma.$disconnect();
    return;
  }

  // Step 2: Apply Phase 1 SQL (add tenantId columns)
  console.log('\n2. Applying Phase 1: Add tenantId columns...');

  const phase1Statements = [
    // UserPreferences
    `ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "tenantId" TEXT`,
    `UPDATE "user_preferences" up SET "tenantId" = u."tenantId" FROM "users" u WHERE up."userId" = u."id" AND up."tenantId" IS NULL`,
    `ALTER TABLE "user_preferences" ALTER COLUMN "tenantId" SET NOT NULL`,
    `CREATE INDEX IF NOT EXISTS "user_preferences_tenantId_idx" ON "user_preferences"("tenantId")`,

    // DashboardPreference
    `ALTER TABLE "dashboard_preferences" ADD COLUMN IF NOT EXISTS "tenantId" TEXT`,
    `UPDATE "dashboard_preferences" dp SET "tenantId" = u."tenantId" FROM "users" u WHERE dp."userId" = u."id" AND dp."tenantId" IS NULL`,
    `ALTER TABLE "dashboard_preferences" ALTER COLUMN "tenantId" SET NOT NULL`,
    `CREATE INDEX IF NOT EXISTS "dashboard_preferences_tenantId_idx" ON "dashboard_preferences"("tenantId")`,

    // MfaSecret
    `ALTER TABLE "mfa_secrets" ADD COLUMN IF NOT EXISTS "tenantId" TEXT`,
    `UPDATE "mfa_secrets" ms SET "tenantId" = u."tenantId" FROM "users" u WHERE ms."userId" = u."id" AND ms."tenantId" IS NULL`,
    `ALTER TABLE "mfa_secrets" ALTER COLUMN "tenantId" SET NOT NULL`,
    `CREATE INDEX IF NOT EXISTS "mfa_secrets_tenantId_idx" ON "mfa_secrets"("tenantId")`,

    // MfaBackupCode
    `ALTER TABLE "mfa_backup_codes" ADD COLUMN IF NOT EXISTS "tenantId" TEXT`,
    `UPDATE "mfa_backup_codes" mbc SET "tenantId" = u."tenantId" FROM "users" u WHERE mbc."userId" = u."id" AND mbc."tenantId" IS NULL`,
    `ALTER TABLE "mfa_backup_codes" ALTER COLUMN "tenantId" SET NOT NULL`,
    `CREATE INDEX IF NOT EXISTS "mfa_backup_codes_tenantId_idx" ON "mfa_backup_codes"("tenantId")`,

    // EmailLabel
    `ALTER TABLE "email_labels" ADD COLUMN IF NOT EXISTS "tenantId" TEXT`,
    `UPDATE "email_labels" el SET "tenantId" = e."tenantId" FROM "emails" e WHERE el."emailId" = e."id" AND el."tenantId" IS NULL`,
    `ALTER TABLE "email_labels" ALTER COLUMN "tenantId" SET NOT NULL`,
    `CREATE INDEX IF NOT EXISTS "email_labels_tenantId_idx" ON "email_labels"("tenantId")`,

    // EmailAttachment
    `ALTER TABLE "email_attachments" ADD COLUMN IF NOT EXISTS "tenantId" TEXT`,
    `UPDATE "email_attachments" ea SET "tenantId" = e."tenantId" FROM "emails" e WHERE ea."emailId" = e."id" AND ea."tenantId" IS NULL`,
    `ALTER TABLE "email_attachments" ALTER COLUMN "tenantId" SET NOT NULL`,
    `CREATE INDEX IF NOT EXISTS "email_attachments_tenantId_idx" ON "email_attachments"("tenantId")`,

    // CalendarEventAttachment
    `ALTER TABLE "calendar_event_attachments" ADD COLUMN IF NOT EXISTS "tenantId" TEXT`,
    `UPDATE "calendar_event_attachments" cea SET "tenantId" = ce."tenantId" FROM "calendar_events" ce WHERE cea."eventId" = ce."id" AND cea."tenantId" IS NULL`,
    `ALTER TABLE "calendar_event_attachments" ALTER COLUMN "tenantId" SET NOT NULL`,
    `CREATE INDEX IF NOT EXISTS "calendar_event_attachments_tenantId_idx" ON "calendar_event_attachments"("tenantId")`,

    // CalendarSyncState
    `ALTER TABLE "calendar_sync_state" ADD COLUMN IF NOT EXISTS "tenantId" TEXT`,
    `UPDATE "calendar_sync_state" css SET "tenantId" = pc."tenantId" FROM "provider_configs" pc WHERE css."providerId" = pc."id" AND css."tenantId" IS NULL`,
    `ALTER TABLE "calendar_sync_state" ALTER COLUMN "tenantId" SET NOT NULL`,
    `CREATE INDEX IF NOT EXISTS "calendar_sync_state_tenantId_idx" ON "calendar_sync_state"("tenantId")`,
  ];

  let successCount = 0;
  let errorCount = 0;

  for (const sql of phase1Statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
      successCount++;
    } catch (e: any) {
      // Ignore "already exists" errors
      if (e.message.includes('already exists') || e.message.includes('duplicate')) {
        console.log(`   Skipped (already exists): ${sql.substring(0, 50)}...`);
        successCount++;
      } else {
        console.error(`   ❌ Error: ${sql.substring(0, 50)}... - ${e.message}`);
        errorCount++;
      }
    }
  }

  console.log(`   Executed ${successCount} statements, ${errorCount} errors`);

  // Step 3: Verify
  console.log('\n3. Verifying...');
  for (const table of tables) {
    const cols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = '${table}' AND column_name = 'tenantId'`
    );
    const hasTenant = cols.length > 0;
    console.log(`   ${table}: tenantId = ${hasTenant ? '✅' : '❌ STILL MISSING'}`);
  }

  console.log('\n=== PHASE 1 COMPLETE ===');
  console.log('Next: Run "npx prisma migrate deploy" to apply composite PKs migration');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Fatal error:', e);
  await prisma.$disconnect();
  process.exit(1);
});
