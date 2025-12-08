import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { GoogleOAuthService } from '../../providers/services/google-oauth.service';
import { MicrosoftOAuthService } from '../../providers/services/microsoft-oauth.service';
import { getRedisConnectionOptions } from '../../../config/configuration';
import type { ProviderConfig as ProviderEntity } from '@prisma/client';

type ProviderWithToken = {
  provider: ProviderEntity;
  accessToken: string;
};

/**
 * Centralizza recupero/refresh token provider per i servizi di sync.
 * Rimuove duplicazioni tra Google/Microsoft e IMAP.
 *
 * SCALABLE: Uses Redis distributed locking to prevent token refresh race conditions
 * when running multiple instances.
 */
@Injectable()
export class ProviderTokenService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProviderTokenService.name);
  private redis!: Redis;

  // Redis key prefix for token refresh locks
  private readonly KEY_PREFIX_LOCK = 'token:refresh:lock:';

  // Lock TTL in seconds (30 seconds should be enough for token refresh)
  private readonly LOCK_TTL_SECONDS = 30;

  // Max wait time for lock in ms
  private readonly MAX_WAIT_MS = 10000;

  // Poll interval when waiting for lock
  private readonly POLL_INTERVAL_MS = 100;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly googleOAuth: GoogleOAuthService,
    private readonly microsoftOAuth: MicrosoftOAuthService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    const options = getRedisConnectionOptions();
    this.redis = new Redis({
      ...options,
      connectionName: 'provider-token',
      lazyConnect: false,
    });

    this.redis.on('error', (err) => {
      this.logger.error(`Redis provider token service error: ${err.message}`);
    });

    this.redis.on('connect', () => {
      this.logger.log('Redis provider token service connected');
    });
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit().catch(() => {
        // Ignore quit errors during shutdown
      });
    }
  }

  async getProviderWithToken(providerId: string): Promise<ProviderWithToken> {
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new Error('Provider not found');
    }

    switch (provider.providerType) {
      case 'google':
        return { provider, accessToken: await this.getGoogleToken(provider) };
      case 'microsoft':
        return { provider, accessToken: await this.getMicrosoftToken(provider) };
      case 'imap':
      case 'generic':
        // IMAP/generic providers use password auth, not OAuth tokens
        return { provider, accessToken: await this.getImapToken(provider) };
      default:
        throw new Error(`Unsupported provider type: ${provider.providerType}`);
    }
  }

  private async getMicrosoftToken(provider: ProviderEntity): Promise<string> {
    if (!provider.accessToken || !provider.tokenEncryptionIv) {
      throw new Error('Provider missing access token');
    }

    const now = new Date();
    const expiresSoon = provider.tokenExpiresAt
      ? now.getTime() >= new Date(provider.tokenExpiresAt).getTime() - 60_000
      : true;

    let accessToken = this.crypto.decrypt(provider.accessToken, provider.tokenEncryptionIv);
    const tokenLooksValid = accessToken.includes('.');

    const canRefresh = provider.refreshToken && provider.refreshTokenEncryptionIv;

    if ((!tokenLooksValid || expiresSoon) && canRefresh) {
      // Use distributed lock to prevent race condition
      accessToken = await this.refreshMicrosoftTokenWithLock(provider);
    } else if (!tokenLooksValid && !canRefresh) {
      this.logger.error(
        `Microsoft token invalid and no refresh token available for ${provider.email} (${provider.id})`,
      );
      throw new Error('Microsoft provider requires re-authentication (invalid access token)');
    }

    return accessToken;
  }

  /**
   * Refresh Microsoft token with distributed lock
   */
  private async refreshMicrosoftTokenWithLock(provider: ProviderEntity): Promise<string> {
    const lockKey = `${this.KEY_PREFIX_LOCK}${provider.id}`;

    // Try to acquire lock
    const lockAcquired = await this.acquireLock(lockKey);

    if (!lockAcquired) {
      // Another instance is refreshing, wait for it
      this.logger.debug(`Waiting for token refresh lock: ${provider.email}`);
      await this.waitForLockRelease(lockKey);

      // Re-read provider from DB to get fresh token
      const freshProvider = await this.prisma.providerConfig.findUnique({
        where: { id: provider.id },
      });

      if (!freshProvider?.accessToken || !freshProvider.tokenEncryptionIv) {
        throw new Error('Provider token not available after wait');
      }

      return this.crypto.decrypt(freshProvider.accessToken, freshProvider.tokenEncryptionIv);
    }

    try {
      // We hold the lock, do the refresh
      const refreshToken = this.crypto.decrypt(
        provider.refreshToken!,
        provider.refreshTokenEncryptionIv!,
      );

      const refreshed = await this.microsoftOAuth.refreshAccessToken(refreshToken);
      const accessToken = refreshed.accessToken;

      const encryptedAccess = this.crypto.encrypt(refreshed.accessToken);
      const updateData: Record<string, any> = {
        accessToken: encryptedAccess.encrypted,
        tokenEncryptionIv: encryptedAccess.iv,
        tokenExpiresAt: refreshed.expiresAt,
      };

      if (refreshed.refreshToken) {
        const encryptedRefresh = this.crypto.encrypt(refreshed.refreshToken);
        updateData.refreshToken = encryptedRefresh.encrypted;
        updateData.refreshTokenEncryptionIv = encryptedRefresh.iv;
      }

      await this.prisma.providerConfig.update({
        where: { id: provider.id },
        data: updateData,
      });

      this.logger.log(`Microsoft token refreshed for ${provider.email}`);
      return accessToken;
    } finally {
      // Always release lock
      await this.releaseLock(lockKey);
    }
  }

  private async getGoogleToken(provider: ProviderEntity): Promise<string> {
    if (!provider.accessToken || !provider.tokenEncryptionIv) {
      throw new Error('Provider missing access token');
    }

    const now = new Date();
    // Proactive refresh: 60 seconds BEFORE expiration (like Microsoft)
    const expiresSoon = provider.tokenExpiresAt
      ? now.getTime() >= new Date(provider.tokenExpiresAt).getTime() - 60_000
      : true;

    let accessToken = this.crypto.decrypt(provider.accessToken, provider.tokenEncryptionIv);
    const tokenLooksValid = accessToken.length > 50; // Google access tokens are long

    const canRefresh = provider.refreshToken && provider.refreshTokenEncryptionIv;

    if ((!tokenLooksValid || expiresSoon) && canRefresh) {
      // Use distributed lock to prevent race condition
      accessToken = await this.refreshGoogleTokenWithLock(provider);
    } else if (!tokenLooksValid && !canRefresh) {
      this.logger.error(
        `Google token invalid and no refresh token available for ${provider.email} (${provider.id})`,
      );
      throw new Error('Google provider requires re-authentication (invalid access token)');
    }

    return accessToken;
  }

  /**
   * Refresh Google token with distributed lock
   */
  private async refreshGoogleTokenWithLock(provider: ProviderEntity): Promise<string> {
    const lockKey = `${this.KEY_PREFIX_LOCK}${provider.id}`;

    // Try to acquire lock
    const lockAcquired = await this.acquireLock(lockKey);

    if (!lockAcquired) {
      // Another instance is refreshing, wait for it
      this.logger.debug(`Waiting for token refresh lock: ${provider.email}`);
      await this.waitForLockRelease(lockKey);

      // Re-read provider from DB to get fresh token
      const freshProvider = await this.prisma.providerConfig.findUnique({
        where: { id: provider.id },
      });

      if (!freshProvider?.accessToken || !freshProvider.tokenEncryptionIv) {
        throw new Error('Provider token not available after wait');
      }

      return this.crypto.decrypt(freshProvider.accessToken, freshProvider.tokenEncryptionIv);
    }

    try {
      this.logger.log(`Google token expiring soon or invalid for ${provider.email}, refreshing...`);

      const refreshToken = this.crypto.decrypt(
        provider.refreshToken!,
        provider.refreshTokenEncryptionIv!,
      );

      const refreshed = await this.googleOAuth.refreshAccessToken(refreshToken);
      const accessToken = refreshed.accessToken;

      const encryptedAccess = this.crypto.encrypt(refreshed.accessToken);

      await this.prisma.providerConfig.update({
        where: { id: provider.id },
        data: {
          accessToken: encryptedAccess.encrypted,
          tokenEncryptionIv: encryptedAccess.iv,
          tokenExpiresAt: refreshed.expiresAt,
        },
      });

      this.logger.log(`Google token refreshed successfully for ${provider.email}`);
      return accessToken;
    } finally {
      // Always release lock
      await this.releaseLock(lockKey);
    }
  }

  private async getImapToken(provider: ProviderEntity): Promise<string> {
    if (!provider.accessToken || !provider.tokenEncryptionIv) {
      return '';
    }
    return this.crypto.decrypt(provider.accessToken, provider.tokenEncryptionIv);
  }

  /**
   * IMAP credentials helper (uses provider values or env defaults).
   */
  getImapCredentials(provider: ProviderEntity): {
    host: string;
    port: number;
    useTls: boolean;
    username: string;
    password: string;
  } {
    const host = provider.imapHost || this.config.get<string>('IMAP_HOST', 'imap.local');
    const port = provider.imapPort || this.config.get<number>('IMAP_PORT', 993);
    const useTls = typeof provider.imapUseTls === 'boolean'
      ? provider.imapUseTls
      : this.config.get<boolean>('IMAP_SECURE', true);
    const username =
      provider.imapUsername || this.config.get<string>('IMAP_USER', '');

    let password = '';
    if (provider.imapPassword && provider.imapEncryptionIv) {
      password = this.crypto.decrypt(provider.imapPassword, provider.imapEncryptionIv);
    } else {
      password = this.config.get<string>('IMAP_PASSWORD', '');
    }

    return { host, port, useTls, username, password };
  }

  // ==================== DISTRIBUTED LOCKING ====================

  /**
   * Acquire a distributed lock using Redis SETNX
   */
  private async acquireLock(key: string): Promise<boolean> {
    try {
      const result = await this.redis.set(key, process.pid.toString(), 'EX', this.LOCK_TTL_SECONDS, 'NX');
      return result === 'OK';
    } catch (error) {
      this.logger.error(`Lock acquire failed: ${error instanceof Error ? error.message : String(error)}`);
      // On Redis error, proceed without lock (fail open)
      return true;
    }
  }

  /**
   * Release a distributed lock
   */
  private async releaseLock(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      this.logger.error(`Lock release failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Wait for a lock to be released by another instance
   */
  private async waitForLockRelease(key: string): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.MAX_WAIT_MS) {
      try {
        const exists = await this.redis.exists(key);
        if (!exists) {
          return; // Lock released
        }
      } catch (error) {
        // On error, stop waiting
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, this.POLL_INTERVAL_MS));
    }

    this.logger.warn(`Lock wait timeout for ${key}`);
  }
}
