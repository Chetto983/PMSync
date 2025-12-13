import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { GoogleOAuthService } from './google-oauth.service';
import { MicrosoftOAuthService } from './microsoft-oauth.service';
import { ImapService } from './imap.service';
import { CalDavService } from './caldav.service';
import { SyncSchedulerService } from '../../email-sync/services/sync-scheduler.service';
import { WebhookLifecycleService } from '../../email-sync/services/webhook-lifecycle.service';
import { QueueService } from '../../email-sync/services/queue.service';
import { EmailEmbeddingQueueService } from '../../ai/services/email-embedding.queue';
import { KnowledgeBaseService } from '../../ai/services/knowledge-base.service';
import { SyncJobData } from '../../email-sync/interfaces/sync-job.interface';
import { GoogleCalendarSyncService } from '../../calendar/services/google-calendar-sync.service';
import { MicrosoftCalendarSyncService } from '../../calendar/services/microsoft-calendar-sync.service';
import { GoogleCalendarWebhookService } from '../../calendar/services/google-calendar-webhook.service';
import { MicrosoftCalendarWebhookService } from '../../calendar/services/microsoft-calendar-webhook.service';
import { FolderSyncService } from '../../email-sync/services/folder-sync.service';
import { ContactsService } from '../../contacts/services/contacts.service';
import { StorageService } from '../../email/services/storage.service';
import type { ProviderConfig } from '@prisma/client';
import {
  ConnectGoogleProviderDto,
  ConnectMicrosoftProviderDto,
  ConnectGenericProviderDto,
} from '../dto';

export interface ProviderAlias {
  email: string;
  name?: string;
  providerId: string;
}

@Injectable()
export class ProviderConfigService {
  private readonly logger = new Logger(ProviderConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly googleOAuth: GoogleOAuthService,
    private readonly microsoftOAuth: MicrosoftOAuthService,
    private readonly imap: ImapService,
    private readonly caldav: CalDavService,
    @Inject(forwardRef(() => SyncSchedulerService))
    private readonly syncScheduler: SyncSchedulerService,
    @Inject(forwardRef(() => WebhookLifecycleService))
    private readonly webhookLifecycle: WebhookLifecycleService,
    @Inject(forwardRef(() => QueueService))
    private readonly queueService: QueueService,
    private readonly emailEmbeddingQueue: EmailEmbeddingQueueService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    @Inject(forwardRef(() => GoogleCalendarSyncService))
    private readonly googleCalendarSync: GoogleCalendarSyncService,
    @Inject(forwardRef(() => MicrosoftCalendarSyncService))
    private readonly microsoftCalendarSync: MicrosoftCalendarSyncService,
    @Inject(forwardRef(() => GoogleCalendarWebhookService))
    private readonly googleCalendarWebhook: GoogleCalendarWebhookService,
    @Inject(forwardRef(() => MicrosoftCalendarWebhookService))
    private readonly microsoftCalendarWebhook: MicrosoftCalendarWebhookService,
    private readonly folderSync: FolderSyncService,
    private readonly contactsService: ContactsService,
    @Inject(forwardRef(() => StorageService))
    private readonly storageService: StorageService,
  ) {}

  /**
   * Return aliases for a provider. Stub: currently returns the primary email as single alias.
   */
  async getAliases(providerId: string, tenantId: string): Promise<ProviderAlias[]> {
    const provider = await this.prisma.providerConfig.findFirst({
      where: { id: providerId, tenantId },
      select: { id: true, email: true, metadata: true, providerType: true },
    });
    if (!provider) {
      throw new NotFoundException('Provider not found');
    }

    let aliases: ProviderAlias[] = [];
    const metadataAliases = Array.isArray((provider.metadata as any)?.aliases)
      ? (provider.metadata as any).aliases
      : [];

    if (metadataAliases.length > 0) {
      aliases = metadataAliases.map((alias: any) => ({
        providerId: provider.id,
        email: alias.email || provider.email,
        name: alias.name,
      }));
    } else if (provider.providerType === 'google') {
      aliases = (await this.googleOAuth.getSendAsAliases(tenantId, providerId)).map((a) => ({
        providerId: provider.id,
        email: a.email,
        name: a.name,
      }));
    } else if (provider.providerType === 'microsoft') {
      aliases = (await this.microsoftOAuth.getAliases(tenantId, providerId)).map((a) => ({
        providerId: provider.id,
        email: a.email,
        name: a.name,
      }));
    } else {
      aliases = [{ providerId: provider.id, email: provider.email }];
    }

    // Persist aliases in metadata for quicker access
    await this.prisma.providerConfig.update({
      where: { id: providerId },
      data: {
        metadata: {
          ...(provider.metadata as Record<string, any>),
          aliases: aliases.map((a) => ({ email: a.email, name: a.name })),
        },
      },
    });

    // Fallback to primary email if list is empty
    if (aliases.length === 0) {
      aliases = [{ providerId: provider.id, email: provider.email }];
    }

    return aliases;
  }

  /**
   * Connect Google provider (Gmail + Calendar)
   * @param codeVerifier - PKCE code_verifier for token exchange (optional for backward compatibility)
   */
  async connectGoogleProvider(
    tenantId: string,
    userId: string,
    dto: ConnectGoogleProviderDto,
    codeVerifier?: string,
  ) {
    try {
      // Exchange authorization code for tokens (with PKCE code_verifier if provided)
      const tokenData = await this.googleOAuth.exchangeCodeForTokens(dto.authorizationCode, codeVerifier);

      // Use email from OAuth2 if not provided in DTO
      const email = dto.email || tokenData.email;

      // If email was provided, verify it matches
      if (dto.email && tokenData.email !== dto.email) {
        throw new BadRequestException('Email mismatch. Please use the correct Google account.');
      }

      // Encrypt tokens
      const encryptedAccessToken = this.crypto.encrypt(tokenData.accessToken);
      const encryptedRefreshToken = this.crypto.encrypt(tokenData.refreshToken);

      // Save to database
      const providerConfig = await this.prisma.providerConfig.upsert({
        where: {
          tenantId_email_providerType: {
            tenantId,
            email,
            providerType: 'google',
          },
        },
        create: {
          tenantId,
          userId,
          providerType: 'google',
          email,
          supportsEmail: true,
          supportsCalendar: dto.supportsCalendar ?? true,
          supportsContacts: dto.supportsContacts ?? true,
          accessToken: encryptedAccessToken.encrypted,
          refreshToken: encryptedRefreshToken.encrypted,
          tokenEncryptionIv: encryptedAccessToken.iv,
          refreshTokenEncryptionIv: encryptedRefreshToken.iv,
          tokenExpiresAt: tokenData.expiresAt,
          isDefault: dto.isDefault ?? false,
        },
        update: {
          accessToken: encryptedAccessToken.encrypted,
          refreshToken: encryptedRefreshToken.encrypted,
          tokenEncryptionIv: encryptedAccessToken.iv,
          refreshTokenEncryptionIv: encryptedRefreshToken.iv,
          tokenExpiresAt: tokenData.expiresAt,
          supportsCalendar: dto.supportsCalendar ?? true,
          supportsContacts: dto.supportsContacts ?? true,
          isDefault: dto.isDefault ?? false,
          isActive: true,
          lastSyncedAt: new Date(),
        },
      });

      const sanitized = this.sanitizeProviderConfig(providerConfig);

      await this.triggerInitialSync(providerConfig);

      this.logger.log(`Google provider connected for ${email}`);

      return sanitized;
    } catch (error) {
      this.logger.error('Failed to connect Google provider:', error);
      throw error;
    }
  }

  /**
   * Connect Microsoft provider (Outlook + Graph)
   * @param codeVerifier - PKCE code_verifier for token exchange (optional for backward compatibility)
   */
  async connectMicrosoftProvider(
    tenantId: string,
    userId: string,
    dto: ConnectMicrosoftProviderDto,
    codeVerifier?: string,
  ) {
    try {
      // Exchange authorization code for tokens (with PKCE code_verifier if provided)
      const tokenData = await this.microsoftOAuth.exchangeCodeForTokens(dto.authorizationCode, codeVerifier);

      // Use email from OAuth2 if not provided in DTO
      const email = dto.email || tokenData.email;

      // If email was provided, verify it matches
      if (dto.email && tokenData.email.toLowerCase() !== dto.email.toLowerCase()) {
        throw new BadRequestException('Email mismatch. Please use the correct Microsoft account.');
      }

      // Encrypt tokens
      const encryptedAccessToken = this.crypto.encrypt(tokenData.accessToken);
      const encryptedRefreshToken = this.crypto.encrypt(tokenData.refreshToken);

      // Save to database
      const providerConfig = await this.prisma.providerConfig.upsert({
        where: {
          tenantId_email_providerType: {
            tenantId,
            email,
            providerType: 'microsoft',
          },
        },
        create: {
          tenantId,
          userId,
          providerType: 'microsoft',
          email,
          supportsEmail: true,
          supportsCalendar: dto.supportsCalendar ?? true,
          supportsContacts: dto.supportsContacts ?? true,
          accessToken: encryptedAccessToken.encrypted,
          refreshToken: encryptedRefreshToken.encrypted,
          tokenEncryptionIv: encryptedAccessToken.iv,
          refreshTokenEncryptionIv: encryptedRefreshToken.iv,
          tokenExpiresAt: tokenData.expiresAt,
          isDefault: dto.isDefault ?? false,
        },
        update: {
          accessToken: encryptedAccessToken.encrypted,
          refreshToken: encryptedRefreshToken.encrypted,
          tokenEncryptionIv: encryptedAccessToken.iv,
          refreshTokenEncryptionIv: encryptedRefreshToken.iv,
          tokenExpiresAt: tokenData.expiresAt,
          supportsCalendar: dto.supportsCalendar ?? true,
          supportsContacts: dto.supportsContacts ?? true,
          isDefault: dto.isDefault ?? false,
          isActive: true,
          lastSyncedAt: new Date(),
        },
      });

      const sanitized = this.sanitizeProviderConfig(providerConfig);

      await this.triggerInitialSync(providerConfig);

      this.logger.log(`Microsoft provider connected for ${email}`);

      return sanitized;
    } catch (error) {
      this.logger.error('Failed to connect Microsoft provider:', error);
      throw error;
    }
  }

  /**
   * Connect IMAP provider (IMAP/SMTP + CalDAV/CardDAV)
   */
  async connectGenericProvider(
    tenantId: string,
    userId: string,
    dto: ConnectGenericProviderDto,
  ) {
    try {
      // Test IMAP connection first
      const imapConnected = await this.imap.testConnection({
        host: dto.imapHost,
        port: dto.imapPort ?? 993,
        username: dto.imapUsername,
        password: dto.imapPassword,
        useTls: dto.imapUseTls ?? true,
      });

      if (!imapConnected) {
        throw new BadRequestException('IMAP connection test failed. Please check your credentials.');
      }

      // Test SMTP if provided
      if (dto.smtpHost && dto.smtpUsername && dto.smtpPassword) {
        await this.imap.testSmtpConnection({
          host: dto.smtpHost,
          port: dto.smtpPort ?? 587,
          username: dto.smtpUsername,
          password: dto.smtpPassword,
          useTls: dto.smtpUseTls ?? true,
        });
      }

      // Test CalDAV if provided
      let caldavConnected = false;
      if (dto.caldavUrl && dto.caldavUsername && dto.caldavPassword) {
        caldavConnected = await this.caldav.testCalDavConnection({
          url: dto.caldavUrl,
          username: dto.caldavUsername,
          password: dto.caldavPassword,
        });
      }

      // Test CardDAV if provided
      let carddavConnected = false;
      if (dto.carddavUrl && dto.carddavUsername && dto.carddavPassword) {
        carddavConnected = await this.caldav.testCardDavConnection({
          url: dto.carddavUrl,
          username: dto.carddavUsername,
          password: dto.carddavPassword,
        });
      }

      // Encrypt all passwords
      const encryptedImapPassword = this.crypto.encrypt(dto.imapPassword);
      const encryptedSmtpPassword = dto.smtpPassword
        ? this.crypto.encrypt(dto.smtpPassword)
        : null;
      const encryptedCaldavPassword = dto.caldavPassword
        ? this.crypto.encrypt(dto.caldavPassword)
        : null;
      const encryptedCarddavPassword = dto.carddavPassword
        ? this.crypto.encrypt(dto.carddavPassword)
        : null;

      // Save to database
      const providerConfig = await this.prisma.providerConfig.upsert({
        where: {
          tenantId_email_providerType: {
            tenantId,
            email: dto.email,
            providerType: 'imap',
          },
        },
        create: {
          tenantId,
          userId,
          providerType: 'imap',
          email: dto.email,
          displayName: dto.displayName,
          supportsEmail: true,
          supportsCalendar: caldavConnected,
          supportsContacts: carddavConnected,

          // IMAP config
          imapHost: dto.imapHost,
          imapPort: dto.imapPort ?? 993,
          imapUsername: dto.imapUsername,
          imapPassword: encryptedImapPassword.encrypted,
          imapEncryptionIv: encryptedImapPassword.iv,
          imapUseTls: dto.imapUseTls ?? true,

          // SMTP config
          smtpHost: dto.smtpHost,
          smtpPort: dto.smtpPort ?? 587,
          smtpUsername: dto.smtpUsername,
          smtpPassword: encryptedSmtpPassword?.encrypted,
          smtpEncryptionIv: encryptedSmtpPassword?.iv,
          smtpUseTls: dto.smtpUseTls ?? true,

          // CalDAV config
          caldavUrl: dto.caldavUrl,
          caldavUsername: dto.caldavUsername,
          caldavPassword: encryptedCaldavPassword?.encrypted,
          caldavEncryptionIv: encryptedCaldavPassword?.iv,

          // CardDAV config
          carddavUrl: dto.carddavUrl,
          carddavUsername: dto.carddavUsername,
          carddavPassword: encryptedCarddavPassword?.encrypted,
          carddavEncryptionIv: encryptedCarddavPassword?.iv,

          isDefault: dto.isDefault ?? false,
        },
        update: {
          displayName: dto.displayName,
          supportsEmail: true,
          supportsCalendar: caldavConnected,
          supportsContacts: carddavConnected,

          // IMAP config
          imapHost: dto.imapHost,
          imapPort: dto.imapPort ?? 993,
          imapUsername: dto.imapUsername,
          imapPassword: encryptedImapPassword.encrypted,
          imapEncryptionIv: encryptedImapPassword.iv,
          imapUseTls: dto.imapUseTls ?? true,

          // SMTP config
          smtpHost: dto.smtpHost,
          smtpPort: dto.smtpPort ?? 587,
          smtpUsername: dto.smtpUsername,
          smtpPassword: encryptedSmtpPassword?.encrypted,
          smtpEncryptionIv: encryptedSmtpPassword?.iv,
          smtpUseTls: dto.smtpUseTls ?? true,

          // CalDAV config
          caldavUrl: dto.caldavUrl,
          caldavUsername: dto.caldavUsername,
          caldavPassword: encryptedCaldavPassword?.encrypted,
          caldavEncryptionIv: encryptedCaldavPassword?.iv,

          // CardDAV config
          carddavUrl: dto.carddavUrl,
          carddavUsername: dto.carddavUsername,
          carddavPassword: encryptedCarddavPassword?.encrypted,
          carddavEncryptionIv: encryptedCarddavPassword?.iv,

          isDefault: dto.isDefault ?? false,
          isActive: true,
          lastSyncedAt: new Date(),
        },
      });

      const sanitized = this.sanitizeProviderConfig(providerConfig);

      await this.triggerInitialSync(providerConfig);

      this.logger.log(`Generic provider connected for ${dto.email}`);

      return sanitized;
    } catch (error) {
      this.logger.error('Failed to connect generic provider:', error);
      throw error;
    }
  }

  /**
   * Get all provider configs for a tenant
   */
  async getProviderConfigs(tenantId: string) {
    const configs = await this.prisma.providerConfig.findMany({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    return configs.map((config) => this.sanitizeProviderConfig(config));
  }

  /**
   * Get a specific provider config
   */
  async getProviderConfig(tenantId: string, configId: string) {
    const config = await this.prisma.providerConfig.findFirst({
      where: { id: configId, tenantId },
    });

    if (!config) {
      throw new NotFoundException('Provider config not found');
    }

    return this.sanitizeProviderConfig(config);
  }

  /**
   * Delete a provider config
   */
  async deleteProviderConfig(tenantId: string, configId: string) {
    const provider = await this.prisma.providerConfig.findFirst({
      where: { id: configId, tenantId },
    });

    if (!provider) {
      throw new NotFoundException('Provider config not found');
    }

    await this.queueService.removeJobsForProvider(provider.id).catch((error) => {
      this.logger.warn(
        `Failed to remove queued jobs for provider ${provider.id}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    });

    await this.emailEmbeddingQueue.removeJobsForProvider(provider.id).catch((error) => {
      this.logger.warn(
        `Failed to remove embedding jobs for provider ${provider.id}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    });

    await this.webhookLifecycle.removeWebhookForProvider(provider.id).catch((error) => {
      this.logger.warn(
        `Failed to remove email webhook for provider ${provider.id}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    });

    // Cleanup calendar webhooks (Google/Microsoft)
    if (provider.providerType === 'google') {
      await this.googleCalendarWebhook.stopWatch(provider.id).catch((error) => {
        this.logger.warn(
          `Failed to stop Google Calendar watch for provider ${provider.id}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      });
    } else if (provider.providerType === 'microsoft') {
      await this.microsoftCalendarWebhook.deleteSubscription(provider.id).catch((error) => {
        this.logger.warn(
          `Failed to delete Microsoft Calendar subscription for provider ${provider.id}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      });
    }

    // Cleanup provider contacts before deleting emails
    await this.contactsService.deleteProviderContacts(provider.id, tenantId).catch((error) => {
      this.logger.warn(
        `Failed to cleanup contacts for provider ${provider.id}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    });

    const providerEmails = await this.prisma.email.findMany({
      where: { providerId: provider.id },
      select: { id: true },
    });

    const emailsToPurge = providerEmails.map((email) => email.id);
    if (emailsToPurge.length > 0) {
      await this.knowledgeBaseService.deleteEmbeddingsForEmails(provider.tenantId, emailsToPurge);
    }

    // Get all attachment storage paths for this provider's emails BEFORE deleting
    const attachmentsToClean = await this.prisma.emailAttachment.findMany({
      where: { emailId: { in: emailsToPurge } },
      select: { storagePath: true, contentHash: true },
    });

    // Find storage paths that are NOT used by other emails (respect deduplication)
    // Use bulk query to find all contentHashes still in use by other providers
    const uniqueHashes = [...new Set(attachmentsToClean.map((a) => a.contentHash).filter(Boolean))] as string[];

    const hashesStillInUse = uniqueHashes.length > 0
      ? await this.prisma.emailAttachment.findMany({
          where: {
            contentHash: { in: uniqueHashes },
            email: {
              providerId: { not: provider.id },
            },
          },
          select: { contentHash: true },
          distinct: ['contentHash'],
        })
      : [];

    const hashesInUseSet = new Set(hashesStillInUse.map((a) => a.contentHash));

    // Only delete storage paths whose contentHash is NOT used elsewhere
    const storagePathsToDelete = attachmentsToClean
      .filter((a) => a.storagePath && a.contentHash && !hashesInUseSet.has(a.contentHash))
      .map((a) => a.storagePath!);

    // Delete orphaned S3/MinIO objects
    if (storagePathsToDelete.length > 0) {
      try {
        const result = await this.storageService.deleteObjects(storagePathsToDelete);
        this.logger.log(
          `Cleaned up ${result.deleted} attachment files from storage for provider ${provider.id}`,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to clean up attachment files for provider ${provider.id}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }

    // CRITICAL: All DB deletions must be atomic to prevent inconsistent state
    // If any operation fails, the entire deletion should be rolled back
    const { orphanedContactsCount } = await this.prisma.$transaction(async (tx) => {
      // Delete all emails for this provider (cascade deletes attachments)
      await tx.email.deleteMany({
        where: { providerId: provider.id },
      });

      // Delete the provider config itself
      await tx.providerConfig.delete({
        where: { id: provider.id },
      });

      // Clean up orphaned unified_contacts that no longer have any provider_contacts
      // This happens because cascade deletes provider_contacts but not unified_contacts
      const orphanedContactsResult = await tx.contact.deleteMany({
        where: {
          tenantId,
          providerContacts: {
            none: {},
          },
        },
      });

      return { orphanedContactsCount: orphanedContactsResult.count };
    });

    if (orphanedContactsCount > 0) {
      this.logger.log(`Cleaned up ${orphanedContactsCount} orphaned contacts for tenant ${tenantId}`);
    }

    this.logger.log(`Provider config ${configId} deleted`);
  }

  /**
   * Test IMAP connection for IMAP provider
   */
  async testImapConnection(tenantId: string, providerId: string): Promise<any> {
    const provider = await this.prisma.providerConfig.findFirst({
      where: { id: providerId, tenantId, providerType: 'imap' },
    });

    if (!provider) {
      throw new NotFoundException('Provider not found');
    }

    if (!provider.imapHost || !provider.imapUsername || !provider.imapPassword) {
      throw new BadRequestException('IMAP configuration is incomplete');
    }

    // Decrypt password
    const imapPassword = this.crypto.decrypt(provider.imapPassword, provider.imapEncryptionIv!);

    // Test connection
    const success = await this.imap.testConnection({
      host: provider.imapHost,
      port: provider.imapPort || 993,
      username: provider.imapUsername,
      password: imapPassword,
      useTls: provider.imapUseTls ?? true,
    });

    return {
      success,
      message: success ? 'IMAP connection successful' : 'IMAP connection failed',
      host: provider.imapHost,
      port: provider.imapPort,
    };
  }

  /**
   * Test IMAP folders listing for IMAP provider
   */
  async testImapFolders(tenantId: string, providerId: string): Promise<any> {
    const provider = await this.prisma.providerConfig.findFirst({
      where: { id: providerId, tenantId, providerType: 'imap' },
    });

    if (!provider) {
      throw new NotFoundException('Provider not found');
    }

    if (!provider.imapHost || !provider.imapUsername || !provider.imapPassword) {
      throw new BadRequestException('IMAP configuration is incomplete');
    }

    // Decrypt password
    const imapPassword = this.crypto.decrypt(provider.imapPassword, provider.imapEncryptionIv!);

    // List folders
    const folders = await this.imap.listFolders({
      host: provider.imapHost,
      port: provider.imapPort || 993,
      username: provider.imapUsername,
      password: imapPassword,
      useTls: provider.imapUseTls ?? true,
    });

    return {
      success: true,
      folders,
      count: folders.length,
    };
  }

  /**
   * Test SMTP connection for IMAP provider
   */
  async testSmtpConnection(tenantId: string, providerId: string): Promise<any> {
    const provider = await this.prisma.providerConfig.findFirst({
      where: { id: providerId, tenantId, providerType: 'imap' },
    });

    if (!provider) {
      throw new NotFoundException('Provider not found');
    }

    if (!provider.smtpHost || !provider.smtpUsername || !provider.smtpPassword) {
      throw new BadRequestException('SMTP configuration is incomplete');
    }

    // Decrypt password
    const smtpPassword = this.crypto.decrypt(provider.smtpPassword, provider.smtpEncryptionIv!);

    // Test connection
    const success = await this.imap.testSmtpConnection({
      host: provider.smtpHost,
      port: provider.smtpPort || 587,
      username: provider.smtpUsername,
      password: smtpPassword,
      useTls: provider.smtpUseTls ?? true,
    });

    return {
      success,
      message: success ? 'SMTP connection successful' : 'SMTP connection failed',
      host: provider.smtpHost,
      port: provider.smtpPort,
    };
  }

  /**
   * Fetch recent messages via IMAP for IMAP provider
   */
  async testImapMessages(tenantId: string, providerId: string): Promise<any> {
    const provider = await this.prisma.providerConfig.findFirst({
      where: { id: providerId, tenantId, providerType: 'imap' },
    });

    if (!provider) {
      throw new NotFoundException('Provider not found');
    }

    if (!provider.imapHost || !provider.imapUsername || !provider.imapPassword) {
      throw new BadRequestException('IMAP configuration is incomplete');
    }

    // Decrypt password
    const imapPassword = this.crypto.decrypt(provider.imapPassword, provider.imapEncryptionIv!);

    // Fetch messages
    const messages = await this.imap.fetchMessages({
      host: provider.imapHost,
      port: provider.imapPort || 993,
      username: provider.imapUsername,
      password: imapPassword,
      useTls: provider.imapUseTls ?? true,
    }, 10); // Fetch last 10 messages

    return {
      success: true,
      messages,
      count: messages.length,
    };
  }

  /**
   * Remove sensitive data from provider config before returning
   */
  private sanitizeProviderConfig(config: any) {
    const {
      accessToken: _accessToken,
      refreshToken: _refreshToken,
      tokenEncryptionIv: _tokenEncryptionIv,
      refreshTokenEncryptionIv: _refreshTokenEncryptionIv,
      imapPassword: _imapPassword,
      imapEncryptionIv: _imapEncryptionIv,
      smtpPassword: _smtpPassword,
      smtpEncryptionIv: _smtpEncryptionIv,
      caldavPassword: _caldavPassword,
      caldavEncryptionIv: _caldavEncryptionIv,
      carddavPassword: _carddavPassword,
      carddavEncryptionIv: _carddavEncryptionIv,
      ...sanitized
    } = config;

    return sanitized;
  }

  /**
   * Immediately queue a sync job and set up webhooks when supported.
   * Order of operations: Folders → Contacts → Emails → Embeddings
   */
  private async triggerInitialSync(provider: ProviderConfig) {
    if (!provider?.id) {
      return;
    }

    // STEP 1: Sync folders/labels first
    this.logger.log(`[Initial Sync] Step 1/4: Syncing folders for provider ${provider.email}`);
    try {
      await this.folderSync.syncProviderFolders(provider.tenantId, provider.id);
      this.logger.log(`✅ [Initial Sync] Folders synced successfully for ${provider.email}`);
    } catch (error) {
      this.logger.error(
        `❌ [Initial Sync] Failed to sync folders for provider ${provider.id}: ${
          error instanceof Error ? error.message : error
        }`,
      );
      // Continue even if folder sync fails
    }

    // STEP 2: Sync contacts (if supported) - run in background, don't block
    if (provider.supportsContacts) {
      this.logger.log(`[Initial Sync] Step 2/4: Queuing contacts sync for provider ${provider.email}`);
      // Fire and forget - don't await, let it run in background
      this.contactsService
        .syncContacts(provider.id)
        .then((contactsCount) => {
          this.logger.log(`✅ [Initial Sync] ${contactsCount} contacts synced successfully for ${provider.email}`);
        })
        .catch((error) => {
          this.logger.error(
            `❌ [Initial Sync] Failed to sync contacts for provider ${provider.id}: ${
              error instanceof Error ? error.message : error
            }`,
          );
        });
    } else {
      this.logger.log(`[Initial Sync] Step 2/4: Skipping contacts (not supported by provider)`);
    }

    // STEP 3: Sync emails
    this.logger.log(`[Initial Sync] Step 3/4: Syncing emails for provider ${provider.email}`);
    let queuedViaScheduler = false;
    try {
      await this.syncScheduler.syncProviderNow(provider.id, 'high');
      queuedViaScheduler = true;
      this.logger.log(`✅ [Initial Sync] Email sync queued successfully for ${provider.email}`);
    } catch (error) {
      this.logger.error(
        `Failed to queue initial sync via scheduler for provider ${provider.id}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }

    if (!queuedViaScheduler) {
      await this.enqueueFallbackSyncJob(provider);
    }

    // STEP 4: Embeddings will be queued automatically as emails are processed
    this.logger.log(`[Initial Sync] Step 4/4: Embeddings will be queued as emails are processed`);

    // Setup webhooks for real-time updates (Google/Microsoft only)
    if (!['google', 'microsoft'].includes(provider.providerType)) {
      return;
    }

    try {
      await this.webhookLifecycle.autoCreateWebhook(provider.id);
    } catch (error) {
      this.logger.warn(
        `Failed to auto-create webhook for provider ${provider.id}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }

    try {
      await this.bootstrapCalendarIntegrations(provider);
    } catch (error) {
      this.logger.warn(
        `Failed to bootstrap calendar integrations for provider ${provider.id}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  private async bootstrapCalendarIntegrations(provider: ProviderConfig): Promise<void> {
    if (!provider.supportsCalendar) {
      return;
    }

    if (provider.providerType === 'google') {
      this.googleCalendarSync
        .syncCalendar(provider.id)
        .then(() => this.logger.log(`Completed initial Google Calendar sync for ${provider.email}`))
        .catch((error) =>
          this.logger.error(
            `Failed initial Google Calendar sync for ${provider.id}: ${
              error instanceof Error ? error.message : error
            }`,
          ),
        );

      try {
        await this.googleCalendarWebhook.setupWatch(provider.id);
      } catch (error) {
        this.logger.error(
          `Failed to setup Google Calendar webhook for ${provider.id}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
      return;
    }

    if (provider.providerType === 'microsoft') {
      this.microsoftCalendarSync
        .syncCalendar(provider.id)
        .then(() =>
          this.logger.log(`Completed initial Microsoft Calendar sync for ${provider.email}`),
        )
        .catch((error) =>
          this.logger.error(
            `Failed initial Microsoft Calendar sync for ${provider.id}: ${
              error instanceof Error ? error.message : error
            }`,
          ),
        );

      try {
        await this.microsoftCalendarWebhook.setupSubscription(provider.id);
      } catch (error) {
        this.logger.error(
          `Failed to setup Microsoft Calendar webhook for ${provider.id}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }
  }

  private async enqueueFallbackSyncJob(
    provider: {
      id: string;
      tenantId: string;
      providerType: string;
      email: string;
      lastSyncedAt?: Date | null;
    } | null,
  ): Promise<void> {
    if (!provider) {
      return;
    }

    const job: SyncJobData = {
      tenantId: provider.tenantId,
      providerId: provider.id,
      providerType: provider.providerType as SyncJobData['providerType'],
      email: provider.email,
      priority: 'high',
      syncType: 'full',
      lastSyncedAt: provider.lastSyncedAt ?? undefined,
    };

    try {
      await this.queueService.addSyncJob(job);
      this.logger.log(`Queued fallback sync job for provider ${provider.email}`);
    } catch (error) {
      this.logger.error(
        `Failed to enqueue fallback sync for provider ${provider.id}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }
}
