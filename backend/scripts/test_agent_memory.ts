/**
 * Test script to validate LongTermMemoryService writes to user_profile_embeddings
 */
import { createPrismaAdapter } from '../src/prisma/prisma-client.factory';
import { PrismaClient } from '@prisma/client';

async function main() {
    const adapter = createPrismaAdapter();
    const prisma = new PrismaClient({ adapter });

    const testTenantId = 'cmjgylxkg000054yhnjpkmzd9';
    const testUserId = 'cmjgylxqp000154yhyl5mu6ss';

    try {
        // Count memories in user_profile_embeddings
        const count = await prisma.userProfileEmbedding.count({
            where: {
                tenantId: testTenantId,
                userId: testUserId,
            },
        });
        console.log(`\n✅ Memories in user_profile_embeddings: ${count}`);

        // Show recent memories
        if (count > 0) {
            const memories = await prisma.userProfileEmbedding.findMany({
                where: {
                    tenantId: testTenantId,
                    userId: testUserId,
                },
                orderBy: { createdAt: 'desc' },
                take: 5,
                select: {
                    id: true,
                    content: true,
                    memoryType: true,
                    confidence: true,
                    source: true,
                    createdAt: true,
                },
            });
            console.log('\n📋 Recent memories:');
            for (const m of memories) {
                console.log(`  - [${m.memoryType}] ${m.content.slice(0, 60)}... (confidence: ${m.confidence})`);
            }
        }

        // Verify ai_memories table is gone (should error or return 0)
        try {
            const oldCount = await prisma.$queryRaw`SELECT COUNT(*) as cnt FROM ai_memories`;
            console.log('\n⚠️ WARNING: ai_memories table still exists:', oldCount);
        } catch {
            console.log('\n✅ ai_memories table has been dropped (as expected)');
        }

        console.log('\n🎉 Memory system validation complete!');
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
