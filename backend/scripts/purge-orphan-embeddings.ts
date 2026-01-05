/**
 * Purge Orphan Embeddings
 * Deletes embeddings where metadata->'emailId' points to a non-existent email.
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
    const prisma = createPrismaClient();

    console.log('🗑️  Purging Orphan Embeddings...');

    // Use raw execute for deletion with join logic
    // "Delete from embeddings where ID is in (select id from embeddings left join emails... where email is null)"

    const result = await prisma.$executeRaw`
    DELETE FROM "embeddings"
    WHERE id IN (
        SELECT emb.id
        FROM "embeddings" emb
        LEFT JOIN "emails" e ON emb.metadata->>'emailId' = e.id
        WHERE e.id IS NULL
          AND emb.metadata->>'emailId' IS NOT NULL
    )
  `;

    console.log(`✅ Deleted ${result} orphan embeddings.`);

    // Verify
    const remaining = await prisma.embedding.count();
    console.log(`Remaining Embeddings: ${remaining}`);

    await prisma.$disconnect();
}

main().catch(console.error);
