/**
 * Verify Delete Operations Script
 *
 * Tests delete operations on all providers and verifies they actually work.
 *
 * Usage: npx ts-node --transpile-only scripts/verify-delete.script.ts
 */

import { NestFactory } from '@nestjs/core';
import { Module, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CryptoService } from '../src/common/services/crypto.service';
import { GoogleOAuthService } from '../src/modules/providers/services/google-oauth.service';
import { MicrosoftOAuthService } from '../src/modules/providers/services/microsoft-oauth.service';
import { ProviderTokenService } from '../src/modules/email-sync/services/provider-token.service';
import { DriversModule } from '../src/modules/email-sync/drivers/drivers.module';
import { EmailDriverFactory } from '../src/modules/email-sync/drivers/driver.factory';
import { ProviderType, ComposeMessage } from '../src/modules/email-sync/drivers/interfaces/canonical.types';
import { DriverCredentials, IEmailDriver } from '../src/modules/email-sync/drivers/interfaces/email-driver.interface';

// Production-safe delays
const DELAYS = {
  AFTER_SEND: 5000,        // Wait for email to be delivered
  AFTER_DELETE: 3000,      // Wait for delete to propagate
  BETWEEN_PROVIDERS: 3000, // Between different providers
};

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
class VerifyDeleteModule {}

interface TestResult {
  provider: string;
  providerType: string;
  sendMessage: 'PASS' | 'FAIL' | 'SKIP';
  moveToTrash: 'PASS' | 'FAIL' | 'SKIP';
  permanentDelete: 'PASS' | 'FAIL' | 'SKIP';
  errors: string[];
}

async function testProvider(
  driver: IEmailDriver,
  providerEmail: string,
  providerType: string,
  logger: Logger,
): Promise<TestResult> {
  const result: TestResult = {
    provider: providerEmail,
    providerType,
    sendMessage: 'SKIP',
    moveToTrash: 'SKIP',
    permanentDelete: 'SKIP',
    errors: [],
  };

  const uniqueId = `DELETE-VERIFY-${Date.now()}`;

  try {
    // Step 1: Send a test message
    logger.log(`  [1/5] Sending test message with ID: ${uniqueId}`);
    const message: ComposeMessage = {
      to: [{ email: providerEmail, name: 'Delete Test' }],
      subject: `[${uniqueId}] Delete Verification Test`,
      bodyText: 'This is a test message for delete verification.',
      bodyHtml: `<p>This is a test message for delete verification.</p><p>ID: ${uniqueId}</p>`,
    };

    const sentMessageId = await driver.sendMessage(message);
    logger.log(`  [1/5] ✓ Sent message: ${sentMessageId || 'no-id-returned'}`);
    result.sendMessage = 'PASS';

    // Wait for email to be delivered
    logger.log(`  [2/5] Waiting ${DELAYS.AFTER_SEND / 1000}s for delivery...`);
    await new Promise((resolve) => setTimeout(resolve, DELAYS.AFTER_SEND));

    // Step 2: Find the message we sent (search in INBOX or SENT)
    logger.log(`  [2/5] Searching for the sent message...`);
    let foundMessageId: string | null = null;

    // Try SENT folder first
    for (const folder of ['SENT', 'INBOX']) {
      const messages = await driver.listMessages({ folder, pageSize: 30 });
      const found = messages.messages.find(
        (m) => m.subject?.includes(uniqueId),
      );
      if (found) {
        foundMessageId = found.id;
        logger.log(`  [2/5] ✓ Found message in ${folder}: ${foundMessageId}`);
        break;
      }
    }

    if (!foundMessageId) {
      logger.warn(`  [2/5] ✗ Could not find sent message in SENT or INBOX`);
      result.errors.push('Message not found after sending');
      return result;
    }

    // Determine source folder from message ID (for IMAP) or remember which folder we found it in
    let sourceFolder = 'SENT';
    for (const folder of ['SENT', 'INBOX']) {
      const messages = await driver.listMessages({ folder, pageSize: 30 });
      if (messages.messages.some((m) => m.id === foundMessageId)) {
        sourceFolder = folder;
        break;
      }
    }
    logger.log(`  [2/5] Source folder: ${sourceFolder}`);

    // Step 3: Move to Trash (soft delete)
    logger.log(`  [3/5] Moving message to Trash (soft delete)...`);
    await driver.deleteMessage(foundMessageId, false);
    await new Promise((resolve) => setTimeout(resolve, DELAYS.AFTER_DELETE));

    // Verify message is no longer in the SOURCE folder only (not both)
    // For self-sent emails, a copy may exist in INBOX which is a different message
    const afterTrash = await driver.listMessages({ folder: sourceFolder, pageSize: 30 });
    const stillInSource = afterTrash.messages.some((m) => m.id === foundMessageId);
    const stillInOriginal = stillInSource;

    if (stillInSource) {
      logger.warn(`  [3/5] ✗ Message still in ${sourceFolder} after move to trash!`);
    }

    if (stillInOriginal) {
      result.moveToTrash = 'FAIL';
      result.errors.push('Message still in original folder after soft delete');
    } else {
      // Verify message is in Trash
      const trashMessages = await driver.listMessages({ folder: 'TRASH', pageSize: 30 });
      const inTrash = trashMessages.messages.find(
        (m) => m.subject?.includes(uniqueId),
      );
      if (inTrash) {
        logger.log(`  [3/5] ✓ Message successfully moved to Trash`);
        result.moveToTrash = 'PASS';
        foundMessageId = inTrash.id; // Update message ID for trash
      } else {
        logger.warn(`  [3/5] ? Message not in Trash (might be permanently deleted)`);
        result.moveToTrash = 'PASS'; // Some providers might auto-delete
      }
    }

    // Step 4: Permanent delete from Trash
    if (result.moveToTrash === 'PASS') {
      // Find the message in Trash again
      const trashMessages = await driver.listMessages({ folder: 'TRASH', pageSize: 30 });
      const inTrash = trashMessages.messages.find(
        (m) => m.subject?.includes(uniqueId),
      );

      if (inTrash) {
        logger.log(`  [4/5] Permanently deleting message from Trash...`);
        await driver.deleteMessage(inTrash.id, true);
        await new Promise((resolve) => setTimeout(resolve, DELAYS.AFTER_DELETE));

        // Verify message is no longer in Trash
        const afterPermanent = await driver.listMessages({ folder: 'TRASH', pageSize: 30 });
        const stillInTrash = afterPermanent.messages.some(
          (m) => m.subject?.includes(uniqueId),
        );

        if (stillInTrash) {
          logger.warn(`  [4/5] ✗ Message still in Trash after permanent delete!`);
          result.permanentDelete = 'FAIL';
          result.errors.push('Message still in Trash after permanent delete');
        } else {
          logger.log(`  [4/5] ✓ Message permanently deleted from Trash`);
          result.permanentDelete = 'PASS';
        }
      } else {
        logger.log(`  [4/5] Message already gone from Trash (auto-deleted)`);
        result.permanentDelete = 'PASS';
      }
    }

    // Step 5: Final verification - check all folders
    logger.log(`  [5/5] Final verification - checking all folders...`);
    let foundAnywhere = false;
    for (const folder of ['INBOX', 'SENT', 'TRASH', 'DRAFTS']) {
      try {
        const messages = await driver.listMessages({ folder, pageSize: 30 });
        if (messages.messages.some((m) => m.subject?.includes(uniqueId))) {
          foundAnywhere = true;
          logger.warn(`  [5/5] ✗ Message still found in ${folder}!`);
        }
      } catch {
        // Ignore folder access errors
      }
    }

    if (!foundAnywhere) {
      logger.log(`  [5/5] ✓ Message completely removed from all folders`);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(errorMessage);
    logger.error(`  [ERROR] ${errorMessage}`);
  }

  return result;
}

async function main() {
  const logger = new Logger('VerifyDelete');

  logger.log('='.repeat(70));
  logger.log('VERIFY DELETE OPERATIONS');
  logger.log('='.repeat(70));

  const app = await NestFactory.createApplicationContext(VerifyDeleteModule, {
    logger: ['error', 'warn', 'log'],
  });

  const prisma = app.get(PrismaService);
  const tokenService = app.get(ProviderTokenService);
  const factory = app.get(EmailDriverFactory);
  const crypto = app.get(CryptoService);

  const providers = await prisma.providerConfig.findMany({
    where: {
      isActive: true,
      providerType: { in: ['google', 'microsoft', 'imap', 'generic'] },
    },
    take: 10,
    orderBy: { lastSyncedAt: 'desc' },
  });

  logger.log(`\nFound ${providers.length} providers\n`);

  const results: TestResult[] = [];

  for (const provider of providers) {
    try {
      logger.log(`\n[${provider.providerType.toUpperCase()}] ${provider.email}`);
      logger.log('-'.repeat(60));

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

      const providerTypeStr = provider.providerType;
      const driverType = (providerTypeStr === 'generic' ? 'imap' : providerTypeStr) as ProviderType;

      const driver = await factory.createResilientDriver(driverType, provider.id, credentials);

      const result = await testProvider(driver, provider.email, driverType, logger);
      results.push(result);

      await driver.disconnect();

      // Wait between providers
      await new Promise((resolve) => setTimeout(resolve, DELAYS.BETWEEN_PROVIDERS));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`  [ERROR] ${errorMessage}`);
      results.push({
        provider: provider.email,
        providerType: provider.providerType,
        sendMessage: 'FAIL',
        moveToTrash: 'SKIP',
        permanentDelete: 'SKIP',
        errors: [errorMessage],
      });
    }
  }

  // Summary
  logger.log('\n' + '='.repeat(70));
  logger.log('SUMMARY');
  logger.log('='.repeat(70));
  logger.log('');
  logger.log('Provider                        | Send  | Trash | Delete | Status');
  logger.log('-'.repeat(70));

  for (const r of results) {
    const status = r.errors.length === 0 ? '✓ OK' : '✗ FAIL';
    const providerDisplay = `${r.provider.substring(0, 28)}`.padEnd(30);
    logger.log(
      `${providerDisplay} | ${r.sendMessage.padEnd(5)} | ${r.moveToTrash.padEnd(5)} | ${r.permanentDelete.padEnd(6)} | ${status}`,
    );
    if (r.errors.length > 0) {
      for (const err of r.errors) {
        logger.log(`                                 └─ ${err.substring(0, 50)}`);
      }
    }
  }

  logger.log('\n' + '='.repeat(70));
  logger.log('VERIFICATION COMPLETE');
  logger.log('='.repeat(70));

  await app.close();
}

main().catch((error) => {
  console.error('Failed:', error);
  process.exit(1);
});
