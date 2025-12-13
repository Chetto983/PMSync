/**
 * Debug Attachments Script
 *
 * Checks all providers to find messages with attachments
 *
 * Usage: npx ts-node --transpile-only scripts/debug-attachments.script.ts
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
import { ProviderType } from '../src/modules/email-sync/drivers/interfaces/canonical.types';
import { DriverCredentials } from '../src/modules/email-sync/drivers/interfaces/email-driver.interface';

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
class DebugModule {}

async function main() {
  const logger = new Logger('DebugAttachments');

  logger.log('='.repeat(60));
  logger.log('DEBUG: CHECKING ATTACHMENTS IN ALL PROVIDERS');
  logger.log('='.repeat(60));

  const app = await NestFactory.createApplicationContext(DebugModule, {
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

  for (const provider of providers) {
    try {
      logger.log(`\n[${ provider.providerType}] ${provider.email}`);
      logger.log('-'.repeat(50));

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

      // Check multiple folders
      for (const folder of ['INBOX', 'SENT']) {
        logger.log(`\n  Folder: ${folder}`);
        const result = await driver.listMessages({ folder, pageSize: 20 });
        logger.log(`    Total messages: ${result.messages.length}`);

        let attachmentCount = 0;
        for (const msg of result.messages) {
          if (msg.hasAttachments) {
            attachmentCount++;
            logger.log(`    [ATTACHMENT] ${msg.subject?.substring(0, 50)}...`);
            if (msg.attachments?.length) {
              for (const att of msg.attachments) {
                logger.log(`      - ${att.filename} (${att.mimeType}, ${att.size} bytes)`);
              }
            } else {
              logger.log(`      - hasAttachments=true but attachments array is empty/undefined`);
              // Try to get full message
              const fullMsg = await driver.getMessage(msg.id, { includeBody: true });
              if (fullMsg?.attachments?.length) {
                logger.log(`      - Full message has ${fullMsg.attachments.length} attachments:`);
                for (const att of fullMsg.attachments) {
                  logger.log(`        - ${att.filename} (${att.mimeType}, ${att.size} bytes, id: ${att.id})`);
                }
              }
            }
          }
        }

        if (attachmentCount === 0) {
          logger.log(`    No messages with attachments found in first 20 messages`);
        } else {
          logger.log(`    Found ${attachmentCount} messages with attachments`);
        }
      }

      await driver.disconnect();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`  [ERROR] ${errorMessage}`);
    }
  }

  logger.log('\n' + '='.repeat(60));
  logger.log('DEBUG COMPLETE');
  logger.log('='.repeat(60));

  await app.close();
}

main().catch((error) => {
  console.error('Failed:', error);
  process.exit(1);
});
