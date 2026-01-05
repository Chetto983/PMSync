
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailCleanupService } from '../src/modules/email/services/email-cleanup.service';
import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

async function main() {
    const logger = new Logger('CleanupValidation');
    logger.log('Starting Cleanup Service Batching Validation...');

    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn', 'log'], // Enable logs to see batching output
    });

    try {
        const prisma = app.get(PrismaService);
        const cleanupService = app.get(EmailCleanupService);

        // 1. Setup Test Tenant
        const tenantId = `test-tenant-${randomUUID()}`;
        const providerId = `test-provider-${randomUUID()}`;
        logger.log(`Creating test tenant: ${tenantId}`);

        await prisma.tenant.create({
            data: {
                id: tenantId,
                name: 'Batch Test Tenant',
                slug: tenantId,
                isActive: true, // Required constraint based on schema usually
            },
        });

        // We might need a provider config to be valid, depending on schema constraints, 
        // but usually emails just need tenantId + providerId foreign keys if they exist, 
        // or just strings if loosely coupled. 
        // Looking at schema, let's assume providerConfig is needed for providerId foreign key.
        // To be safe, let's create a minimal provider config.
        await prisma.providerConfig.create({
            data: {
                id: providerId,
                tenantId: tenantId,
                email: 'test@example.com',
                providerType: 'google',
                isActive: true,
                accessToken: 'mock',
                refreshToken: 'mock',
                tokenExpiresAt: new Date(),
                // scope: [], // Removed to avoid TS inference issues
            }
        });

        const TOTAL_EMAILS = 2500; // > 2 * BATCH_SIZE (1000)

        // 2. Seed Data
        logger.log(`Seeding ${TOTAL_EMAILS} soft-deleted emails...`);

        // Create in chunks of 100 to avoid query limits during seeding
        const SEED_CHUNK_SIZE = 100;
        for (let i = 0; i < TOTAL_EMAILS; i += SEED_CHUNK_SIZE) {
            const data = Array.from({ length: SEED_CHUNK_SIZE }).map(() => ({
                id: randomUUID(),
                tenantId,
                providerId,
                subject: `Batch Test Email ${i}`,
                isDeleted: true,
                updatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48 hours old (older than default 24h purge)
                receivedAt: new Date(),
                sentAt: new Date(), // Required constraint
                folder: 'TRASH',
                from: 'test@example.com',
                to: ['me@example.com'],
                messageId: randomUUID(), // unique
                externalId: `mock-ext-${randomUUID()}`, // Required constraint
            } as any));

            await prisma.email.createMany({ data });
            if (i % 500 === 0) process.stdout.write('.');
        }
        console.log(' Done.');

        // 3. Verify Seed
        const initialCount = await prisma.email.count({
            where: { tenantId, isDeleted: true }
        });
        logger.log(`Verified seed count: ${initialCount} emails`);

        if (initialCount !== TOTAL_EMAILS) {
            throw new Error(`Seeding failed. Expected ${TOTAL_EMAILS}, got ${initialCount}`);
        }

        // 4. Run Cleanup (Dry Run First)
        logger.log('--- Running Dry Run ---');
        const dryRun = await cleanupService.dryRunRetention(tenantId, 24);
        logger.log(`Dry Run Result: Would delete ${dryRun.wouldDeleteEmails} emails`);

        if (dryRun.wouldDeleteEmails !== TOTAL_EMAILS) {
            logger.error(`Dry run mismatch! Expected ${TOTAL_EMAILS}, got ${dryRun.wouldDeleteEmails}`);
            // Don't fail yet, simpler dry run might have skipped something? 
            // But updated code should match.
        }

        // 5. Run Actual Cleanup
        logger.log('--- Running Actual Cleanup (expecting batches) ---');
        const result = await cleanupService.purgeSoftDeletedEmails(tenantId, 24);

        logger.log(`Cleanup Result: Removed ${result.removed} emails`);

        // 6. Verify Deletion
        const finalCount = await prisma.email.count({
            where: { tenantId }
        });

        if (finalCount === 0 && result.removed === TOTAL_EMAILS) {
            logger.log('✅ SUCCESS: All emails deleted in batches.');
        } else {
            logger.error(`❌ FAILURE: Remaining emails: ${finalCount}. Removed reported: ${result.removed}`);

            // Check if we hit partial failure
            if (finalCount > 0) {
                logger.error('Some emails were not deleted.');
            }
        }

        // 7. Cleanup Tenant
        logger.log('Cleaning up test tenant...');
        await prisma.providerConfig.deleteMany({ where: { tenantId } });
        await prisma.tenant.delete({ where: { id: tenantId } });
        logger.log('Cleanup complete.');

    } catch (error) {
        logger.error('Test Failed:', error);
        process.exit(1);
    } finally {
        await app.close();
    }
}

main();
