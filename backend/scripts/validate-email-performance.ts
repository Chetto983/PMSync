
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailsService } from '../src/modules/email/services/emails.service';
import { CacheService, CacheNamespace } from '../src/common/services/cache.service';
import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

async function main() {
    const logger = new Logger('PerformanceValidation');
    logger.log('Starting EmailsService Performance Validation...');

    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn', 'log', 'debug'],
    });

    try {
        const prisma = app.get(PrismaService);
        const emailsService = app.get(EmailsService);
        const cacheService = app.get(CacheService);

        // 1. Setup Test Tenant
        const tenantId = `perf-test-${randomUUID()}`;
        const providerId = `perf-prov-${randomUUID()}`;
        logger.log(`Creating test tenant: ${tenantId}`);

        await prisma.tenant.create({
            data: {
                id: tenantId,
                name: 'Perf Test Tenant',
                slug: tenantId,
                isActive: true,
            },
        });

        // 2. Validate Special Folder Caching
        logger.log('--- validating Special Folder Caching ---');

        // Populate one folder to find
        await prisma.folder.create({
            data: {
                id: randomUUID(),
                tenantId,
                providerId,
                name: 'Inbox',
                path: 'INBOX',
                specialUse: 'INBOX',
                type: 'system',
                delimiter: '/',
                providerType: 'google',
            }
        });

        const start1 = performance.now();
        const res1 = await (emailsService as any).getFolderPathsBySpecialUse(tenantId, ['INBOX']);
        const dur1 = performance.now() - start1;
        logger.log(`Call 1 (Uncached): ${dur1.toFixed(2)}ms, Result: ${JSON.stringify(res1)}`);

        const start2 = performance.now();
        const res2 = await (emailsService as any).getFolderPathsBySpecialUse(tenantId, ['INBOX']);
        const dur2 = performance.now() - start2;
        logger.log(`Call 2 (Cached): ${dur2.toFixed(2)}ms, Result: ${JSON.stringify(res2)}`);

        if (dur2 > dur1 && dur2 > 50) {
            // Rough check, cache should be fast. 
            // Note: DB check might be fast too on local, but cache is usually sub-5ms
            logger.warn('Cache might not be working efficiently or DB is incredibly fast.');
        }

        const cacheKey = `special-use:${tenantId}:INBOX:all`;
        const cachedVal = await cacheService.get(cacheKey, { namespace: CacheNamespace.FOLDER_STRUCTURE });
        if (cachedVal) {
            logger.log('✅ Verified Cache Key exists in Redis.');
        } else {
            logger.error('❌ Cache Key missing in Redis!');
        }

        // 3. Validate Folder Debouncing
        logger.log('--- Validating Folder Count Debounce ---');

        // Note: updateFolderCounts checks for active websocket connections.
        // We need to mock that check or implementation will skip processing.
        // (emailsService as any).realtimeEvents.hasTenantConnections = () => true;
        // BUT realtimeEvents is private.
        // We can override the method on the prototype or instance if we are really hacking.
        // Better: The method specifically logs "Skipping folder count update for inactive tenant" if check fails.
        // We want to verify the DEBOUNCE mechanism (Redis list + Lock), not the calculation itself
        // The debounce logic happens BEFORE the check in executeFolderCountsUpdate.
        // Wait, executeFolderCountsUpdate does the check.
        // But the buffering happens in updateFolderCounts.

        const listKey = `folder_updates:${tenantId}:${providerId}`;
        const folders = ['INBOX', 'SENT'];

        logger.log('Triggering 5 updates rapidly...');
        for (let i = 0; i < 5; i++) {
            await (emailsService as any).updateFolderCounts(tenantId, providerId, folders);
        }

        // Check Redis List immediately
        const listLen = await cacheService.llen(listKey, { namespace: CacheNamespace.FOLDER_METADATA });
        logger.log(`Redis List Length (should be accumulated): ${listLen}`);

        if (listLen > 0) {
            logger.log('✅ Debounce is working (items buffered in Redis).');
        } else {
            logger.error('❌ Debounce failed (items not buffered).');
        }

        logger.log('Waiting 6 seconds for debounce flush...');
        await new Promise(r => setTimeout(r, 6000));

        const listLenAfter = await cacheService.llen(listKey, { namespace: CacheNamespace.FOLDER_METADATA });
        logger.log(`Redis List Length after flush (should be 0): ${listLenAfter}`);

        if (listLenAfter === 0) {
            logger.log('✅ Debounce flush worked (queue drained).');
        } else {
            logger.error('❌ Debounce flush failed (items remain).');
        }

        // Cleanup
        await prisma.tenant.delete({ where: { id: tenantId } });

    } catch (error) {
        logger.error('Test Failed:', error);
        process.exit(1);
    } finally {
        await app.close();
    }
}

main();
