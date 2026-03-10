import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { GoogleOAuthService } from './google-oauth.service';
import { MicrosoftOAuthService } from './microsoft-oauth.service';
import { ImapService } from './imap.service';
import { CalDavService } from './caldav.service';
import { SubscriptionService, PLAN_LIMITS } from '../../subscription/services/subscription.service';
import {
  ProviderConnectedEvent,
  ProviderDisconnectedEvent,
} from '../../../common/events/provider.events';
import type { ProviderConfig } from '@prisma/client';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping/tenant-context';
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

/**
 * ProviderConfigService - Manages provider CRUD and lifecycle.
 *
 * Phase 32: Decoupled from domain modules via domain events.
 * - ProviderConnectedEvent replaces direct triggerInitialSync calls
 * - ProviderDisconnectedEvent replaces direct cleanup service calls
 * - Only depends on ProvidersModule-internal services + Prisma + EventEmitter2
 */
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
    private readonly subscriptionService: SubscriptionService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Check if tenant can add more providers based on subscription plan.
   * @throws ForbiddenException if provider limit exceeded
   */
  private async checkProviderLimit(tenantId: string): Promise<void> {
    const currentCount = await this.prisma.providerConfig.count({
      where: { tenantId, isActive: true },
    });

    const subscription = await this.subscriptionService.getOrCreateSubscription(tenantId);
    const planLimits = PLAN_LIMITS[subscription.plan];

    if (planLimits.maxProviders !== -1 && currentCount >= planLimits.maxProviders) {
      this.logger.warn(
        `Provider limit exceeded for tenant ${tenantId}: ${currentCount}/${planLimits.maxProviders} on ${subscription.plan} plan`,
      );
      throw new ForbiddenException(
        `Maximum ${planLimits.maxProviders} email account(s) allowed on ${subscription.plan} plan. ` +
        `Please upgrade to add more accounts.`,
      );
    }
  }

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
      // Check provider limit before creating
      await this.checkProviderLimit(tenantId);

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

      // Phase 32: Emit event instead of calling sync services directly
      this.emitProviderConnected(providerConfig, userId);

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
      // Check provider limit before creating
      await this.checkProviderLimit(tenantId);

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

      // Phase 32: Emit event instead of calling sync services directly
      this.emitProviderConnected(providerConfig, userId);

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
      // Check provider limit before creating
      await this.checkProviderLimit(tenantId);

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

      // Phase 32: Emit event instead of calling sync services directly
      this.emitProviderConnected(providerConfig, userId);

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
   * Update provider settings (displayName, scope, isDefault).
   * When setting isDefault=true, clears isDefault on other providers for same tenant.
   */
  async updateProviderConfig(
    tenantId: string,
    configId: string,
    data: { displayName?: string; scope?: string; isDefault?: boolean },
  ) {
    const config = await this.prisma.providerConfig.findFirst({
      where: { id: configId, tenantId },
    });

    if (!config) {
      throw new NotFoundException('Provider config not found');
    }

    // If setting as default, unset other defaults first
    if (data.isDefault === true) {
      await this.prisma.providerConfig.updateMany({
        where: { tenantId, isDefault: true, id: { not: configId } },
        data: { isDefault: false },
      });
    }

    const updated = await this.prisma.providerConfig.update({
      where: { id: configId },
      data: {
        displayName: data.displayName,
        scope: data.scope,
        isDefault: data.isDefault,
      },
    });

    this.logger.log(`Provider ${configId} updated: ${JSON.stringify(data)}`);

    return this.sanitizeProviderConfig(updated);
  }

  /**
   * Delete a provider config.
   *
   * Phase 32: External cleanup (queues, webhooks, contacts, embeddings, storage)
   * is handled by @OnEvent(ProviderDisconnectedEvent) handlers in consuming modules.
   * This method only handles: token revocation (local), DB deletion (Prisma), event emission.
   */
  async deleteProviderConfig(tenantId: string, configId: string) {
    const provider = await this.prisma.providerConfig.findFirst({
      where: { id: configId, tenantId },
    });

    if (!provider) {
      throw new NotFoundException('Provider config not found');
    }

    // SEC-02: Revoke OAuth tokens before deleting provider (local to ProvidersModule)
    await this.revokeProviderTokens(provider);

    // Phase 32: Emit disconnect event BEFORE DB deletion so consumers can cleanup
    // Event handlers are fire-and-forget with try/catch -- non-blocking
    this.eventEmitter.emit(
      ProviderDisconnectedEvent.eventName,
      new ProviderDisconnectedEvent(
        provider.tenantId,
        provider.id,
        provider.providerType,
        provider.supportsCalendar,
        provider.supportsContacts,
        new Date(),
      ),
    );

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
   * Revoke OAuth tokens for a provider (SEC-02)
   * Best-effort: failures are logged but do not block deletion.
   * - Google: Calls official revocation endpoint
   * - Microsoft: Attempts session revocation (best-effort, may not be permitted)
   * - IMAP/generic: No OAuth tokens to revoke
   */
  private async revokeProviderTokens(provider: ProviderConfig): Promise<void> {
    try {
      if (provider.providerType === 'google' && provider.refreshToken && provider.refreshTokenEncryptionIv) {
        const refreshToken = this.crypto.decrypt(
          provider.refreshToken,
          provider.refreshTokenEncryptionIv,
        );
        await this.googleOAuth.revokeToken(refreshToken);
      } else if (provider.providerType === 'microsoft' && provider.accessToken && provider.tokenEncryptionIv) {
        // Microsoft needs valid access token for session revocation
        const accessToken = this.crypto.decrypt(
          provider.accessToken,
          provider.tokenEncryptionIv,
        );
        await this.microsoftOAuth.revokeSession(accessToken);
      }
      // IMAP/generic providers: no OAuth revocation needed
    } catch (error) {
      // Never fail disconnect due to revocation failure
      this.logger.warn(
        `Token revocation failed for provider ${provider.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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
   * Auto-connect email provider from better-auth social login tokens.
   *
   * Reads the Account table (managed by better-auth) for the user's
   * social provider, encrypts the tokens, and upserts a ProviderConfig.
   * This eliminates the need for a second OAuth flow during onboarding.
   *
   * @returns The connected provider config, or null if no social account found
   */
  async autoConnectSocialProvider(
    tenantId: string,
    userId: string,
    userEmail: string,
  ): Promise<ReturnType<typeof this.sanitizeProviderConfig> | null> {
    // Find social account from better-auth's Account table (unscoped by tenant)
    const account = await withoutTenantScopingAsync(() =>
      this.prisma.account.findFirst({
        where: {
          userId,
          providerId: { in: ['google', 'microsoft'] },
          accessToken: { not: null },
        },
        orderBy: { updatedAt: 'desc' },
      }),
    );

    if (!account?.accessToken) {
      this.logger.debug(`No social account with tokens found for user ${userId}`);
      return null;
    }

    // Check if provider already connected (avoid duplicates)
    const providerType = account.providerId as 'google' | 'microsoft';
    const existing = await this.prisma.providerConfig.findUnique({
      where: {
        tenantId_email_providerType: {
          tenantId,
          email: userEmail,
          providerType,
        },
      },
    });

    if (existing?.isActive) {
      this.logger.debug(`Provider ${providerType} already connected for ${userEmail}`);
      return this.sanitizeProviderConfig(existing);
    }

    // Check provider limit
    await this.checkProviderLimit(tenantId);

    // Encrypt tokens from better-auth Account (stored unencrypted)
    const encryptedAccessToken = this.crypto.encrypt(account.accessToken);
    const encryptedRefreshToken = account.refreshToken
      ? this.crypto.encrypt(account.refreshToken)
      : null;

    // Upsert ProviderConfig with encrypted tokens
    const providerConfig = await this.prisma.providerConfig.upsert({
      where: {
        tenantId_email_providerType: {
          tenantId,
          email: userEmail,
          providerType,
        },
      },
      create: {
        tenantId,
        userId,
        providerType,
        email: userEmail,
        supportsEmail: true,
        supportsCalendar: true,
        supportsContacts: true,
        accessToken: encryptedAccessToken.encrypted,
        refreshToken: encryptedRefreshToken?.encrypted ?? '',
        tokenEncryptionIv: encryptedAccessToken.iv,
        refreshTokenEncryptionIv: encryptedRefreshToken?.iv ?? '',
        tokenExpiresAt: account.accessTokenExpiresAt,
        isDefault: true,
      },
      update: {
        accessToken: encryptedAccessToken.encrypted,
        refreshToken: encryptedRefreshToken?.encrypted ?? '',
        tokenEncryptionIv: encryptedAccessToken.iv,
        refreshTokenEncryptionIv: encryptedRefreshToken?.iv ?? '',
        tokenExpiresAt: account.accessTokenExpiresAt,
        isActive: true,
        lastSyncedAt: new Date(),
      },
    });

    const sanitized = this.sanitizeProviderConfig(providerConfig);

    // Emit event to trigger initial sync
    this.emitProviderConnected(providerConfig, userId);

    this.logger.log(
      `Auto-connected ${providerType} provider for ${userEmail} from social login`,
    );

    return sanitized;
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
   * Emit ProviderConnectedEvent to trigger initial sync in consuming modules.
   * Replaces the old triggerInitialSync() that directly called domain services.
   */
  private emitProviderConnected(provider: ProviderConfig, userId: string): void {
    if (!provider?.id) {
      return;
    }

    this.logger.log(`Emitting ProviderConnectedEvent for provider ${provider.email}`);
    this.eventEmitter.emit(
      ProviderConnectedEvent.eventName,
      new ProviderConnectedEvent(
        provider.tenantId,
        userId,
        provider.id,
        provider.providerType,
        new Date(),
      ),
    );
  }
}
