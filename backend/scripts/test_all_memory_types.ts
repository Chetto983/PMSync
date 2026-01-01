/**
 * Comprehensive Memory Type Test
 * 
 * Tests ALL memory types that appear in the frontend:
 * - PREFERENCE (Preferenze)
 * - FACT (Fatti)
 * - PATTERN (Pattern)
 * - INTERACTION (Interazioni)
 * - CONTACT_NOTE (Note Contatti)
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { LongTermMemoryService } from '../src/modules/ai/voltagent/memory/long-term-memory.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
    console.log('🚀 Comprehensive Memory Type Test\n');

    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn'],
    });

    const memoryService = app.get(LongTermMemoryService);
    const prisma = app.get(PrismaService);

    const testTenantId = 'cmjgylxkg000054yhnjpkmzd9';
    const testUserId = 'cmjgylxqp000154yhyl5mu6ss';

    try {
        console.log('📝 Creating memories of ALL types...\n');

        // 1. PREFERENCE
        console.log('1️⃣ PREFERENCE - User preferences');
        const prefId = await memoryService.addFact(
            testTenantId,
            testUserId,
            'Preferisce ricevere email di lavoro solo tra le 9:00 e le 18:00',
            { category: 'PREFERENCE' }
        );
        console.log(`   ✅ Created: ${prefId}\n`);

        // 2. FACT
        console.log('2️⃣ FACT - User facts');
        const factId = await memoryService.addFact(
            testTenantId,
            testUserId,
            'È il CTO di TechStartup S.r.l. con sede a Milano',
            { category: 'FACT' }
        );
        console.log(`   ✅ Created: ${factId}\n`);

        // 3. PATTERN
        console.log('3️⃣ PATTERN - Behavioral patterns');
        const patternId = await memoryService.addFact(
            testTenantId,
            testUserId,
            'Risponde sempre alle email urgenti entro 2 ore durante l\'orario lavorativo',
            { category: 'PATTERN' }
        );
        console.log(`   ✅ Created: ${patternId}\n`);

        // 4. INTERACTION
        console.log('4️⃣ INTERACTION - Conversation interactions');
        const interactionId = await memoryService.addFact(
            testTenantId,
            testUserId,
            'Ha chiesto informazioni sul progetto AI Secretary il 1 gennaio 2026',
            { category: 'INTERACTION' }
        );
        console.log(`   ✅ Created: ${interactionId}\n`);

        // 5. CONTACT_NOTE
        console.log('5️⃣ CONTACT_NOTE - Contact notes');
        const contactId = await memoryService.addFact(
            testTenantId,
            testUserId,
            'Mario Rossi (mario.rossi@example.com) è il suo principale collaboratore sul progetto',
            { category: 'CONTACT_NOTE' }
        );
        console.log(`   ✅ Created: ${contactId}\n`);

        // Verify all types in database
        console.log('📊 Verifying memories by type...\n');

        const memoryTypes = ['PREFERENCE', 'FACT', 'PATTERN', 'INTERACTION', 'CONTACT_NOTE'];

        for (const memType of memoryTypes) {
            const count = await prisma.userProfileEmbedding.count({
                where: {
                    tenantId: testTenantId,
                    userId: testUserId,
                    memoryType: memType,
                },
            });
            console.log(`   ${memType}: ${count} memories`);
        }

        // Get stats
        console.log('\n📈 Overall Stats:');
        const stats = await memoryService.getStats(testTenantId, testUserId);
        console.log(`   Total: ${stats.totalMemories}`);
        console.log(`   By Category:`, stats.byCategory);

        // Show recent memories
        console.log('\n📋 Recent memories (all types):');
        const recentMemories = await prisma.userProfileEmbedding.findMany({
            where: { tenantId: testTenantId, userId: testUserId },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
                memoryType: true,
                content: true,
                createdAt: true,
            },
        });

        for (const m of recentMemories) {
            console.log(`   [${m.memoryType}] ${m.content.slice(0, 60)}...`);
        }

        console.log('\n🎉 All memory types created successfully!');
        console.log('   Refresh the Memories page in the frontend to see all types.');

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await app.close();
    }
}

main();
