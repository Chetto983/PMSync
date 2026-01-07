/**
 * Investigate duplicate externalIds in emails table
 * Run: npx ts-node scripts/investigate-duplicate-emails.ts
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function main() {
  console.log('Investigating duplicate externalIds...\n');

  // Get all duplicates with details
  const duplicates = await prisma.$queryRaw<{
    providerId: string;
    externalId: string;
    cnt: bigint;
  }[]>`
    SELECT "providerId", "externalId", COUNT(*) as cnt
    FROM emails
    WHERE "externalId" IS NOT NULL
    GROUP BY "providerId", "externalId"
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 20
  `;

  console.log(`Found ${duplicates.length} duplicate externalId groups:\n`);

  for (const dup of duplicates) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`ExternalId: ${dup.externalId} (${dup.cnt} copies)`);
    console.log('='.repeat(70));

    // Get details of each duplicate
    const emails = await prisma.email.findMany({
      where: {
        providerId: dup.providerId,
        externalId: dup.externalId,
      },
      select: {
        id: true,
        folder: true,
        subject: true,
        from: true,
        receivedAt: true,
        createdAt: true,
        isDeleted: true,
        isDraft: true,
        provider: {
          select: { providerType: true, email: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    for (const email of emails) {
      console.log(`
  ID: ${email.id}
  Provider: ${email.provider.providerType} (${email.provider.email})
  Folder: ${email.folder}
  Subject: ${email.subject?.substring(0, 60)}...
  From: ${email.from}
  ReceivedAt: ${email.receivedAt?.toISOString()}
  CreatedAt: ${email.createdAt.toISOString()}
  IsDeleted: ${email.isDeleted}
  IsDraft: ${email.isDraft}
`);
    }

    // Analyze the pattern
    const folders = [...new Set(emails.map(e => e.folder))];
    if (folders.length > 1) {
      console.log(`  ⚠️ PATTERN: Same email in ${folders.length} folders: ${folders.join(', ')}`);
      console.log('  → This suggests folder sync created duplicates instead of moving');
    } else {
      console.log(`  ⚠️ PATTERN: All in same folder (${folders[0]})`);
      console.log('  → This suggests upsert race condition during sync');
    }
  }

  // Summary
  const totalDuplicates = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM (
      SELECT "externalId" FROM emails
      WHERE "externalId" IS NOT NULL
      GROUP BY "providerId", "externalId"
      HAVING COUNT(*) > 1
    ) dups
  `;

  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total duplicate groups: ${totalDuplicates[0]?.count}`);

  // Recommendation
  console.log('\n📋 RECOMMENDED FIX:');
  console.log('1. Add unique constraint: @@unique([providerId, externalId])');
  console.log('2. Before adding constraint, clean duplicates with:');
  console.log(`
   DELETE FROM emails
   WHERE id NOT IN (
     SELECT MIN(id) FROM emails
     WHERE "externalId" IS NOT NULL
     GROUP BY "providerId", "externalId"
   ) AND "externalId" IN (
     SELECT "externalId" FROM emails
     GROUP BY "providerId", "externalId"
     HAVING COUNT(*) > 1
   );
  `);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
