/**
 * Test IDLE Subscription Script
 *
 * Tests IMAP IDLE real-time notifications with a real provider.
 * This script will:
 * 1. Connect to the IMAP provider
 * 2. Start IDLE subscription on INBOX
 * 3. Wait for real-time notifications (send yourself an email to test!)
 * 4. Display notification events as they arrive
 *
 * Usage: npx ts-node --transpile-only -r tsconfig-paths/register src/modules/email-sync/drivers/test-idle.script.ts
 *
 * To test:
 * 1. Run this script
 * 2. Send an email to your test account from another account
 * 3. Watch for "exists" event in the console
 * 4. Press Ctrl+C to stop
 */

import { NestFactory } from '@nestjs/core';
import { Module, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { DriversModule } from './drivers.module';
import { EmailDriverFactory } from './driver.factory';
import { ProviderType, ProviderChange } from './interfaces/canonical.types';
import { DriverCredentials } from './interfaces/email-driver.interface';
import { IMAPDriver } from './imap/imap.driver';

// Minimal module for testing
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    DriversModule,
  ],
  providers: [CryptoService],
})
class TestIdleModule {}

async function main() {
  const logger = new Logger('TestIDLE');

  logger.log('='.repeat(70));
  logger.log('IMAP IDLE REAL-TIME NOTIFICATIONS TEST');
  logger.log('='.repeat(70));
  logger.log('');
  logger.log('This script will monitor your INBOX for changes.');
  logger.log('To test: Send yourself an email from another account.');
  logger.log('Press Ctrl+C to stop.');
  logger.log('');

  const app = await NestFactory.createApplicationContext(TestIdleModule, {
    logger: ['error', 'warn', 'log'],
  });

  const prisma = app.get(PrismaService);
  const factory = app.get(EmailDriverFactory);
  const crypto = app.get(CryptoService);

  // Find IMAP provider
  const provider = await prisma.providerConfig.findFirst({
    where: {
      isActive: true,
      providerType: { in: ['imap', 'generic'] },
    },
    orderBy: { lastSyncedAt: 'desc' },
  });

  if (!provider) {
    logger.error('No IMAP provider found in database');
    await app.close();
    process.exit(1);
  }

  logger.log(`Found IMAP provider: ${provider.email}`);
  logger.log('-'.repeat(70));

  try {
    // Build credentials
    if (!provider.imapPassword || !provider.imapEncryptionIv) {
      throw new Error('IMAP password not configured');
    }

    const decryptedPassword = crypto.decrypt(
      provider.imapPassword,
      provider.imapEncryptionIv,
    );

    const credentials: DriverCredentials = {
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

    // Create driver (not resilient - we need direct access to subscribeToChanges)
    const driver = new IMAPDriver();
    await driver.connect(credentials);

    logger.log('✓ Connected to IMAP server');

    // Check if IDLE is supported by listing folders first (populates cache)
    await driver.listFolders();
    logger.log('✓ Folder list retrieved');

    // Define notification callback
    let notificationCount = 0;
    const startTime = Date.now();

    const handleChanges = async (changes: ProviderChange[]) => {
      notificationCount++;
      const elapsed = Math.floor((Date.now() - startTime) / 1000);

      logger.log('');
      logger.log('='.repeat(50));
      logger.log(`📬 NOTIFICATION #${notificationCount} (after ${elapsed}s)`);
      logger.log('='.repeat(50));

      for (const change of changes) {
        const icon = change.type === 'added' ? '📥' :
                     change.type === 'deleted' ? '🗑️' :
                     change.type === 'modified' ? '✏️' : '❓';

        logger.log(`  ${icon} ${change.type.toUpperCase()}`);
        logger.log(`     Folder: ${change.folder}`);
        logger.log(`     MessageID: ${change.messageId}`);
        logger.log(`     Time: ${change.timestamp.toISOString()}`);
      }

      logger.log('');
      logger.log('Waiting for more changes... (Ctrl+C to stop)');
    };

    // Start IDLE subscription
    logger.log('');
    logger.log('Starting IDLE subscription on INBOX...');
    const subscription = await driver.subscribeToChanges(handleChanges, 'INBOX');

    logger.log('✓ IDLE subscription active');
    logger.log('');
    logger.log('📡 Listening for real-time notifications...');
    logger.log('   Send yourself an email to test!');
    logger.log('');

    // Handle graceful shutdown
    let shuttingDown = false;

    const shutdown = async () => {
      if (shuttingDown) return;
      shuttingDown = true;

      logger.log('');
      logger.log('-'.repeat(70));
      logger.log('Shutting down...');

      // Check if subscription is still active
      logger.log(`Subscription active: ${subscription.isActive()}`);

      // Unsubscribe
      await subscription.unsubscribe();
      logger.log('✓ IDLE subscription stopped');

      // Disconnect
      await driver.disconnect();
      logger.log('✓ Disconnected from IMAP server');

      // Summary
      logger.log('');
      logger.log('='.repeat(70));
      logger.log('TEST SUMMARY');
      logger.log('='.repeat(70));
      logger.log(`Total notifications received: ${notificationCount}`);
      logger.log(`Test duration: ${Math.floor((Date.now() - startTime) / 1000)} seconds`);
      logger.log('='.repeat(70));

      await app.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Keep the process running
    // Check subscription health periodically
    const healthCheck = setInterval(() => {
      if (!subscription.isActive()) {
        logger.warn('⚠️  IDLE subscription is no longer active!');
        clearInterval(healthCheck);
        shutdown();
      }
    }, 30000); // Check every 30 seconds

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error: ${errorMessage}`);
    await app.close();
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Failed:', error);
  process.exit(1);
});
