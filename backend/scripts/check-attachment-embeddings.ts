/**
 * Check Attachment Embeddings
 * Do we have embeddings that differ to attachments but miss the emailId?
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
    const prisma = createPrismaClient();

    console.log('🔍 Checking Attachment Embeddings...');

    // Count embeddings with attachmentId
    const withAttachment = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint as count
    FROM "embeddings"
    WHERE metadata->>'attachmentId' IS NOT NULL
  `;

    // Count embeddings with attachmentId BUT NO emailId (in metadata or column)
    // We already backfilled column from metadata.
    // So check if any have attachmentId but emailId col is NULL
    const orphans = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint as count
    FROM "embeddings"
    WHERE metadata->>'attachmentId' IS NOT NULL
      AND "emailId" IS NULL
  `;

    console.log('---------------------------------------------------');
    console.log(`📊 Stats:`);
    console.log(`   Total Attachment Embeddings: ${Number(withAttachment[0].count)}`);
    console.log(`   Missing Email Link: ${Number(orphans[0].count)}`);
    console.log('---------------------------------------------------');

    if (Number(orphans[0].count) > 0) {
        console.log("⚠️  Found attachment embeddings without Email Link.");
        console.log("    Need to fetch EmailID from Attachment Table.");
    } else {
        console.log("✅ All attachment embeddings are linked to Email.");
    }

    await prisma.$disconnect();
}

main().catch(console.error);
