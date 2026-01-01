/**
 * E2E Test: LongTermMemoryService with Real LLM
 * 
 * Tests the full memory pipeline:
 * 1. Extract facts from conversation using Mistral LLM
 * 2. Generate embeddings
 * 3. Store in user_profile_embeddings
 * 4. Semantic search retrieval
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { LongTermMemoryService } from '../src/modules/ai/voltagent/memory/long-term-memory.service';

async function main() {
    console.log('🚀 Starting E2E Memory Test with Real LLM...\n');

    // Bootstrap NestJS app to get properly configured services
    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn'],
    });

    const memoryService = app.get(LongTermMemoryService);

    const testTenantId = 'cmjgylxkg000054yhnjpkmzd9';
    const testUserId = 'cmjgylxqp000154yhyl5mu6ss';

    try {
        // Test 1: Add memory from conversation (uses LLM extraction)
        console.log('📝 Test 1: Adding memory from conversation...');
        const conversationMessages = [
            { role: 'user', content: 'Mi chiamo Marco e lavoro come ingegnere software a Milano.' },
            { role: 'assistant', content: 'Piacere Marco! Lavori come ingegnere software a Milano, fantastico!' },
            { role: 'user', content: 'Preferisco le riunioni al mattino presto, mai dopo le 14.' },
            { role: 'assistant', content: 'Capito, annoterò che preferisci riunioni mattutine, prima delle 14.' },
        ];

        const memoryId = await memoryService.addMemory(
            testTenantId,
            testUserId,
            conversationMessages,
            { category: 'PREFERENCE', sourceType: 'CONVERSATION' }
        );

        if (memoryId) {
            console.log(`   ✅ Memory stored with ID: ${memoryId}`);
        } else {
            console.log('   ⚠️ No memory extracted (LLM may have found no new facts)');
        }

        // Test 2: Add direct fact (bypasses LLM extraction)
        console.log('\n📝 Test 2: Adding direct fact...');
        const factId = await memoryService.addFact(
            testTenantId,
            testUserId,
            'Marco preferisce lavorare da remoto il venerdì',
            { category: 'PREFERENCE' }
        );
        console.log(`   ✅ Fact stored with ID: ${factId}`);

        // Test 3: Semantic search
        console.log('\n🔍 Test 3: Semantic search for "riunioni"...');
        const searchResults = await memoryService.searchMemories(
            testTenantId,
            testUserId,
            'riunioni orario preferito',
            { limit: 5 }
        );
        console.log(`   Found ${searchResults.length} relevant memories:`);
        for (const result of searchResults) {
            console.log(`   - [${result.category}] ${result.memory.slice(0, 80)}...`);
        }

        // Test 4: Get all memories
        console.log('\n📋 Test 4: Getting all memories...');
        const allMemories = await memoryService.getAllMemories(testTenantId, testUserId);
        console.log(`   Total memories: ${allMemories.length}`);

        // Test 5: Get stats
        console.log('\n📊 Test 5: Getting memory stats...');
        const stats = await memoryService.getStats(testTenantId, testUserId);
        console.log(`   Total: ${stats.totalMemories}`);
        console.log(`   By category:`, stats.byCategory);

        console.log('\n🎉 All E2E tests passed!');

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await app.close();
    }
}

main();
