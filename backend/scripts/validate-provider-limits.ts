
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailDriverFactory } from '../src/modules/email-sync/drivers/driver.factory';
import { ImapSyncService } from '../src/modules/email-sync/services/imap/imap-sync.service';
import { GoogleSyncService } from '../src/modules/email-sync/services/gmail/google-sync.service';
import { MicrosoftSyncService } from '../src/modules/email-sync/services/microsoft/microsoft-sync.service';
import { CryptoService } from '../src/common/services/crypto.service';
import { ProviderTokenService } from '../src/modules/email-sync/services/provider-token.service';

/**
 * Live Validation Script
 * Connects to ACTUAL providers in the database and attempts to fetch messages
 * with the new batch sizes to prove they work against the live APIs.
 */
async function main() {
    const logger = new Logger('LiveLimitValidation');
    logger.log('Starting Live Provider Limit Validation...');

    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn', 'log'],
    });

    const fs = require('fs');
    const logFile = 'validation-debug.log';
    const logToFile = (msg: string) => fs.appendFileSync(logFile, msg + '\n');
    logToFile(`\n--- Starting Run at ${new Date().toISOString()} ---`);


    try {
        const prisma = app.get(PrismaService);
        const driverFactory = app.get(EmailDriverFactory);
        const crypto = app.get(CryptoService);
        const providerTokenService = app.get(ProviderTokenService);

        const imapService = app.get(ImapSyncService);
        const googleService = app.get(GoogleSyncService);
        const msService = app.get(MicrosoftSyncService);

        // 1. Validate Google (Batch: 500)
        logger.log('\n--- Testing Google (Limit: 500) ---');
        const googleProviders = await prisma.providerConfig.findMany({
            where: { providerType: 'google', isActive: true },
            take: 50
        });

        if (googleProviders.length === 0) {
            logger.warn('Skipping Google test: No active providers found.');
        } else {
            let success = false;
            for (const googleProvider of googleProviders) {
                try {
                    logger.log(`Trying Google provider: ${googleProvider.email} (${googleProvider.id})`);
                    if (!googleProvider.accessToken) throw new Error('No access token');

                    const { provider, accessToken } = await providerTokenService.getProviderWithToken(googleProvider.id);
                    const credentials = { type: 'oauth2', accessToken, emailHint: provider.email };
                    const driver = await driverFactory.createConnectedDriver('google', credentials as any);

                    const pageSize = (googleService as any).batchSize; // 500
                    logger.log(`Attempting listMessages with pageSize: ${pageSize}`);
                    const result = await driver.listMessages({ folder: 'INBOX', pageSize });
                    logger.log(`✅ Success! Fetched ${result.messages.length} messages from Google.`);
                    success = true;
                    break;
                } catch (e: any) {
                    logger.warn(`❌ Failed with ${googleProvider.email}: ${e.message}`);
                    logToFile(`Google Failure [${googleProvider.email}]: ${e.message}`);
                }
            }
            if (!success) logger.error('❌ Google Validation Failed: No working providers found.');
        }

        // 2. Validate Microsoft (Batch: 50)
        logger.log('\n--- Testing Microsoft (Limit: 50) ---');
        const msProviders = await prisma.providerConfig.findMany({
            where: { providerType: 'microsoft', isActive: true },
            take: 50
        });

        if (msProviders.length === 0) {
            logger.warn('Skipping Microsoft test: No active providers found.');
        } else {
            let success = false;
            for (const msProvider of msProviders) {
                try {
                    logger.log(`Trying Microsoft provider: ${msProvider.email} (${msProvider.id})`);
                    if (!msProvider.accessToken) throw new Error('No access token');

                    const { provider, accessToken } = await providerTokenService.getProviderWithToken(msProvider.id);
                    const credentials = { type: 'oauth2', accessToken, emailHint: provider.email };
                    const driver = await driverFactory.createConnectedDriver('microsoft', credentials as any);

                    const pageSize = (msService as any).batchSize; // 50
                    logger.log(`Attempting listMessages with pageSize: ${pageSize}`);
                    const result = await driver.listMessages({ folder: 'INBOX', pageSize });
                    logger.log(`✅ Success! Fetched ${result.messages.length} messages from Microsoft.`);
                    success = true;
                    break;
                } catch (e: any) {
                    logger.warn(`❌ Failed with ${msProvider.email}: ${e.message}`);
                    logToFile(`Microsoft Failure [${msProvider.email}]: ${e.message}`);
                }
            }
            if (!success) logger.error('❌ Microsoft Validation Failed: No working providers found.');
        }

        // 3. Validate IMAP (Batch: 500)
        logger.log('\n--- Testing IMAP (Limit: 500) ---');
        const imapProviders = await prisma.providerConfig.findMany({
            where: { providerType: 'imap', isActive: true },
            take: 50
        });

        if (imapProviders.length === 0) {
            logger.warn('Skipping IMAP test: No active providers found.');
        } else {
            let success = false;
            for (const imapProvider of imapProviders) {
                try {
                    logger.log(`Trying IMAP provider: ${imapProvider.email} (${imapProvider.id})`);
                    if (!imapProvider.imapPassword) throw new Error('No password');

                    const password = crypto.decrypt(imapProvider.imapPassword!, imapProvider.imapEncryptionIv!);
                    const credentials = {
                        type: 'basic',
                        username: imapProvider.imapUsername,
                        password: password,
                        host: imapProvider.imapHost,
                        port: imapProvider.imapPort,
                        secure: imapProvider.imapUseTls
                    };
                    const driver = await driverFactory.createConnectedDriver('imap', credentials as any);

                    const pageSize = (imapService as any).batchSize; // 500
                    logger.log(`Attempting listMessages with pageSize: ${pageSize}`);
                    const result = await driver.listMessages({ folder: 'INBOX', pageSize });
                    logger.log(`✅ Success! Fetched ${result.messages.length} messages from IMAP.`);
                    success = true;
                    break;
                } catch (e: any) {
                    logger.warn(`❌ Failed with ${imapProvider.email}: ${e.message}`);
                    logToFile(`IMAP Failure [${imapProvider.email}]: ${e.message}`);
                }
            }
            if (!success) logger.error('❌ IMAP Validation Failed: No working providers found.');
        }

    } catch (error) {
        logger.error('Fatal Validation Error:', error);
        process.exit(1);
    } finally {
        await app.close();
    }
}

main();
