/**
 * Test Email Send Service - Driver Migration Validation
 *
 * This script tests the migrated EmailSendService which now uses EmailDriverFactory
 * instead of the legacy ProviderFactory pattern.
 *
 * Tests:
 * 1. Gmail send via OAuth2
 * 2. Microsoft send via OAuth2
 * 3. IMAP send via SMTP
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { EmailSendService } from './services/email-send.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Logger } from '@nestjs/common';

const logger = new Logger('TestEmailSend');

interface TestResult {
  provider: string;
  success: boolean;
  messageId?: string;
  error?: string;
  duration: number;
}

async function main() {
  logger.log('🚀 Starting Email Send Service Migration Test...\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const emailSendService = app.get(EmailSendService);
  const prisma = app.get(PrismaService);

  const results: TestResult[] = [];

  // Get active providers from database
  const providers = await prisma.providerConfig.findMany({
    where: {
      isActive: true,
      supportsEmail: true,
    },
    select: {
      id: true,
      email: true,
      providerType: true,
      tenantId: true,
    },
    take: 10,
  });

  if (providers.length === 0) {
    logger.warn('⚠️  No active email providers found in database');
    await app.close();
    return;
  }

  logger.log(`Found ${providers.length} active provider(s):\n`);
  providers.forEach((p, i) => {
    logger.log(`  ${i + 1}. ${p.providerType.toUpperCase()} - ${p.email}`);
  });
  logger.log('');

  // Test each provider
  for (const provider of providers) {
    const startTime = Date.now();

    try {
      logger.log(`\n📧 Testing ${provider.providerType.toUpperCase()} (${provider.email})...`);

      const result = await emailSendService.sendEmail({
        tenantId: provider.tenantId,
        providerId: provider.id,
        to: [provider.email], // Send to self
        subject: `Test Email - ${provider.providerType.toUpperCase()} Driver Migration`,
        bodyHtml: `
          <html>
            <body>
              <h2>Email Send Service Migration Test</h2>
              <p>This email was sent using the new <strong>EmailDriverFactory</strong> pattern.</p>

              <h3>Migration Details:</h3>
              <ul>
                <li><strong>Provider:</strong> ${provider.providerType.toUpperCase()}</li>
                <li><strong>From:</strong> ${provider.email}</li>
                <li><strong>Driver Pattern:</strong> ✅ New driver-only architecture</li>
                <li><strong>Legacy Factory:</strong> ❌ Removed</li>
              </ul>

              <h3>Technical Stack:</h3>
              <ul>
                <li>EmailDriverFactory</li>
                <li>driver.sendMessage()</li>
                <li>ComposeMessage canonical type</li>
                <li>DriverCredentials interface</li>
              </ul>

              <p><em>Timestamp: ${new Date().toISOString()}</em></p>

              <hr>
              <p style="color: #666; font-size: 12px;">
                🤖 Generated with Claude Code - Phase 7.1 Migration Testing
              </p>
            </body>
          </html>
        `,
        bodyText: `
Email Send Service Migration Test

This email was sent using the new EmailDriverFactory pattern.

Migration Details:
- Provider: ${provider.providerType.toUpperCase()}
- From: ${provider.email}
- Driver Pattern: ✅ New driver-only architecture
- Legacy Factory: ❌ Removed

Technical Stack:
- EmailDriverFactory
- driver.sendMessage()
- ComposeMessage canonical type
- DriverCredentials interface

Timestamp: ${new Date().toISOString()}

🤖 Generated with Claude Code - Phase 7.1 Migration Testing
        `,
      });

      const duration = Date.now() - startTime;

      results.push({
        provider: `${provider.providerType} (${provider.email})`,
        success: result.success,
        messageId: result.messageId,
        duration,
      });

      logger.log(`✅ SUCCESS - Message ID: ${result.messageId}`);
      logger.log(`⏱️  Duration: ${duration}ms\n`);

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      results.push({
        provider: `${provider.providerType} (${provider.email})`,
        success: false,
        error: errorMessage,
        duration,
      });

      logger.error(`❌ FAILED - ${errorMessage}`);
      logger.error(`⏱️  Duration: ${duration}ms\n`);
    }
  }

  // Print summary
  logger.log('\n' + '='.repeat(70));
  logger.log('📊 TEST SUMMARY');
  logger.log('='.repeat(70) + '\n');

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    logger.log(`${index + 1}. ${status} ${result.provider}`);

    if (result.success) {
      logger.log(`   Message ID: ${result.messageId}`);
    } else {
      logger.log(`   Error: ${result.error}`);
    }

    logger.log(`   Duration: ${result.duration}ms\n`);
  });

  logger.log(`Total: ${results.length} | Success: ${successCount} | Failed: ${failCount}`);
  logger.log('');

  if (successCount === results.length) {
    logger.log('🎉 ALL TESTS PASSED - Email Send Service migration successful!\n');
  } else if (successCount > 0) {
    logger.log('⚠️  PARTIAL SUCCESS - Some providers failed\n');
  } else {
    logger.log('💥 ALL TESTS FAILED - Migration issues detected\n');
  }

  logger.log('='.repeat(70) + '\n');

  await app.close();
  process.exit(successCount === results.length ? 0 : 1);
}

main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
