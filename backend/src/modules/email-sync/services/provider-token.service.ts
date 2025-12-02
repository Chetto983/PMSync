import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { GoogleOAuthService } from '../../providers/services/google-oauth.service';
import { MicrosoftOAuthService } from '../../providers/services/microsoft-oauth.service';
import type { ProviderConfig as ProviderEntity } from '@prisma/client';

type ProviderWithToken = {
  provider: ProviderEntity;
  accessToken: string;
};

/**
 * Centralizza recupero/refresh token provider per i servizi di sync.
 * Rimuove duplicazioni tra Google/Microsoft e IMAP.
 */
@Injectable()
export class ProviderTokenService {
  private readonly logger = new Logger(ProviderTokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly googleOAuth: GoogleOAuthService,
    private readonly microsoftOAuth: MicrosoftOAuthService,
    private readonly config: ConfigService,
  ) {}

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
      const refreshToken = this.crypto.decrypt(
        provider.refreshToken!,
        provider.refreshTokenEncryptionIv!,
      );

      const refreshed = await this.microsoftOAuth.refreshAccessToken(refreshToken);
      accessToken = refreshed.accessToken;

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
    }

    if (!tokenLooksValid && !canRefresh) {
      this.logger.error(
        `Microsoft token invalid and no refresh token available for ${provider.email} (${provider.id})`,
      );
      throw new Error('Microsoft provider requires re-authentication (invalid access token)');
    }

    return accessToken;
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
      this.logger.log(`Google token expiring soon or invalid for ${provider.email}, refreshing...`);

      const refreshToken = this.crypto.decrypt(
        provider.refreshToken!,
        provider.refreshTokenEncryptionIv!,
      );

      const refreshed = await this.googleOAuth.refreshAccessToken(refreshToken);
      accessToken = refreshed.accessToken;

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
    }

    if (!tokenLooksValid && !canRefresh) {
      this.logger.error(
        `Google token invalid and no refresh token available for ${provider.email} (${provider.id})`,
      );
      throw new Error('Google provider requires re-authentication (invalid access token)');
    }

    return accessToken;
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
}
