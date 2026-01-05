
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { Logger } from '@nestjs/common';
import { ImapSyncService } from '../src/modules/email-sync/services/imap/imap-sync.service';
import { GoogleSyncService } from '../src/modules/email-sync/services/gmail/google-sync.service';
import { MicrosoftSyncService } from '../src/modules/email-sync/services/microsoft/microsoft-sync.service';

/**
 * Validation Script for Phase 2: Sync Optimization
 * verifies that all sync services have correct default batch sizes
 * to support high-throughput scaling.
 */
async function main() {
    const logger = new Logger('SyncConfigValidation');
    logger.log('Starting Sync Configuration Validation...');

    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn', 'log'],
    });

    try {
        const imapService = app.get(ImapSyncService);
        const googleService = app.get(GoogleSyncService);
        const msService = app.get(MicrosoftSyncService);

        const validateService = (name: string, service: any, expectedBatch: number, expectedFull: number) => {
            // Access protected properties via casting
            const batchSize = service.batchSize;
            const fullSyncMax = service.fullSyncMaxMessages;

            logger.log(`[${name}] Batch Size: ${batchSize} (Target >= ${expectedBatch})`);
            logger.log(`[${name}] Full Sync Max: ${fullSyncMax} (Target >= ${expectedFull})`);

            if (batchSize < expectedBatch) {
                throw new Error(`[${name}] Batch Size too low! Got ${batchSize}, expected ${expectedBatch}`);
            }
            if (fullSyncMax < expectedFull) {
                throw new Error(`[${name}] Full Sync Max too low! Got ${fullSyncMax}, expected ${expectedFull}`);
            }
            logger.log(`✅ [${name}] Configuration optimized.`);
        };

        logger.log('--- Verifying Defaults ---');
        validateService('IMAP', imapService, 500, 1000);
        validateService('Google', googleService, 500, 1000);
        validateService('Microsoft', msService, 50, 1000); // MS has lower batch limit

        logger.log('\n🎉 SUCCESS: All sync services are optimized for high throughput.');

    } catch (error) {
        logger.error('Validation Failed:', error);
        process.exit(1);
    } finally {
        await app.close();
    }
}

main();
