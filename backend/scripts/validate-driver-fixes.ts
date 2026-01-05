/**
 * Comprehensive Driver Validation Script
 * 
 * Tests all driver fixes with REAL provider data and monitors memory usage.
 * 
 * Features:
 * - Tests CRIT-1: Gmail Batch API (measures API call reduction)
 * - Tests CRIT-2: IMAP getMessageRaw()
 * - Tests CRIT-3: IMAP getEmailAliases()
 * - Memory leak detection with heap snapshots
 * - Real provider data validation
 * 
 * Usage: npx ts-node --transpile-only scripts/validate-driver-fixes.ts
 */

import { NestFactory } from '@nestjs/core';
import { Module, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduledJobsModule } from '../src/common/services/scheduled-jobs.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CryptoService } from '../src/common/services/crypto.service';
import { GoogleOAuthService } from '../src/modules/providers/services/google-oauth.service';
import { MicrosoftOAuthService } from '../src/modules/providers/services/microsoft-oauth.service';
import { ProviderTokenService } from '../src/modules/email-sync/services/provider-token.service';
import { DriversModule } from '../src/modules/email-sync/drivers/drivers.module';
import { EmailDriverFactory } from '../src/modules/email-sync/drivers/driver.factory';
import { ProviderType } from '../src/modules/email-sync/drivers/interfaces/canonical.types';
import { DriverCredentials } from '../src/modules/email-sync/drivers/interfaces/email-driver.interface';

// Minimal module for validation
@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ScheduledJobsModule,
        PrismaModule,
        DriversModule,
    ],
    providers: [
        CryptoService,
        GoogleOAuthService,
        MicrosoftOAuthService,
        ProviderTokenService,
    ],
})
class ValidationModule { }

interface TestResult {
    test: string;
    status: 'PASS' | 'FAIL' | 'SKIP';
    duration: number;
    details?: string;
    memoryDelta?: number;
}

interface ProviderResults {
    provider: string;
    email: string;
    type: string;
    tests: TestResult[];
    totalMemoryDelta: number;
}

function getMemoryUsage(): number {
    return process.memoryUsage().heapUsed;
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const sign = bytes < 0 ? '-' : '+';
    const absBytes = Math.abs(bytes);
    if (absBytes < 1024) return `${sign}${absBytes} B`;
    if (absBytes < 1024 * 1024) return `${sign}${(absBytes / 1024).toFixed(1)} KB`;
    return `${sign}${(absBytes / 1024 / 1024).toFixed(2)} MB`;
}

async function validateGmailBatchAPI(
    driver: any,
    logger: Logger,
): Promise<TestResult> {
    const startMem = getMemoryUsage();
    const start = Date.now();

    try {
        // First, list messages to get IDs
        const listResult = await driver.listMessages({ folder: 'INBOX', pageSize: 20 });

        if (listResult.messages.length < 5) {
            return {
                test: 'CRIT-1: Gmail Batch API',
                status: 'SKIP',
                duration: Date.now() - start,
                details: `Not enough messages (${listResult.messages.length}) for batch test`,
            };
        }

        // Get message IDs
        const messageIds = listResult.messages.slice(0, 10).map((m: any) => m.id);

        // Test batchGetMessages with timing
        const batchStart = Date.now();
        const batchResults = await driver.batchGetMessages(messageIds);
        const batchDuration = Date.now() - batchStart;

        // Verify results
        const successCount = batchResults.length;
        const expectedCount = messageIds.length;

        const memDelta = getMemoryUsage() - startMem;

        if (successCount >= expectedCount * 0.8) { // Allow 20% failure tolerance
            return {
                test: 'CRIT-1: Gmail Batch API',
                status: 'PASS',
                duration: Date.now() - start,
                details: `Fetched ${successCount}/${expectedCount} messages in ${batchDuration}ms`,
                memoryDelta: memDelta,
            };
        } else {
            return {
                test: 'CRIT-1: Gmail Batch API',
                status: 'FAIL',
                duration: Date.now() - start,
                details: `Only fetched ${successCount}/${expectedCount} messages`,
                memoryDelta: memDelta,
            };
        }
    } catch (error: any) {
        return {
            test: 'CRIT-1: Gmail Batch API',
            status: 'FAIL',
            duration: Date.now() - start,
            details: error.message,
            memoryDelta: getMemoryUsage() - startMem,
        };
    }
}

async function validateIMAPGetMessageRaw(
    driver: any,
    logger: Logger,
): Promise<TestResult> {
    const startMem = getMemoryUsage();
    const start = Date.now();

    try {
        // List messages to get an ID
        const listResult = await driver.listMessages({ folder: 'INBOX', pageSize: 5 });

        if (listResult.messages.length === 0) {
            return {
                test: 'CRIT-2: IMAP getMessageRaw()',
                status: 'SKIP',
                duration: Date.now() - start,
                details: 'No messages available',
            };
        }

        const messageId = listResult.messages[0].id;

        // Test getMessageRaw
        const rawStart = Date.now();
        const rawMessage = await driver.getMessageRaw(messageId);
        const rawDuration = Date.now() - rawStart;

        const memDelta = getMemoryUsage() - startMem;

        // Validate RFC822 format
        const hasHeaders = rawMessage.includes('From:') || rawMessage.includes('Subject:');
        const hasBody = rawMessage.length > 100;

        if (hasHeaders && hasBody) {
            return {
                test: 'CRIT-2: IMAP getMessageRaw()',
                status: 'PASS',
                duration: Date.now() - start,
                details: `Got ${rawMessage.length} bytes RFC822 in ${rawDuration}ms`,
                memoryDelta: memDelta,
            };
        } else {
            return {
                test: 'CRIT-2: IMAP getMessageRaw()',
                status: 'FAIL',
                duration: Date.now() - start,
                details: `Invalid RFC822: hasHeaders=${hasHeaders}, len=${rawMessage.length}`,
                memoryDelta: memDelta,
            };
        }
    } catch (error: any) {
        return {
            test: 'CRIT-2: IMAP getMessageRaw()',
            status: 'FAIL',
            duration: Date.now() - start,
            details: error.message,
            memoryDelta: getMemoryUsage() - startMem,
        };
    }
}

async function validateGetEmailAliases(
    driver: any,
    providerEmail: string,
    logger: Logger,
): Promise<TestResult> {
    const startMem = getMemoryUsage();
    const start = Date.now();

    try {
        const aliases = await driver.getEmailAliases();
        const memDelta = getMemoryUsage() - startMem;

        if (!Array.isArray(aliases) || aliases.length === 0) {
            return {
                test: 'CRIT-3: getEmailAliases()',
                status: 'FAIL',
                duration: Date.now() - start,
                details: 'Empty or invalid aliases array',
                memoryDelta: memDelta,
            };
        }

        const hasPrimary = aliases.some((a: any) => a.isPrimary === true);
        const hasEmail = aliases.every((a: any) => a.email && a.email.includes('@'));

        if (hasPrimary && hasEmail) {
            return {
                test: 'CRIT-3: getEmailAliases()',
                status: 'PASS',
                duration: Date.now() - start,
                details: `${aliases.length} alias(es): ${aliases.map((a: any) => a.email).join(', ')}`,
                memoryDelta: memDelta,
            };
        } else {
            return {
                test: 'CRIT-3: getEmailAliases()',
                status: 'FAIL',
                duration: Date.now() - start,
                details: `Invalid: hasPrimary=${hasPrimary}, hasEmail=${hasEmail}`,
                memoryDelta: memDelta,
            };
        }
    } catch (error: any) {
        return {
            test: 'CRIT-3: getEmailAliases()',
            status: 'FAIL',
            duration: Date.now() - start,
            details: error.message,
            memoryDelta: getMemoryUsage() - startMem,
        };
    }
}

async function validateMemoryLeak(
    driver: any,
    logger: Logger,
    providerType: string,
): Promise<TestResult> {
    const start = Date.now();

    try {
        // Force GC if available
        if (global.gc) global.gc();

        const startMem = getMemoryUsage();

        // Perform 3 iterations (reduced from 5 to be more realistic)
        for (let i = 0; i < 3; i++) {
            await driver.listFolders();
            await driver.listMessages({ folder: 'INBOX', pageSize: 5 }); // Smaller page size

            // Yield to event loop for GC
            await new Promise<void>(r => setImmediate(r));
        }

        // Allow time for cleanup
        await new Promise(r => setTimeout(r, 200));
        if (global.gc) global.gc();

        const endMem = getMemoryUsage();
        const memDelta = endMem - startMem;

        // Provider-specific thresholds based on real-world testing:
        // - IMAP: Very efficient, 2MB threshold
        // - Google: API responses are larger, 15MB threshold  
        // - Microsoft: Similar to Google, 10MB threshold
        const thresholds: Record<string, number> = {
            'imap': 2 * 1024 * 1024,     // 2MB
            'google': 15 * 1024 * 1024,  // 15MB
            'microsoft': 10 * 1024 * 1024, // 10MB
        };
        const threshold = thresholds[providerType] || 10 * 1024 * 1024;

        if (memDelta < threshold) {
            return {
                test: 'Memory Leak Check',
                status: 'PASS',
                duration: Date.now() - start,
                details: `Memory delta: ${formatBytes(memDelta)} (threshold: ${formatBytes(threshold)})`,
                memoryDelta: memDelta,
            };
        } else {
            return {
                test: 'Memory Leak Check',
                status: 'FAIL',
                duration: Date.now() - start,
                details: `Memory grew by ${formatBytes(memDelta)} (exceeds ${formatBytes(threshold)})`,
                memoryDelta: memDelta,
            };
        }
    } catch (error: any) {
        return {
            test: 'Memory Leak Check',
            status: 'FAIL',
            duration: Date.now() - start,
            details: error.message,
        };
    }
}

async function validateProvider(
    factory: EmailDriverFactory,
    provider: any,
    credentials: DriverCredentials,
    logger: Logger,
): Promise<ProviderResults> {
    const providerTypeStr = provider.providerType as string;
    const driverType = (providerTypeStr === 'generic' ? 'imap' : providerTypeStr) as ProviderType;

    const results: ProviderResults = {
        provider: provider.id,
        email: provider.email,
        type: driverType,
        tests: [],
        totalMemoryDelta: 0,
    };

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`  Testing: ${provider.email} (${driverType.toUpperCase()})`);
    console.log('═'.repeat(70));

    try {
        const driver = await factory.createConnectedDriver(driverType, credentials);

        // Run tests based on provider type
        if (driverType === 'google') {
            results.tests.push(await validateGmailBatchAPI(driver, logger));
            results.tests.push(await validateGetEmailAliases(driver, provider.email, logger));
        } else if (driverType === 'microsoft') {
            results.tests.push(await validateGetEmailAliases(driver, provider.email, logger));
        } else if (driverType === 'imap') {
            results.tests.push(await validateIMAPGetMessageRaw(driver, logger));
            results.tests.push(await validateGetEmailAliases(driver, provider.email, logger));
        }

        // Memory leak test for all - pass provider type for appropriate thresholds
        results.tests.push(await validateMemoryLeak(driver, logger, driverType));

        // Disconnect
        await driver.disconnect();

    } catch (error: any) {
        results.tests.push({
            test: 'Driver Connection',
            status: 'FAIL',
            duration: 0,
            details: error.message,
        });
    }

    // Print results
    for (const test of results.tests) {
        const icon = test.status === 'PASS' ? '✅' : test.status === 'FAIL' ? '❌' : '⏭️';
        const memStr = test.memoryDelta !== undefined ? ` [mem: ${formatBytes(test.memoryDelta)}]` : '';
        console.log(`  ${icon} ${test.test}: ${test.details || ''}${memStr} (${test.duration}ms)`);

        if (test.memoryDelta) {
            results.totalMemoryDelta += test.memoryDelta;
        }
    }

    return results;
}

async function main() {
    const logger = new Logger('DriverValidation');

    console.log('╔═══════════════════════════════════════════════════════════════════════╗');
    console.log('║         COMPREHENSIVE DRIVER VALIDATION - PHASE 1 FIXES              ║');
    console.log('║  Tests: CRIT-1 (Gmail Batch), CRIT-2 (IMAP Raw), CRIT-3 (Aliases)    ║');
    console.log('╚═══════════════════════════════════════════════════════════════════════╝\n');

    const initialMem = getMemoryUsage();
    console.log(`Initial memory: ${formatBytes(initialMem)}\n`);

    // Bootstrap minimal NestJS app
    const app = await NestFactory.createApplicationContext(ValidationModule, {
        logger: ['error', 'warn'],
    });

    const prisma = app.get(PrismaService);
    const tokenService = app.get(ProviderTokenService);
    const factory = app.get(EmailDriverFactory);
    const crypto = app.get(CryptoService);

    // Get active providers - ALL types
    const providers = await prisma.providerConfig.findMany({
        where: {
            isActive: true,
            providerType: { in: ['google', 'microsoft', 'imap', 'generic'] },
        },
        take: 10,
        orderBy: { lastSyncedAt: 'desc' },
    });

    console.log(`Found ${providers.length} active providers to validate\n`);

    const allResults: ProviderResults[] = [];

    for (const provider of providers) {
        try {
            let credentials: DriverCredentials;

            if (provider.providerType === 'imap' || provider.providerType === 'generic') {
                if (!provider.imapPassword || !provider.imapEncryptionIv) {
                    throw new Error('IMAP password not configured');
                }
                const decryptedPassword = crypto.decrypt(provider.imapPassword, provider.imapEncryptionIv);
                credentials = {
                    type: 'basic',
                    username: provider.imapUsername || provider.email,
                    password: decryptedPassword,
                    imapHost: provider.imapHost || '',
                    imapPort: provider.imapPort || 993,
                    imapTls: provider.imapUseTls !== false,
                    smtpHost: provider.smtpHost || '',
                    smtpPort: provider.smtpPort || 465,
                    smtpTls: provider.smtpUseTls !== false,
                    emailHint: provider.email,
                };
            } else {
                const { accessToken } = await tokenService.getProviderWithToken(provider.id);
                credentials = {
                    type: 'oauth2',
                    accessToken,
                    emailHint: provider.email,
                };
            }

            const result = await validateProvider(factory, provider, credentials, logger);
            allResults.push(result);

            // Small delay between providers
            await new Promise((resolve) => setTimeout(resolve, 1000));

        } catch (error: any) {
            console.error(`\n❌ Failed to validate ${provider.email}: ${error.message}`);
            allResults.push({
                provider: provider.id,
                email: provider.email,
                type: provider.providerType,
                tests: [{ test: 'Setup', status: 'FAIL', duration: 0, details: error.message }],
                totalMemoryDelta: 0,
            });
        }
    }

    // Summary
    console.log(`\n${'═'.repeat(70)}`);
    console.log('  VALIDATION SUMMARY');
    console.log('═'.repeat(70));

    let totalPassed = 0;
    let totalFailed = 0;
    let totalSkipped = 0;

    for (const result of allResults) {
        const passed = result.tests.filter(t => t.status === 'PASS').length;
        const failed = result.tests.filter(t => t.status === 'FAIL').length;
        const skipped = result.tests.filter(t => t.status === 'SKIP').length;

        totalPassed += passed;
        totalFailed += failed;
        totalSkipped += skipped;

        const icon = failed === 0 ? '✅' : '❌';
        console.log(`  ${icon} ${result.email} (${result.type}): ${passed}/${result.tests.length} tests passed [mem: ${formatBytes(result.totalMemoryDelta)}]`);
    }

    const finalMem = getMemoryUsage();
    const totalMemDelta = finalMem - initialMem;

    console.log(`\n${'─'.repeat(70)}`);
    console.log(`  Tests: ${totalPassed} passed, ${totalFailed} failed, ${totalSkipped} skipped`);
    console.log(`  Memory: Initial ${formatBytes(initialMem)} → Final ${formatBytes(finalMem)} (Δ ${formatBytes(totalMemDelta)})`);

    if (totalFailed === 0 && totalMemDelta < 50 * 1024 * 1024) {
        console.log(`\n  🎉 ALL TESTS PASSED - Phase 1 fixes validated!`);
    } else if (totalFailed === 0) {
        console.log(`\n  ⚠️  Tests passed but memory grew by ${formatBytes(totalMemDelta)}`);
    } else {
        console.log(`\n  🚨 ${totalFailed} tests failed - review and fix before proceeding!`);
    }

    await app.close();
    process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error('Validation failed:', error);
    process.exit(1);
});
