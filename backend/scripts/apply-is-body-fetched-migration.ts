/**
 * Apply isBodyFetched migration safely
 * Run: npx ts-node backend/scripts/apply-is-body-fetched-migration.ts
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
  const prisma = createPrismaClient();

  console.log('===== APPLYING isBodyFetched MIGRATION =====\n');

  try {
    // Check if column already exists
    const checkColumn = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'emails'
        AND column_name = 'isBodyFetched'
      ) as exists
    `;

    if (checkColumn[0]?.exists) {
      console.log('✓ Column isBodyFetched already exists');
    } else {
      console.log('Adding isBodyFetched column...');
      await prisma.$executeRaw`
        ALTER TABLE emails
        ADD COLUMN "isBodyFetched" BOOLEAN NOT NULL DEFAULT false
      `;
      console.log('✓ Column added');
    }

    // Check if index exists
    const checkIndex = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE tablename = 'emails'
        AND indexname = 'emails_tenantId_isBodyFetched_idx'
      ) as exists
    `;

    if (checkIndex[0]?.exists) {
      console.log('✓ Index already exists');
    } else {
      console.log('Creating index...');
      await prisma.$executeRaw`
        CREATE INDEX "emails_tenantId_isBodyFetched_idx"
        ON emails ("tenantId", "isBodyFetched")
      `;
      console.log('✓ Index created');
    }

    // Backfill existing emails with body
    console.log('\nBackfilling isBodyFetched for emails with existing body...');
    const updateResult = await prisma.$executeRaw`
      UPDATE emails
      SET "isBodyFetched" = true
      WHERE "bodyText" IS NOT NULL AND LENGTH("bodyText") > 0
      AND "isBodyFetched" = false
    `;
    console.log(`✓ Updated ${updateResult} emails`);

    // Report stats
    const stats = await prisma.$queryRaw<Array<{
      with_body: bigint;
      metadata_only: bigint;
      total: bigint;
    }>>`
      SELECT
        COUNT(*) FILTER (WHERE "isBodyFetched" = true) as with_body,
        COUNT(*) FILTER (WHERE "isBodyFetched" = false) as metadata_only,
        COUNT(*) as total
      FROM emails
    `;

    console.log('\n===== MIGRATION STATS =====');
    console.log(`  With body (isBodyFetched=true): ${stats[0].with_body}`);
    console.log(`  Metadata only (isBodyFetched=false): ${stats[0].metadata_only}`);
    console.log(`  Total: ${stats[0].total}`);

    console.log('\n✓ Migration complete!');
  } catch (err) {
    console.error('Migration failed:', err);
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
