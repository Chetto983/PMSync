/**
 * Send Test Emails with Attachments
 *
 * Sends test emails with attachments to all providers for testing.
 *
 * Usage: npx ts-node --transpile-only -r tsconfig-paths/register src/modules/email-sync/drivers/send-test-emails.script.ts
 */

import * as fs from 'fs';
import * as path from 'path';
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
import { ProviderType, ComposeMessage, AttachmentData } from '../src/modules/email-sync/drivers/interfaces/canonical.types';
import { DriverCredentials } from '../src/modules/email-sync/drivers/interfaces/email-driver.interface';

// Minimal module
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
class SendTestModule {}

// Create a simple test attachment (text file)
function createTestAttachment(): AttachmentData {
  const content = `
Test Attachment File
=====================
Generated: ${new Date().toISOString()}

This is a test attachment for the Email Driver Audit.
It contains sample text to verify attachment upload/download functionality.

Lorem ipsum dolor sit amet, consectetur adipiscing elit.
Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
`;
  const contentBuffer = Buffer.from(content, 'utf-8');
  return {
    id: 'test-txt-' + Date.now(),
    filename: 'test-attachment.txt',
    mimeType: 'text/plain',
    size: contentBuffer.length,
    isInline: false,
    content: contentBuffer.toString('base64'),
  };
}

// Load PDF attachment from file
function loadPdfAttachment(logger: Logger): AttachmentData {
  const pdfPath = path.resolve('D:/MailAgent/docs/Promt best pratice.pdf');

  if (fs.existsSync(pdfPath)) {
    const contentBuffer = fs.readFileSync(pdfPath);
    logger.log(`  [INFO] Loaded PDF attachment: ${contentBuffer.length} bytes`);
    return {
      id: 'test-pdf-' + Date.now(),
      filename: 'Promt-best-pratice.pdf',
      mimeType: 'application/pdf',
      size: contentBuffer.length,
      isInline: false,
      content: contentBuffer.toString('base64'),
    };
  }

  // Fallback to minimal PNG if PDF doesn't exist
  logger.warn(`  [WARN] PDF not found at ${pdfPath}, using fallback image`);
  const pngData = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
    0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xfe,
    0xd4, 0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
    0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  return {
    id: 'test-png-' + Date.now(),
    filename: 'test-image.png',
    mimeType: 'image/png',
    size: pngData.length,
    isInline: false,
    content: pngData.toString('base64'),
  };
}

async function main() {
  const logger = new Logger('SendTestEmails');

  logger.log('='.repeat(60));
  logger.log('SEND TEST EMAILS WITH ATTACHMENTS');
  logger.log('='.repeat(60));

  const app = await NestFactory.createApplicationContext(SendTestModule, {
    logger: ['error', 'warn', 'log'],
  });

  const prisma = app.get(PrismaService);
  const tokenService = app.get(ProviderTokenService);
  const factory = app.get(EmailDriverFactory);
  const crypto = app.get(CryptoService);

  // Get active providers
  const providers = await prisma.providerConfig.findMany({
    where: {
      isActive: true,
      providerType: { in: ['google', 'microsoft', 'imap', 'generic'] },
    },
    take: 10,
    orderBy: { lastSyncedAt: 'desc' },
  });

  logger.log(`\nFound ${providers.length} providers\n`);

  const textAttachment = createTestAttachment();

  for (const provider of providers) {
    try {
      logger.log(`\n[${provider.providerType}] ${provider.email}`);

      // Load PDF for each provider (fresh timestamp)
      const pdfAttachment = loadPdfAttachment(logger);

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

      // Send email with attachments to self
      const message: ComposeMessage = {
        to: [{ email: provider.email, name: 'Audit Test' }],
        subject: `[ATTACHMENT-TEST] ${new Date().toISOString()}`,
        bodyText: 'This email contains test attachments for the driver audit.',
        bodyHtml: `
          <h2>Attachment Test Email</h2>
          <p>This email was sent by the driver audit script.</p>
          <p>It contains the following attachments:</p>
          <ul>
            <li>test-attachment.txt - A text file</li>
            <li>Promt-best-pratice.pdf - A PDF document</li>
          </ul>
          <p><em>Generated: ${new Date().toISOString()}</em></p>
        `,
        attachments: [textAttachment, pdfAttachment],
      };

      const messageId = await driver.sendMessage(message);
      logger.log(`  [SENT] Message ID: ${messageId}`);

      await driver.disconnect();

      // Small delay between providers
      await new Promise((resolve) => setTimeout(resolve, 2000));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`  [ERROR] ${errorMessage}`);
    }
  }

  logger.log('\n' + '='.repeat(60));
  logger.log('DONE - Test emails sent to all providers');
  logger.log('='.repeat(60));

  await app.close();
}

main().catch((error) => {
  console.error('Failed:', error);
  process.exit(1);
});
