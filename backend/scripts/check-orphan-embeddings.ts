/**
 * Check Orphan Embeddings
 * Counts embeddings where metadata->'emailId' points to a non-existent email.
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
    const prisma = createPrismaClient();

    console.log('🔍 Checking for Orphan Embeddings...');

    // Total embeddings
    const total = await prisma.embedding.count();

    // Orphans: Embedding Exists, but Email does NOT
    // Use raw query for efficiency with JSON
    const orphans = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint as count
    FROM "embeddings" emb
    LEFT JOIN "emails" e ON emb.metadata->>'emailId' = e.id
    WHERE e.id IS NULL
      AND emb.metadata->>'emailId' IS NOT NULL -- Only check email embeddings
  `;

    const orphanCount = Number(orphans[0].count);

    console.log('---------------------------------------------------');
    console.log(`📊 Stats:`);
    console.log(`   Total Embeddings: ${total}`);
    console.log(`   Orphan Embeddings: ${orphanCount}`);
    console.log('---------------------------------------------------');

    if (orphanCount > 0) {
        console.log('⚠️  Orphans Found! These are leftovers from the purge.');
        console.log('    Recommended Action: PURGE THEM.');
    } else {
        console.log('✅ No Orphans. Database is clean.');
    }

    await prisma.$disconnect();
}

main().catch(console.error);
