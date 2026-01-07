import { NestFactory } from '@nestjs/core';
import { Module, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { MistralService } from '../src/modules/ai/services/mistral.service';
import { MemoryIntelligenceService } from '../src/modules/ai/voltagent/services/memory-intelligence.service';
import { AIMemoryService } from '../src/modules/ai/voltagent/services/ai-memory.service';
import { EmbeddingsService } from '../src/modules/ai/services/embeddings.service';
import { PromptGuardService } from '../src/modules/ai/guards/prompt-guard.service';

/**
 * Real Verification Script (Simplified Dependency Graph)
 * 
 * Boots up a dedicated module for memory testing to avoid
 * pulling in the entire application graph (Email, Calendar, etc.)
 */
@Module({
    imports: [ConfigModule.forRoot()],
    providers: [
        PrismaService,
        MistralService,
        AIMemoryService,
        MemoryIntelligenceService,
        EmbeddingsService, // MistralService dep
        PromptGuardService, // MistralService dep
    ],
})
class TestMemoryModule { }

async function runRealVerification() {
    const logger = new Logger('RealVerification');
    logger.log('--- Bootstrapping Real Context (Isolated) ---');

    const app = await NestFactory.createApplicationContext(TestMemoryModule, { logger: ['error', 'warn', 'log'] });

    try {
        const memoryIntelligence = app.get(MemoryIntelligenceService);
        const aiMemory = app.get(AIMemoryService);

        const TEST_TENANT = 'verification-tenant-' + Date.now();
        const TEST_USER = 'verification-user-' + Date.now();

        logger.log(`Using Tenant: ${TEST_TENANT}, User: ${TEST_USER}`);

        // --- Step 1: Process User Message ---
        const message1 = "My name is John and I work as a Senior DevOps Engineer.";
        logger.log(`\nStep 1: Processing Message: "${message1}"`);

        await memoryIntelligence.processMemoryFromMessage(TEST_TENANT, TEST_USER, message1);

        // Verify DB
        logger.log('Verifying DB storage...');
        await new Promise(r => setTimeout(r, 2000)); // Give it a moment if async

        const mems1 = await aiMemory.getMemories(TEST_TENANT, TEST_USER);
        if (mems1.length > 0) {
            logger.log(`✅ SUCCESS: Found ${mems1.length} memories.`);
            mems1.forEach(m => logger.log(`   - [${m.memoryType}] ${m.content} (Confidence: ${m.confidence})`));
        } else {
            logger.error('❌ FAILURE: No memories stored after first message.');
            process.exit(1);
        }

        // --- Step 2: Update Memory ---
        const message2 = "Actually, I was promoted to Lead DevOps Engineer yesterday.";
        logger.log(`\nStep 2: Processing Message: "${message2}"`);

        await memoryIntelligence.processMemoryFromMessage(TEST_TENANT, TEST_USER, message2);

        logger.log('Verifying DB update...');
        await new Promise(r => setTimeout(r, 2000));

        const mems2 = await aiMemory.getMemories(TEST_TENANT, TEST_USER);
        const updatedMem = mems2.find(m => m.content.includes('Lead DevOps'));

        if (updatedMem) {
            logger.log(`✅ SUCCESS: Found updated memory: "${updatedMem.content}"`);
        } else {
            logger.warn('⚠️ WARNING: Did not find specific updated text. Current memories:');
            mems2.forEach(m => logger.log(`   - ${m.content}`));
        }

        // --- Cleanup ---
        logger.log('\nCleaning up test data...');
        await aiMemory.clearAllMemories(TEST_TENANT, TEST_USER);
        logger.log('✅ Cleanup complete.');

    } catch (error) {
        logger.error('❌ FATAL ERROR During Verification:', error);
    } finally {
        await app.close();
    }
}

runRealVerification();
