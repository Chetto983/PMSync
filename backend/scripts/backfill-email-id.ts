/**
 * Backfill Email ID
 * Populates embedding.emailId from embedding.metadata->emailId
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
    const prisma = createPrismaClient();

    console.log('🔄 Backfilling emailId for Embeddings...');

    // fetch all embeddings where emailId is null but metadata has emailId
    // We can do this in batches or one big raw update.
    // Raw update is fastest.

    const result = await prisma.$executeRaw`
    UPDATE "embeddings"
    SET "emailId" = metadata->>'emailId'
    WHERE "emailId" IS NULL
      AND metadata->>'emailId' IS NOT NULL
  `;

    console.log(`✅ Updated ${result} embeddings.`);

    // Verify: Check if any refer to non-existent emails? (These would fail FK if strict?)
    // Wait, if I set emailId, and the FK exists, it strictly checks the Email table.
    // If the email is missing, the Update will FAIL with FK violation.
    // BUT I just purged orphans! So it should be safe.

    // Let's verify counts
    const total = await prisma.embedding.count();
    const linked = await prisma.embedding.count({
        where: { emailId: { not: null } }
    });

    console.log(`📊 Stats:`);
    console.log(`   Total Embeddings: ${total}`);
    console.log(`   Linked Embeddings: ${linked}`);

    await prisma.$disconnect();
}

main().catch(console.error);
