
import { NestFactory } from '@nestjs/core';
import { Module, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KnowledgeBaseService } from '../src/modules/ai/services/knowledge-base.service';
import { AiModule } from '../src/modules/ai/ai.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        AiModule,
        PrismaModule
    ],
})
class TestRagModule { }

async function main() {
    const logger = new Logger('TestRagRetrieval');
    const app = await NestFactory.createApplicationContext(TestRagModule, {
        logger: ['error', 'warn', 'log']
    });

    const knowledgeBaseService = app.get(KnowledgeBaseService);
    const prisma = app.get(PrismaService);

    // Get the first tenant
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) {
        logger.error('No tenant found');
        return;
    }

    const query = "Prompt best practice";
    logger.log(`\n🔎 Execution RAG Search for: "${query}"`);

    try {
        const results = await knowledgeBaseService.searchKnowledgeBase({
            tenantId: tenant.id,
            query: query,
            limit: 3
        });

        logger.log(`Found ${results.items.length} hits:\n`);

        results.items.forEach((hit, index) => {
            logger.log(`[${index + 1}] Score: ${hit.score?.toFixed(3)}`);
            logger.log(`    Subject: ${hit.subject}`);
            logger.log(`    Snippet: ${hit.snippet}`);
            logger.log(`    Source: ${hit.source}`);
            if (hit.snippet.includes('Promt-best-pratice.pdf') || hit.snippet.includes('File:')) {
                logger.log('    ✅ PDF Content Detected in Snippet!');
            }
            logger.log('-------------------------------------------');
        });

        if (results.items.some(i => i.snippet.includes('Promt-best-pratice') || i.subject?.includes('ATTACHMENT-TEST'))) {
            logger.log('\n✅ SUCCESS: The system successfully retrieved the test email based on the query!');
        } else {
            logger.warn('\n⚠️  WARNING: Test email NOT found in top results. Validating generic search...');
        }

    } catch (error) {
        logger.error(`Search failed: ${(error as any).message}`);
    }

    await app.close();
}

main().catch(console.error);
