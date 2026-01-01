/**
 * Full Agent E2E Memory Test
 * 
 * Tests the complete flow:
 * 1. Send a chat message via VoltAgentService (real LLM)
 * 2. AI extracts facts and stores them via UnifiedKnowledgeAgent's "remember" tool
 * 3. Verify memories appear in user_profile_embeddings
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { VoltAgentService } from '../src/modules/ai/voltagent/voltagent.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
    console.log('🚀 Starting Full Agent Memory E2E Test...\n');

    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn'],
    });

    const voltAgentService = app.get(VoltAgentService);
    const prisma = app.get(PrismaService);

    const testTenantId = 'cmjgylxkg000054yhnjpkmzd9';
    const testUserId = 'cmjgylxqp000154yhyl5mu6ss';

    try {
        // Get initial memory count
        const initialCount = await prisma.userProfileEmbedding.count({
            where: { tenantId: testTenantId, userId: testUserId },
        });
        console.log(`📊 Initial memory count: ${initialCount}\n`);

        // Test 1: Chat with explicit memory request
        console.log('💬 Test 1: Sending chat message asking AI to remember...');
        const chatResult1 = await voltAgentService.chat(
            'Ricordati che il mio compleanno è il 15 marzo e preferisco ricevere regali tecnologici.',
            {
                tenantId: testTenantId,
                userId: testUserId,
                locale: 'it',
            }
        );
        console.log(`   AI Response: ${chatResult1.text?.slice(0, 150)}...`);

        // Wait for async memory storage
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Test 2: Chat with implicit facts
        console.log('\n💬 Test 2: Sharing facts naturally in conversation...');
        const chatResult2 = await voltAgentService.chat(
            'Lavoro come CTO in una startup di AI a Milano. Ho 3 dipendenti nel mio team.',
            {
                tenantId: testTenantId,
                userId: testUserId,
                locale: 'it',
            }
        );
        console.log(`   AI Response: ${chatResult2.text?.slice(0, 150)}...`);

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Test 3: Query about remembered info
        console.log('\n💬 Test 3: Asking AI to recall stored memories...');
        const chatResult3 = await voltAgentService.chat(
            'Cosa sai di me? Quali sono le mie preferenze?',
            {
                tenantId: testTenantId,
                userId: testUserId,
                locale: 'it',
            }
        );
        console.log(`   AI Response: ${chatResult3.text?.slice(0, 200)}...`);

        // Check final memory count
        const finalCount = await prisma.userProfileEmbedding.count({
            where: { tenantId: testTenantId, userId: testUserId },
        });
        console.log(`\n📊 Final memory count: ${finalCount} (added ${finalCount - initialCount} new)`);

        // Show all memories
        const memories = await prisma.userProfileEmbedding.findMany({
            where: { tenantId: testTenantId, userId: testUserId },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
                id: true,
                content: true,
                memoryType: true,
                source: true,
                createdAt: true,
            },
        });

        console.log('\n📋 All memories in database:');
        for (const m of memories) {
            const date = m.createdAt.toISOString().slice(0, 19);
            console.log(`   [${m.memoryType}] ${m.content.slice(0, 70)}... (${date})`);
        }

        if (finalCount > initialCount) {
            console.log('\n✅ SUCCESS: Agent correctly stored new memories!');
        } else {
            console.log('\n⚠️ WARNING: No new memories were stored. Check agent tool usage.');
        }

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await app.close();
    }
}

main();
