/**
 * Driver Validation Script
 *
 * Tests the email driver abstraction layer against REAL providers
 * using credentials stored in the database.
 *
 * Usage: npx ts-node --transpile-only -r tsconfig-paths/register src/modules/email-sync/drivers/validate-drivers.script.ts
 */

import { NestFactory } from '@nestjs/core';
import { Module, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { GoogleOAuthService } from '../../providers/services/google-oauth.service';
import { MicrosoftOAuthService } from '../../providers/services/microsoft-oauth.service';
import { ProviderTokenService } from '../services/provider-token.service';
import { DriversModule } from './drivers.module';
import { EmailDriverFactory } from './driver.factory';
import { ResilienceService } from './resilience/resilience.service';
import { ProviderType } from './interfaces/canonical.types';
import { DriverCredentials } from './interfaces/email-driver.interface';

// Minimal module for validation
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
class ValidationModule {}

interface ValidationResult {
  providerId: string;
  email: string;
  providerType: string;
  tests: {
    name: string;
    passed: boolean;
    duration: number;
    error?: string;
    details?: any;
  }[];
  overallPassed: boolean;
}

async function validateDriver(
  factory: EmailDriverFactory,
  resilience: ResilienceService,
  provider: any,
  credentials: DriverCredentials,
  logger: Logger,
): Promise<ValidationResult> {
  const result: ValidationResult = {
    providerId: provider.id,
    email: provider.email,
    providerType: provider.providerType,
    tests: [],
    overallPassed: true,
  };

  // Normalize 'generic' to 'imap' for driver factory
  const providerTypeStr = provider.providerType as string;
  const driverType = (providerTypeStr === 'generic' ? 'imap' : providerTypeStr) as ProviderType;

  logger.log(`\n${'='.repeat(60)}`);
  logger.log(`Testing: ${provider.email} (${providerTypeStr}${providerTypeStr !== driverType ? ` -> ${driverType}` : ''})`);
  logger.log(`${'='.repeat(60)}`);

  try {
    // Test 1: Create resilient driver and connect
    const connectStart = Date.now();
    const driver = await factory.createResilientDriver(
      driverType,
      provider.id,
      credentials,
    );
    const connectDuration = Date.now() - connectStart;

    result.tests.push({
      name: 'Connect',
      passed: driver.isConnected(),
      duration: connectDuration,
      details: { connected: driver.isConnected() },
    });
    logger.log(`  [PASS] Connect (${connectDuration}ms)`);

    // Test 2: List folders
    const foldersStart = Date.now();
    const folders = await driver.listFolders();
    const foldersDuration = Date.now() - foldersStart;

    const hasInbox = folders.some((f) => f.type === 'INBOX');
    const hasSent = folders.some((f) => f.type === 'SENT');
    const hasDrafts = folders.some((f) => f.type === 'DRAFTS');
    const hasTrash = folders.some((f) => f.type === 'TRASH');

    result.tests.push({
      name: 'List Folders',
      passed: folders.length > 0 && hasInbox,
      duration: foldersDuration,
      details: {
        count: folders.length,
        hasInbox,
        hasSent,
        hasDrafts,
        hasTrash,
        folders: folders.slice(0, 10).map((f) => ({ name: f.name, type: f.type, unread: f.unreadCount })),
      },
    });

    if (folders.length > 0 && hasInbox) {
      logger.log(`  [PASS] List Folders: ${folders.length} folders (${foldersDuration}ms)`);
      logger.log(`         Standard folders: INBOX=${hasInbox}, SENT=${hasSent}, DRAFTS=${hasDrafts}, TRASH=${hasTrash}`);
    } else {
      logger.error(`  [FAIL] List Folders: ${folders.length} folders, hasInbox=${hasInbox}`);
      result.overallPassed = false;
    }

    // Test 3: Get INBOX folder
    const inboxStart = Date.now();
    const inbox = await driver.getFolder('INBOX');
    const inboxDuration = Date.now() - inboxStart;

    result.tests.push({
      name: 'Get INBOX',
      passed: inbox !== null,
      duration: inboxDuration,
      details: inbox ? { id: inbox.id, name: inbox.name, unread: inbox.unreadCount, total: inbox.totalCount } : null,
    });

    if (inbox) {
      logger.log(`  [PASS] Get INBOX: ${inbox.totalCount} messages, ${inbox.unreadCount} unread (${inboxDuration}ms)`);
    } else {
      logger.error(`  [FAIL] Get INBOX: null`);
      result.overallPassed = false;
    }

    // Test 4: List messages (first page)
    const messagesStart = Date.now();
    const messagesResult = await driver.listMessages({
      folder: 'INBOX',
      pageSize: 5,
    });
    const messagesDuration = Date.now() - messagesStart;

    result.tests.push({
      name: 'List Messages',
      passed: Array.isArray(messagesResult.messages),
      duration: messagesDuration,
      details: {
        count: messagesResult.messages.length,
        hasMore: messagesResult.hasMore,
        firstSubjects: messagesResult.messages.slice(0, 3).map((m) => m.subject?.substring(0, 50)),
      },
    });

    if (Array.isArray(messagesResult.messages)) {
      logger.log(`  [PASS] List Messages: ${messagesResult.messages.length} messages (${messagesDuration}ms)`);
      messagesResult.messages.slice(0, 2).forEach((m) => {
        logger.log(`         - "${m.subject?.substring(0, 50)}..." from ${m.from?.email}`);
      });
    } else {
      logger.error(`  [FAIL] List Messages`);
      result.overallPassed = false;
    }

    // Test 5: Get single message (if any exist)
    if (messagesResult.messages.length > 0) {
      const msgId = messagesResult.messages[0].id;
      const msgStart = Date.now();
      const message = await driver.getMessage(msgId, { includeBody: true });
      const msgDuration = Date.now() - msgStart;

      result.tests.push({
        name: 'Get Single Message',
        passed: message !== null,
        duration: msgDuration,
        details: message
          ? {
              id: message.id,
              subject: message.subject?.substring(0, 50),
              hasBody: !!(message.bodyHtml || message.bodyText),
              attachmentCount: message.attachments?.length || 0,
            }
          : null,
      });

      if (message) {
        logger.log(`  [PASS] Get Message: "${message.subject?.substring(0, 40)}..." (${msgDuration}ms)`);
        logger.log(`         Body: ${message.bodyHtml ? 'HTML' : ''} ${message.bodyText ? 'TEXT' : ''}, Attachments: ${message.attachments?.length || 0}`);
      } else {
        logger.error(`  [FAIL] Get Message: null`);
        result.overallPassed = false;
      }
    }

    // Small delay before next test to respect rate limits
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Test 6: Get user info
    const userStart = Date.now();
    const userInfo = await driver.getUserInfo();
    const userDuration = Date.now() - userStart;

    result.tests.push({
      name: 'Get User Info',
      passed: !!userInfo.email,
      duration: userDuration,
      details: userInfo,
    });

    if (userInfo.email) {
      logger.log(`  [PASS] Get User Info: ${userInfo.email} / ${userInfo.name} (${userDuration}ms)`);
    } else {
      logger.error(`  [FAIL] Get User Info`);
      result.overallPassed = false;
    }

    // Test 7: Check resilience metrics
    const metrics = resilience.getMetrics();
    result.tests.push({
      name: 'Resilience Metrics',
      passed: true,
      duration: 0,
      details: {
        totalRequests: metrics.totalRequests,
        successfulRequests: metrics.successfulRequests,
        failedRequests: metrics.failedRequests,
        retriedRequests: metrics.retriedRequests,
        rateLimitedRequests: metrics.rateLimitedRequests,
      },
    });
    logger.log(`  [INFO] Resilience: ${metrics.totalRequests} requests, ${metrics.retriedRequests} retried, ${metrics.rateLimitedRequests} rate-limited`);

    // Disconnect
    await driver.disconnect();
    logger.log(`  [PASS] Disconnect`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`  [FAIL] Error: ${errorMessage}`);
    result.tests.push({
      name: 'Driver Test',
      passed: false,
      duration: 0,
      error: errorMessage,
    });
    result.overallPassed = false;
  }

  return result;
}

async function main() {
  const logger = new Logger('DriverValidation');

  logger.log('Starting Driver Validation with REAL provider data...\n');

  // Bootstrap minimal NestJS app
  const app = await NestFactory.createApplicationContext(ValidationModule, {
    logger: ['error', 'warn', 'log'],
  });

  const prisma = app.get(PrismaService);
  const tokenService = app.get(ProviderTokenService);
  const factory = app.get(EmailDriverFactory);
  const resilience = app.get(ResilienceService);
  const crypto = app.get(CryptoService);

  // Get active providers - ALL types including IMAP/generic
  const providers = await prisma.providerConfig.findMany({
    where: {
      isActive: true,
      providerType: { in: ['google', 'microsoft', 'imap', 'generic'] },
    },
    take: 10, // Limit for testing
    orderBy: { lastSyncedAt: 'desc' },
  });

  logger.log(`Found ${providers.length} active providers to validate\n`);

  const results: ValidationResult[] = [];

  for (const provider of providers) {
    try {
      let credentials: DriverCredentials;

      // IMAP/generic providers use basic auth with encrypted password
      if (provider.providerType === 'imap' || provider.providerType === 'generic') {
        // IMAP uses basic auth with decrypted password
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
        // OAuth2 providers (Google, Microsoft)
        const { accessToken } = await tokenService.getProviderWithToken(provider.id);
        credentials = {
          type: 'oauth2',
          accessToken,
          emailHint: provider.email,
        };
      }

      const result = await validateDriver(factory, resilience, provider, credentials, logger);
      results.push(result);

      // Small delay between providers to be nice to APIs
      await new Promise((resolve) => setTimeout(resolve, 1000));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to validate ${provider.email}: ${errorMessage}`);
      results.push({
        providerId: provider.id,
        email: provider.email,
        providerType: provider.providerType,
        tests: [{ name: 'Token Refresh', passed: false, duration: 0, error: errorMessage }],
        overallPassed: false,
      });
    }
  }

  // Summary
  logger.log(`\n${'='.repeat(60)}`);
  logger.log('VALIDATION SUMMARY');
  logger.log(`${'='.repeat(60)}`);

  const passed = results.filter((r) => r.overallPassed).length;
  const failed = results.filter((r) => !r.overallPassed).length;

  for (const result of results) {
    const status = result.overallPassed ? 'PASS' : 'FAIL';
    const testsPassed = result.tests.filter((t) => t.passed).length;
    logger.log(`  [${status}] ${result.email} (${result.providerType}): ${testsPassed}/${result.tests.length} tests`);
  }

  logger.log(`\nTotal: ${passed} passed, ${failed} failed out of ${results.length} providers`);

  // Final resilience metrics
  const finalMetrics = resilience.getMetrics();
  logger.log(`\nResilience Totals:`);
  logger.log(`  Requests: ${finalMetrics.totalRequests} total, ${finalMetrics.successfulRequests} success, ${finalMetrics.failedRequests} failed`);
  logger.log(`  Retries: ${finalMetrics.retriedRequests}, Rate-limited: ${finalMetrics.rateLimitedRequests}`);

  await app.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Validation failed:', error);
  process.exit(1);
});
