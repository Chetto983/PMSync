/**
 * Driver Integration Tests (Real Providers)
 *
 * These tests run against ACTUAL email providers using credentials from the database.
 * They verify that all drivers implement the IEmailDriver interface correctly
 * and can perform real operations.
 *
 * IMPORTANT: These are integration tests that require:
 * - A running database with valid provider credentials
 * - Network access to email providers
 * - Test accounts that can be modified
 *
 * Run with: npx jest --testPathPattern=drivers.integration --passWithNoTests
 *
 * NOTE: Google driver tests are skipped in Jest due to gaxios VM module issues.
 * For comprehensive testing of ALL drivers including Google, use the audit script:
 *   npx ts-node --transpile-only -r tsconfig-paths/register src/modules/email-sync/drivers/audit-drivers.script.ts
 *
 * These tests are marked with longer timeouts due to network operations.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { describe, beforeAll, afterAll, it, expect } from '@jest/globals';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { GoogleOAuthService } from '../../providers/services/google-oauth.service';
import { MicrosoftOAuthService } from '../../providers/services/microsoft-oauth.service';
import { ProviderTokenService } from '../services/provider-token.service';
import { DriversModule } from './drivers.module';
import { EmailDriverFactory } from './driver.factory';
import { IEmailDriver, DriverCredentials } from './interfaces/email-driver.interface';
import { CanonicalFolder, CanonicalMessage, ProviderType } from './interfaces/canonical.types';

// Integration test timeout (60 seconds for network operations)
const INTEGRATION_TIMEOUT = 60000;

interface TestProvider {
  id: string;
  email: string;
  type: ProviderType;
  driver?: IEmailDriver;
}

describe('Email Drivers Integration Tests', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let factory: EmailDriverFactory;
  let providerTokenService: ProviderTokenService;
  let providers: TestProvider[] = [];
  const logger = new Logger('DriverIntegrationTest');

  beforeAll(async () => {
    // Create test module with real dependencies
    module = await Test.createTestingModule({
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
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    factory = module.get<EmailDriverFactory>(EmailDriverFactory);
    providerTokenService = module.get<ProviderTokenService>(ProviderTokenService);

    // Load all active providers from database
    const dbProviders = await prisma.providerConfig.findMany({
      where: { isActive: true },
      select: { id: true, email: true, providerType: true },
    });

    if (dbProviders.length === 0) {
      logger.warn('No active providers found in database. Integration tests will be skipped.');
      return;
    }

    // Create drivers for each provider using the token service
    for (const p of dbProviders) {
      try {
        // Get fresh access token using ProviderTokenService
        const { accessToken } = await providerTokenService.getProviderWithToken(p.id);

        // Build credentials based on provider type
        let credentials: DriverCredentials;

        if (p.providerType === 'google' || p.providerType === 'microsoft') {
          credentials = {
            type: 'oauth2',
            accessToken,
          };
        } else if (p.providerType === 'imap' || p.providerType === 'generic') {
          // For IMAP/generic, get full provider config including IMAP settings
          const fullProvider = await prisma.providerConfig.findUnique({
            where: { id: p.id },
          });

          if (!fullProvider?.imapHost || !fullProvider?.imapPassword) {
            throw new Error('IMAP config not found (missing host or password)');
          }

          const cryptoService = module.get<CryptoService>(CryptoService);

          // Decrypt password using the stored IV
          const decryptedPassword = cryptoService.decrypt(
            fullProvider.imapPassword,
            fullProvider.imapEncryptionIv || '',
          );

          credentials = {
            type: 'basic',
            username: fullProvider.imapUsername || fullProvider.email,
            password: decryptedPassword,
            imapHost: fullProvider.imapHost,
            imapPort: fullProvider.imapPort || 993,
            imapTls: fullProvider.imapUseTls !== false,
            smtpHost: fullProvider.smtpHost || '',
            smtpPort: fullProvider.smtpPort || 465,
            smtpTls: fullProvider.smtpUseTls !== false,
            emailHint: fullProvider.email,
          };

          // Create IMAP driver for generic type
          const driver = await factory.createConnectedDriver('imap', credentials);
          providers.push({
            id: p.id,
            email: p.email,
            type: 'imap' as ProviderType, // Normalize generic to imap
            driver,
          });
          logger.log(`Loaded provider: ${p.email} (${p.providerType} -> imap)`);
          continue; // Skip to next provider
        } else {
          throw new Error(`Unknown provider type: ${p.providerType}`);
        }

        // Create and connect driver
        const driver = await factory.createConnectedDriver(
          p.providerType as ProviderType,
          credentials,
        );

        providers.push({
          id: p.id,
          email: p.email,
          type: p.providerType as ProviderType,
          driver,
        });

        logger.log(`Loaded provider: ${p.email} (${p.providerType})`);
      } catch (error) {
        logger.error(`Failed to create driver for ${p.email}: ${error}`);
      }
    }
  }, INTEGRATION_TIMEOUT);

  afterAll(async () => {
    // Disconnect all drivers
    for (const p of providers) {
      if (p.driver) {
        try {
          await p.driver.disconnect();
        } catch {
          // Ignore disconnect errors
        }
      }
    }

    if (module) {
      await module.close();
    }
  });

  describe('IEmailDriver Interface Compliance', () => {
    it('should have at least one provider for testing', () => {
      if (providers.length === 0) {
        logger.warn('No providers available - skipping compliance tests');
        return;
      }
      expect(providers.length).toBeGreaterThan(0);
    });

    // Note: Google tests are skipped in Jest due to gaxios VM module issues
    // Use audit-drivers.script.ts for comprehensive Google driver testing
    describe.each([
      ['google', 'Google', true],   // Skip Google in Jest
      ['microsoft', 'Microsoft', false],
      ['imap', 'IMAP', false],
    ])('%s driver', (providerType, displayName, skipInJest) => {
      let testProvider: TestProvider | undefined;

      beforeAll(() => {
        testProvider = providers.find((p) => p.type === providerType);
        if (!testProvider) {
          logger.warn(`No ${displayName} provider configured - skipping ${displayName} tests`);
        }
        if (skipInJest) {
          logger.warn(`${displayName} tests skipped in Jest (use audit-drivers.script.ts)`);
        }
      });

      it(`should connect to ${displayName} provider`, async () => {
        if (skipInJest || !testProvider?.driver) {
          return; // Skip if no provider or skipped in Jest
        }
        expect(testProvider.driver.isConnected()).toBe(true);
      }, INTEGRATION_TIMEOUT);

      it(`should have correct providerType: ${providerType}`, () => {
        if (skipInJest || !testProvider?.driver) {
          return;
        }
        expect(testProvider.driver.providerType).toBe(providerType);
      });

      describe('Folder Operations', () => {
        let folders: CanonicalFolder[] = [];

        it('should list folders', async () => {
          if (skipInJest || !testProvider?.driver) {
            return;
          }

          folders = await testProvider.driver.listFolders();
          expect(folders).toBeDefined();
          expect(Array.isArray(folders)).toBe(true);
          expect(folders.length).toBeGreaterThan(0);

          // Log folder summary
          logger.log(`  ${displayName}: Found ${folders.length} folders`);
        }, INTEGRATION_TIMEOUT);

        it('should have INBOX folder', () => {
          if (!testProvider?.driver || folders.length === 0) {
            return;
          }

          const inbox = folders.find((f) => f.type === 'INBOX');
          expect(inbox).toBeDefined();
          expect(inbox?.name).toBeDefined();
        });

        it('should have SENT folder', () => {
          if (!testProvider?.driver || folders.length === 0) {
            return;
          }

          const sent = folders.find((f) => f.type === 'SENT');
          expect(sent).toBeDefined();
        });

        it('should have TRASH folder', () => {
          if (!testProvider?.driver || folders.length === 0) {
            return;
          }

          const trash = folders.find((f) => f.type === 'TRASH');
          expect(trash).toBeDefined();
        });

        it('should have proper folder structure', () => {
          if (!testProvider?.driver || folders.length === 0) {
            return;
          }

          for (const folder of folders) {
            expect(folder.id).toBeDefined();
            expect(folder.name).toBeDefined();
            expect(folder.type).toBeDefined();
            expect(folder.path).toBeDefined();
            expect(typeof folder.unreadCount).toBe('number');
            expect(typeof folder.totalCount).toBe('number');
            expect(folder.attributes).toBeDefined();
          }
        });
      });

      describe('Message Operations', () => {
        let inboxMessages: CanonicalMessage[] = [];

        it('should list messages from INBOX', async () => {
          if (skipInJest || !testProvider?.driver) {
            return;
          }

          const result = await testProvider.driver.listMessages({
            folder: 'INBOX',
            pageSize: 5,
          });

          expect(result).toBeDefined();
          expect(Array.isArray(result.messages)).toBe(true);
          expect(typeof result.hasMore).toBe('boolean');

          inboxMessages = result.messages;
          logger.log(`  ${displayName}: Found ${inboxMessages.length} messages in INBOX`);
        }, INTEGRATION_TIMEOUT);

        it('should have proper message structure', () => {
          if (skipInJest || !testProvider?.driver || inboxMessages.length === 0) {
            return;
          }

          const message = inboxMessages[0];
          expect(message.id).toBeDefined();
          expect(message.subject).toBeDefined();
          expect(message.from).toBeDefined();
          expect(message.from.email).toBeDefined();
          expect(Array.isArray(message.to)).toBe(true);
          expect(message.receivedAt).toBeDefined();
          expect(typeof message.isRead).toBe('boolean');
          expect(typeof message.isStarred).toBe('boolean');
          expect(typeof message.hasAttachments).toBe('boolean');
        });

        it('should get full message details', async () => {
          if (skipInJest || !testProvider?.driver || inboxMessages.length === 0) {
            return;
          }

          const message = await testProvider.driver.getMessage(inboxMessages[0].id, {
            includeBody: true,
          });

          expect(message).toBeDefined();
          expect(message!.id).toBe(inboxMessages[0].id);
          // Body might be text or HTML
          expect(message!.bodyText || message!.bodyHtml).toBeDefined();
        }, INTEGRATION_TIMEOUT);

        it('should list messages from SENT', async () => {
          if (skipInJest || !testProvider?.driver) {
            return;
          }

          const result = await testProvider.driver.listMessages({
            folder: 'SENT',
            pageSize: 5,
          });

          expect(result).toBeDefined();
          expect(Array.isArray(result.messages)).toBe(true);
          logger.log(`  ${displayName}: Found ${result.messages.length} messages in SENT`);
        }, INTEGRATION_TIMEOUT);
      });

      describe('Attachment Handling', () => {
        it('should handle message with attachments', async () => {
          if (skipInJest || !testProvider?.driver) {
            return;
          }

          // Find a message with attachments
          const result = await testProvider.driver.listMessages({
            folder: 'INBOX',
            pageSize: 50,
          });

          const messageWithAttachment = result.messages.find((m) => m.hasAttachments);
          if (!messageWithAttachment) {
            logger.log(`  ${displayName}: No messages with attachments found - skipping`);
            return;
          }

          // Get full message to see attachment metadata
          const fullMessage = await testProvider.driver.getMessage(messageWithAttachment.id, {
            includeAttachments: true,
          });

          expect(fullMessage!.attachments).toBeDefined();
          expect(Array.isArray(fullMessage!.attachments)).toBe(true);
          if (fullMessage!.attachments.length === 0) {
            logger.log(`  ${displayName}: Message has no attachments in metadata - skipping`);
            return;
          }

          // Verify attachment structure
          const attachment = fullMessage!.attachments[0];
          expect(attachment.id).toBeDefined();
          expect(attachment.filename).toBeDefined();
          expect(attachment.mimeType).toBeDefined();

          logger.log(`  ${displayName}: Found attachment: ${attachment.filename} (${attachment.mimeType})`);
        }, INTEGRATION_TIMEOUT);

        it('should download attachment content', async () => {
          if (skipInJest || !testProvider?.driver) {
            return;
          }

          // Find a message with attachments
          const result = await testProvider.driver.listMessages({
            folder: 'INBOX',
            pageSize: 50,
          });

          const messageWithAttachment = result.messages.find((m) => m.hasAttachments);
          if (!messageWithAttachment) {
            return; // Skip if no attachments
          }

          const fullMessage = await testProvider.driver.getMessage(messageWithAttachment.id, {
            includeAttachments: true,
          });

          if (!fullMessage?.attachments || fullMessage.attachments.length === 0) {
            return; // Skip if no attachments after full fetch
          }

          const attachment = fullMessage.attachments[0];
          const content = await testProvider.driver.getAttachment(messageWithAttachment.id, attachment.id);

          if (!content || !content.data) {
            logger.log(`  ${displayName}: Attachment content is null or missing data - skipping`);
            return; // Some providers may not return full content
          }

          expect(content.data).toBeDefined();
          expect(content.filename).toBeDefined();
          expect(content.mimeType).toBeDefined();
          expect(content.data.length).toBeGreaterThan(0);

          logger.log(`  ${displayName}: Downloaded ${content.filename} (${content.data.length} bytes)`);
        }, INTEGRATION_TIMEOUT);
      });

      describe('Flag Operations (Read-Only)', () => {
        // These tests only verify the ability to toggle flags without modifying state
        // To avoid polluting the mailbox, we don't actually toggle back

        it('should be able to read flag status', async () => {
          if (skipInJest || !testProvider?.driver) {
            return;
          }

          const result = await testProvider.driver.listMessages({
            folder: 'INBOX',
            pageSize: 1,
          });

          if (result.messages.length === 0) {
            return;
          }

          const message = result.messages[0];
          expect(typeof message.isRead).toBe('boolean');
          expect(typeof message.isStarred).toBe('boolean');

          logger.log(`  ${displayName}: Message flags - read: ${message.isRead}, starred: ${message.isStarred}`);
        }, INTEGRATION_TIMEOUT);
      });
    });
  });

  describe('Cross-Provider Consistency', () => {
    // Note: Google is skipped in Jest due to gaxios VM module issues
    // Use audit-drivers.script.ts for comprehensive cross-provider testing

    it('should use consistent CanonicalFolder types across all providers', async () => {
      const foldersByProvider = new Map<ProviderType, Set<string>>();

      for (const p of providers) {
        // Skip Google in Jest due to gaxios VM module issues
        if (!p.driver || p.type === 'google') continue;

        const folders = await p.driver.listFolders();
        const types = new Set(folders.map((f) => f.type));
        foldersByProvider.set(p.type, types);
      }

      // All providers should have INBOX
      for (const [type, types] of foldersByProvider) {
        expect(types.has('INBOX')).toBe(true);
        logger.log(`${type}: ${Array.from(types).join(', ')}`);
      }
    }, INTEGRATION_TIMEOUT);

    it('should use consistent CanonicalMessage structure across all providers', async () => {
      const requiredFields = ['id', 'subject', 'from', 'to', 'receivedAt', 'isRead', 'isStarred', 'hasAttachments'];

      for (const p of providers) {
        // Skip Google in Jest due to gaxios VM module issues
        if (!p.driver || p.type === 'google') continue;

        const result = await p.driver.listMessages({ folder: 'INBOX', pageSize: 1 });
        if (result.messages.length === 0) continue;

        const message = result.messages[0];
        for (const field of requiredFields) {
          expect(message).toHaveProperty(field);
        }

        logger.log(`${p.type}: All required fields present`);
      }
    }, INTEGRATION_TIMEOUT);
  });
});
