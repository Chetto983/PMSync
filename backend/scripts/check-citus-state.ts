/**
 * Check Citus Migration State
 * Verifies which migrations have been applied and current DB schema state
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function main() {
  console.log('=== CITUS MIGRATION STATE CHECK ===\n');

  // 1. Check applied migrations
  console.log('1. Applied Citus Migrations:');
  try {
    const migrations = await prisma.$queryRawUnsafe<{ migration_name: string; finished_at: Date | null }[]>(`
      SELECT migration_name, finished_at
      FROM _prisma_migrations
      WHERE migration_name LIKE '%citus%'
      ORDER BY started_at
    `);
    if (migrations.length === 0) {
      console.log('   (none found)');
    } else {
      migrations.forEach(m => {
        console.log(`   - ${m.migration_name}: ${m.finished_at ? '✅ APPLIED' : '❌ PENDING'}`);
      });
    }
  } catch (e: any) {
    console.log('   Error:', e.message);
  }

  // 2. Check email_attachments columns
  console.log('\n2. email_attachments Columns:');
  try {
    const cols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'email_attachments'
      ORDER BY ordinal_position
    `);
    cols.forEach(c => console.log(`   - ${c.column_name}`));
    const hasTenantId = cols.some(c => c.column_name === 'tenantId');
    console.log(`   >> tenantId column: ${hasTenantId ? '✅ EXISTS' : '❌ MISSING'}`);
  } catch (e: any) {
    console.log('   Error:', e.message);
  }

  // 3. Check email_labels columns
  console.log('\n3. email_labels Columns:');
  try {
    const cols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'email_labels'
      ORDER BY ordinal_position
    `);
    cols.forEach(c => console.log(`   - ${c.column_name}`));
    const hasTenantId = cols.some(c => c.column_name === 'tenantId');
    console.log(`   >> tenantId column: ${hasTenantId ? '✅ EXISTS' : '❌ MISSING'}`);
  } catch (e: any) {
    console.log('   Error:', e.message);
  }

  // 4. Check emails PK structure
  console.log('\n4. emails Table Primary Key:');
  try {
    const pk = await prisma.$queryRawUnsafe<{ column_name: string }[]>(`
      SELECT a.attname as column_name
      FROM pg_index i
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey)
      WHERE i.indisprimary AND t.relname = 'emails'
    `);
    const pkCols = pk.map(p => p.column_name);
    console.log(`   PK columns: ${pkCols.join(', ')}`);
    console.log(`   >> Composite PK: ${pkCols.length > 1 ? '✅ YES' : '❌ NO (single column)'}`);
  } catch (e: any) {
    console.log('   Error:', e.message);
  }

  // 5. Check folders PK structure
  console.log('\n5. folders Table Primary Key:');
  try {
    const pk = await prisma.$queryRawUnsafe<{ column_name: string }[]>(`
      SELECT a.attname as column_name
      FROM pg_index i
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey)
      WHERE i.indisprimary AND t.relname = 'folders'
    `);
    const pkCols = pk.map(p => p.column_name);
    console.log(`   PK columns: ${pkCols.join(', ')}`);
    console.log(`   >> Composite PK: ${pkCols.length > 1 ? '✅ YES' : '❌ NO (single column)'}`);
  } catch (e: any) {
    console.log('   Error:', e.message);
  }

  // 6. Check unified_contacts PK structure
  console.log('\n6. unified_contacts Table Primary Key:');
  try {
    const pk = await prisma.$queryRawUnsafe<{ column_name: string }[]>(`
      SELECT a.attname as column_name
      FROM pg_index i
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey)
      WHERE i.indisprimary AND t.relname = 'unified_contacts'
    `);
    const pkCols = pk.map(p => p.column_name);
    console.log(`   PK columns: ${pkCols.join(', ')}`);
    console.log(`   >> Composite PK: ${pkCols.length > 1 ? '✅ YES' : '❌ NO (single column)'}`);
  } catch (e: any) {
    console.log('   Error:', e.message);
  }

  console.log('\n=== END STATE CHECK ===');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Fatal error:', e);
  await prisma.$disconnect();
  process.exit(1);
});
