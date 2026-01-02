import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { WritingStyleService } from '../src/modules/ai/voltagent/services/writing-style.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { Logger } from '@nestjs/common';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const logger = new Logger('WritingStyleBackfill');
    const prisma = app.get(PrismaService);
    const writingStyleService = app.get(WritingStyleService);

    logger.log('Starting Writing Style Backfill (Manual Dedup)...');

    // Fetch all sent emails (IDs only)
    // We avoid 'distinct' or 'groupBy' to bypass TS issues
    // --- VERIFICATION START ---
    try {
        const existingProfiles = await prisma.writingStyleProfile.findMany();
        console.log(`[VERIFY] Found ${existingProfiles.length} existing WritingStyleProfiles.`);
        if (existingProfiles.length > 0) {
            console.log(`[VERIFY] Sample Profile ID: ${existingProfiles[0].id}, SampleCount: ${existingProfiles[0].sampleCount}`);
        } else {
            console.log(`[VERIFY] No profiles found! Backfill is definitely needed.`);
        }
    } catch (e) {
        console.error('[VERIFY] Error checking profiles:', e);
    }
    // --- VERIFICATION END ---

    // 1. Get all users
    const users = await prisma.user.findMany();

    // Fetch all sent emails (IDs only)
    const allSentEmails = await prisma.email.findMany({
        where: {
            folder: 'SENT',
            bodyText: { not: null },
        },
        select: {
            tenantId: true,
            userId: true,
        },
    });

    logger.log(`Fetched ${allSentEmails.length} sent emails.`);

    // Manual Deduplication
    const userSet = new Set<string>();
    const activeUsers: { tenantId: string; userId: string }[] = [];

    for (const email of allSentEmails) {
        if (!email.userId || !email.tenantId) continue;
        const key = `${email.tenantId}:${email.userId}`;
        if (!userSet.has(key)) {
            userSet.add(key);
            activeUsers.push({ tenantId: email.tenantId, userId: email.userId });
        }
    }

    logger.log(`Found ${activeUsers.length} unique users.`);

    let processed = 0;
    for (const user of activeUsers) {
        const { tenantId, userId } = user;
        try {
            logger.log(`Processing user ${userId}...`);
            await writingStyleService.analyzeUserEmails(tenantId, userId, 50);
            processed++;
        } catch (error) {
            logger.error(`Failed to process user ${userId}: ${(error as Error).message}`);
        }
    }

    logger.log(`Backfill complete. Processed ${processed} users.`);
    await app.close();
}

bootstrap().catch((err) => {
    console.error(err);
    process.exit(1);
});
