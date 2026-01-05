/**
 * Verify search indexes and test trigram search
 * Run: npx ts-node scripts/verify-indexes.ts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter }) as unknown as PrismaClient;
}

const prisma = createPrismaClient();

async function main() {
  console.log('=== Verifying Search Indexes ===\n');

  // 1. Check pg_trgm extension
  const extensions = await prisma.$queryRawUnsafe<Array<{ extname: string }>>(
    `SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'`
  );
  console.log('✓ pg_trgm extension:', extensions.length > 0 ? 'ENABLED' : 'NOT ENABLED');

  // 2. List new indexes on emails table
  const emailIndexes = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'emails'
     AND (indexname LIKE '%gin%' OR indexname LIKE '%isRead%' OR indexname LIKE '%isFlagged%' OR indexname LIKE '%from_idx%')
     ORDER BY indexname`
  );
  console.log('\nEmail indexes:');
  emailIndexes.forEach(i => console.log('  ✓', i.indexname));

  // 3. List calendar event indexes
  const calendarIndexes = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'calendar_events'
     AND (indexname LIKE '%gin%' OR indexname LIKE '%title%')
     ORDER BY indexname`
  );
  console.log('\nCalendar event indexes:');
  calendarIndexes.forEach(i => console.log('  ✓', i.indexname));

  // 4. List contact indexes
  const contactIndexes = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'unified_contacts'
     AND indexname LIKE '%gin%'
     ORDER BY indexname`
  );
  console.log('\nContact indexes:');
  contactIndexes.forEach(i => console.log('  ✓', i.indexname));

  // 5. Test trigram search (no embeddings needed!)
  console.log('\n=== Testing Trigram Search ===\n');

  // Search emails by subject containing "meeting"
  const emailCount = await prisma.email.count();
  console.log(`Total emails in database: ${emailCount}`);

  if (emailCount > 0) {
    // Test trigram search on subject
    const subjectSearch = await prisma.$queryRawUnsafe<Array<{ id: string; subject: string }>>(
      `SELECT id, subject FROM emails
       WHERE subject ILIKE '%' || $1 || '%'
       LIMIT 5`,
      'meeting'
    );
    console.log(`\nEmails with "meeting" in subject: ${subjectSearch.length}`);
    subjectSearch.forEach(e => console.log(`  - ${e.subject.substring(0, 60)}...`));

    // Test trigram similarity search (fuzzy matching)
    const fuzzySearch = await prisma.$queryRawUnsafe<Array<{ id: string; from: string; similarity: number }>>(
      `SELECT id, "from", similarity("from", $1) as similarity
       FROM emails
       WHERE "from" % $1
       ORDER BY similarity DESC
       LIMIT 5`,
      'mario'
    );
    console.log(`\nFuzzy search for sender "mario": ${fuzzySearch.length} matches`);
    fuzzySearch.forEach(e => console.log(`  - ${e.from} (similarity: ${e.similarity?.toFixed(2)})`));
  }

  // Search contacts
  const contactCount = await prisma.contact.count();
  console.log(`\nTotal contacts in database: ${contactCount}`);

  if (contactCount > 0) {
    const contactSearch = await prisma.$queryRawUnsafe<Array<{ id: string; displayName: string | null }>>(
      `SELECT id, "displayName" FROM unified_contacts
       WHERE "displayName" ILIKE '%' || $1 || '%'
       LIMIT 5`,
      'test'
    );
    console.log(`Contacts with "test" in name: ${contactSearch.length}`);
  }

  console.log('\n=== Search Index Verification Complete ===');
  console.log('\nUsage examples with Prisma:');
  console.log(`
  // ILIKE search (uses GIN trigram index)
  await prisma.$queryRawUnsafe(
    \`SELECT * FROM emails WHERE subject ILIKE '%meeting%' LIMIT 10\`
  );

  // Fuzzy similarity search (% operator)
  await prisma.$queryRawUnsafe(
    \`SELECT * FROM emails WHERE "from" % 'mario' ORDER BY similarity("from", 'mario') DESC\`
  );

  // Combined with tenant filter
  await prisma.$queryRawUnsafe(
    \`SELECT * FROM emails WHERE "tenantId" = $1 AND subject ILIKE '%' || $2 || '%'\`,
    tenantId, searchTerm
  );
  `);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
