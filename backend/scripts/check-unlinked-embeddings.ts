/**
 * Check Unlinked Embeddings
 * What are the remaining 63 embeddings?
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
    const prisma = createPrismaClient();

    console.log('🔍 Checking Unlinked Embeddings...');

    const unlinked = await prisma.embedding.findMany({
        where: { emailId: null },
        select: { id: true, metadata: true, documentName: true },
        take: 10
    });

    console.log(`Found ${unlinked.length} unlinked (sample).`);
    unlinked.forEach(e => {
        console.log(`- ID: ${e.id} | DocName: ${e.documentName}`);
        console.log(`  Meta: ${JSON.stringify(e.metadata)}`);
    });

    await prisma.$disconnect();
}

main().catch(console.error);
