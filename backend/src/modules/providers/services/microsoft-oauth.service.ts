import { Injectable, Logger, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ConfidentialClientApplication, Configuration, AccountInfo } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';
import { randomBytes } from 'crypto';
import { getConfiguration } from '../../../config/configuration';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { MicrosoftAuthError, MicrosoftRateLimitError } from '../errors';

@Injectable()
export class MicrosoftOAuthService {
  private readonly logger = new Logger(MicrosoftOAuthService.name);
  private msalClient: ConfidentialClientApplication;
  private config = getConfiguration();
  private readonly defaultScopes = [
    'openid',
    'profile',
    'email',
    'offline_access',
    'https://graph.microsoft.com/Mail.ReadWrite',
    'https://graph.microsoft.com/Mail.Send',
    'https://graph.microsoft.com/Calendars.ReadWrite',
    'https://graph.microsoft.com/Contacts.ReadWrite',
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: CryptoService,
  ) {
    const { clientId, clientSecret } = this.config.oauth.microsoft;
    // Use MICROSOFT_TENANT_ID from env (default: 'common' for multi-tenant)
    const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';

    const msalConfig: Configuration = {
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        clientSecret,
      },
    };

    this.msalClient = new ConfidentialClientApplication(msalConfig);
  }

  /**
   * Revoke Microsoft sign-in sessions (SEC-02 - best effort)
   * Note: Microsoft does NOT have a true token revocation API.
   * This invalidates refresh tokens but access tokens remain valid up to 1 hour.
   * @param accessToken - Valid access token to call Graph API
   */
  async revokeSession(accessToken: string): Promise<void> {
    try {
      const response = await fetch(
        'https://graph.microsoft.com/v1.0/me/revokeSignInSessions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (response.ok) {
        this.logger.log('Microsoft sign-in sessions revoked');
      } else if (response.status === 403) {
        // Permission not granted - expected for many OAuth apps
        this.logger.debug(
          'Microsoft session revocation not permitted (missing User.RevokeSessions.All)',
        );
      } else {
        this.logger.warn(
          `Microsoft session revocation returned ${response.status}: ${await response.text()}`,
        );
      }
    } catch (error) {
      // Best effort - don't fail disconnect
      this.logger.warn(
        `Microsoft session revocation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Generate Microsoft OAuth2 authorization URL
   * Supports PKCE (Proof Key for Code Exchange) for enhanced security
   */
  generateAuthUrl(
    scopes?: string[],
    pkceOptions?: { state: string; codeChallenge: string; codeChallengeMethod: 'S256' },
  ): { authUrl: string; state: string } {
    const requestedScopes = scopes && scopes.length > 0 ? scopes : this.defaultScopes;

    // Use provided state or generate one (fallback for backward compatibility)
    const state = pkceOptions?.state || this.generateRandomState();

    let authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
      `client_id=${this.config.oauth.microsoft.clientId}&` +
      `response_type=code&` +
      `redirect_uri=${encodeURIComponent(this.config.oauth.microsoft.redirectUri)}&` +
      `response_mode=query&` +
      `scope=${encodeURIComponent(requestedScopes.join(' '))}&` +
      `state=${state}&` +
      `prompt=consent`;

    // Add PKCE if provided
    if (pkceOptions?.codeChallenge) {
      authUrl += `&code_challenge=${encodeURIComponent(pkceOptions.codeChallenge)}`;
      authUrl += `&code_challenge_method=${pkceOptions.codeChallengeMethod}`;
    }

    return { authUrl, state };
  }

  /**
   * Exchange authorization code for tokens
   * @param codeVerifier - PKCE code_verifier for enhanced security (optional)
   */
  async exchangeCodeForTokens(authorizationCode: string, codeVerifier?: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    email: string;
  }> {
    try {
      this.logger.log(`Exchanging authorization code for tokens...`);
      this.logger.debug(`Redirect URI: ${this.config.oauth.microsoft.redirectUri}`);
      this.logger.debug(`Code length: ${authorizationCode.length}`);
      this.logger.debug(`Code starts with: ${authorizationCode.substring(0, 20)}...`);
      if (codeVerifier) {
        this.logger.debug(`PKCE code_verifier provided (${codeVerifier.length} chars)`);
      }

      const tokenRequest: any = {
        code: authorizationCode,
        scopes: this.defaultScopes,
        redirectUri: this.config.oauth.microsoft.redirectUri,
      };

      // Add PKCE code_verifier if provided
      if (codeVerifier) {
        tokenRequest.codeVerifier = codeVerifier;
      }

      this.logger.log(`Calling MSAL acquireTokenByCode...`);
      const response = await this.msalClient.acquireTokenByCode(tokenRequest);
      this.logger.log(`MSAL response received`);

      if (!response || !response.accessToken) {
        throw new UnauthorizedException('Failed to obtain access token');
      }

      // Validate JWT format
      const isJwtAccessToken = response.accessToken.includes('.');

      if (!this.validateJWT(response.accessToken, 'new access token')) {
        this.logger.error('Microsoft returned invalid JWT token');
        throw new UnauthorizedException('Received invalid token from Microsoft');
      }

      if (isJwtAccessToken) {
        this.logger.log(`Access token is valid JWT (${response.accessToken.length} chars)`);
      } else {
        this.logger.log(`Access token is opaque (${response.accessToken.length} chars)`);
      }

      // Microsoft MSAL may not return refresh token in the response object, so try cache fallback
      let refreshToken = (response as any).refreshToken || '';

      if (!refreshToken) {
        refreshToken = await this.getRefreshTokenFromCache(response.account);
        if (refreshToken) {
          this.logger.log(`Refresh token retrieved from MSAL cache (${refreshToken.length} chars)`);
        }
      }

      if (!refreshToken) {
        this.logger.warn(
          'Refresh token not available after MSAL exchange. Provider will require re-consent before tokens expire.',
        );
      } else if (refreshToken.length < 10) {
        this.logger.error('Refresh token is too short or invalid');
        throw new UnauthorizedException('Failed to obtain valid refresh token from Microsoft');
      } else {
        this.logger.log(`Refresh token obtained successfully (${refreshToken.length} chars)`);
      }

      // Get user email from the token or make a Graph API call
      const email = response.account?.username || '';

      if (!email) {
        // Fallback: get user info from Graph API
        const graphClient = this.getGraphClient(response.accessToken);
        const user = await graphClient.api('/me').select('mail,userPrincipalName').get();
        const userEmail = user.mail || user.userPrincipalName;

        if (!userEmail) {
          throw new UnauthorizedException('Failed to retrieve user email');
        }

        this.logger.log(`Successfully exchanged code for tokens for ${userEmail}`);

        return {
          accessToken: response.accessToken,
          refreshToken: refreshToken,
          expiresAt: response.expiresOn || new Date(Date.now() + 3600 * 1000),
          email: userEmail,
        };
      }

      this.logger.log(`Successfully exchanged code for tokens for ${email}`);

      return {
        accessToken: response.accessToken,
        refreshToken: refreshToken,
        expiresAt: response.expiresOn || new Date(Date.now() + 3600 * 1000),
        email,
      };
    } catch (error) {
      this.logger.error('Failed to exchange authorization code:', error);

      // Log detailed error information
      if (error && typeof error === 'object') {
        this.logger.error('Error details:', JSON.stringify(error, null, 2));
        if ('errorCode' in error) {
          this.logger.error(`MSAL Error Code: ${(error as any).errorCode}`);
        }
        if ('errorMessage' in error) {
          this.logger.error(`MSAL Error Message: ${(error as any).errorMessage}`);
        }
      }

      throw new UnauthorizedException('Invalid authorization code');
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    expiresAt: Date;
    refreshToken?: string;
  }> {
    try {
      const refreshTokenRequest = {
        refreshToken,
        scopes: this.defaultScopes,
      };

      const response = await this.msalClient.acquireTokenByRefreshToken(refreshTokenRequest);

      if (!response || !response.accessToken) {
        throw new UnauthorizedException('Failed to refresh access token');
      }

      let updatedRefreshToken = (response as any).refreshToken || '';

      if (!updatedRefreshToken) {
        updatedRefreshToken = (await this.getRefreshTokenFromCache(response.account)) || '';
      }

      this.logger.log('Successfully refreshed access token');

      return {
        accessToken: response.accessToken,
        expiresAt: response.expiresOn || new Date(Date.now() + 3600 * 1000),
        refreshToken: updatedRefreshToken || undefined,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = (error as any)?.errorCode || (error as any)?.code;

      this.logger.error(`Failed to refresh Microsoft access token: ${errorMessage}`, {
        errorCode,
        errorType: (error as any)?.constructor?.name,
      });

      // T-0601: Throw typed MicrosoftProviderError hierarchy for structured handling
      if (errorMessage.includes('insufficient') || errorMessage.includes('access_denied') || errorCode === 'consent_required') {
        throw new MicrosoftAuthError('consent_revoked', undefined, error instanceof Error ? error : undefined);
      }

      if (errorMessage.includes('invalid_grant') || errorCode === 'invalid_grant' || errorMessage.includes('AADSTS700082')) {
        throw new MicrosoftAuthError('token_expired', undefined, error instanceof Error ? error : undefined);
      }

      if (errorMessage.includes('AADSTS50076') || errorMessage.includes('interaction_required')) {
        throw new MicrosoftAuthError('interaction_required', undefined, error instanceof Error ? error : undefined);
      }

      if (errorMessage.includes('rate') || errorCode === 429 || errorMessage.includes('throttled')) {
        throw new MicrosoftRateLimitError(undefined, undefined, error instanceof Error ? error : undefined);
      }

      // Fallback: classify via MSAL error code analysis
      throw MicrosoftAuthError.fromMsalError(error);
    }
  }

  /**
   * Return a valid access token, refreshing and persisting if needed.
   */
  async getTokenOrRefresh(provider: any): Promise<string> {
    if (!provider.accessToken || !provider.tokenEncryptionIv) {
      throw new UnauthorizedException('Provider has no access token');
    }

    let accessToken = this.cryptoService.decrypt(
      provider.accessToken,
      provider.tokenEncryptionIv,
    );

    const expiresSoon =
      !provider.tokenExpiresAt ||
      provider.tokenExpiresAt.getTime() <= Date.now() + 60 * 1000;

    if (!expiresSoon) {
      return accessToken;
    }

    if (!provider.refreshToken || !provider.refreshTokenEncryptionIv) {
      throw new UnauthorizedException('Access token expired and no refresh token is available');
    }

    const refreshToken = this.cryptoService.decrypt(
      provider.refreshToken,
      provider.refreshTokenEncryptionIv,
    );

    const refreshed = await this.refreshAccessToken(refreshToken);
    accessToken = refreshed.accessToken;

    const encryptedAccess = this.cryptoService.encrypt(refreshed.accessToken);
    const updateData: Record<string, any> = {
      accessToken: encryptedAccess.encrypted,
      tokenEncryptionIv: encryptedAccess.iv,
      tokenExpiresAt: refreshed.expiresAt,
    };

    if (refreshed.refreshToken) {
      const encryptedRefresh = this.cryptoService.encrypt(refreshed.refreshToken);
      updateData.refreshToken = encryptedRefresh.encrypted;
      updateData.refreshTokenEncryptionIv = encryptedRefresh.iv;
    }

    await this.prisma.providerConfig.update({
      where: { id: provider.id },
      data: updateData,
    });

    return accessToken;
  }

  /**
   * Test Outlook/Exchange API connection
   */
  async testMailConnection(accessToken: string): Promise<boolean> {
    try {
      const graphClient = this.getGraphClient(accessToken);

      // Try to get mail folders
      await graphClient.api('/me/mailFolders').get();

      this.logger.log('Microsoft Mail API connection test successful');
      return true;
    } catch (error) {
      this.logger.error('Microsoft Mail API connection test failed:', error);
      return false;
    }
  }

  /**
   * Test Microsoft Calendar API connection
   */
  async testCalendarConnection(accessToken: string): Promise<boolean> {
    try {
      const graphClient = this.getGraphClient(accessToken);

      // Try to list calendars
      await graphClient.api('/me/calendars').get();

      this.logger.log('Microsoft Calendar API connection test successful');
      return true;
    } catch (error) {
      this.logger.error('Microsoft Calendar API connection test failed:', error);
      return false;
    }
  }

  /**
   * Create Graph API client with access token
   */
  private getGraphClient(accessToken: string): Client {
    return Client.init({
      authProvider: (done) => {
        done(null, accessToken);
      },
    });
  }

  /**
   * Retrieve refresh token from MSAL cache for given account
   */
  private async getRefreshTokenFromCache(account?: AccountInfo | null): Promise<string | null> {
    try {
      const tokenCache = this.msalClient.getTokenCache();
      const serialized = tokenCache.serialize();

      if (!serialized) {
        this.logger.debug('MSAL cache serialization returned empty string when searching for refresh token.');
        return null;
      }

      const cache = JSON.parse(serialized) as {
        RefreshToken?: Record<
          string,
          { secret?: string; client_id?: string; environment?: string; home_account_id?: string }
        >;
      };

      const refreshTokens = cache.RefreshToken;

      if (!refreshTokens) {
        this.logger.debug('No refresh tokens present in MSAL cache.');
        return null;
      }

      const accountEnvironment = account?.environment;
      const accountHomeId = account?.homeAccountId;
      const clientId = this.config.oauth.microsoft.clientId;

      const matchingEntry = Object.values(refreshTokens).find((entry) => {
        if (!entry?.secret) {
          return false;
        }

        const clientMatches = entry.client_id === clientId;
        const environmentMatches = accountEnvironment ? entry.environment === accountEnvironment : true;
        const homeIdMatches = accountHomeId ? entry.home_account_id === accountHomeId : true;

        return clientMatches && environmentMatches && homeIdMatches;
      });

      if (matchingEntry?.secret) {
        return matchingEntry.secret;
      }

      this.logger.debug('No matching refresh token entry found in MSAL cache.');
      return null;
    } catch (error) {
      this.logger.error('Failed to read refresh token from MSAL cache:', error);
      return null;
    }
  }

  /**
   * List aliases/identities for Microsoft account
   * Uses /me with otherMails_userPrincipalName_mail
   */
  async getAliases(tenantId: string, providerId: string): Promise<{ email: string; name?: string }[]> {
    try {
      const { accessToken } = await this.getProviderWithTokens(tenantId, providerId);
      const graphClient = this.getGraphClient(accessToken);

      const response = await graphClient
        .api('/me')
        .select('mail,userPrincipalName,otherMails,displayName')
        .get();

      const emails: string[] = [];
      if (response.mail) emails.push(response.mail);
      if (response.userPrincipalName) emails.push(response.userPrincipalName);
      if (Array.isArray(response.otherMails)) emails.push(...response.otherMails);

      const uniqueEmails = Array.from(new Set(emails.filter(Boolean)));
      return uniqueEmails.map((email: string) => ({
        email,
        name: response.displayName || undefined,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Failed to fetch aliases from Microsoft Graph API for provider ${providerId}: ${errorMessage}. Falling back to provider email.`
      );

      // Fallback: return the primary provider email if Graph API fails
      const provider = await this.prisma.providerConfig.findFirst({
        where: { id: providerId, tenantId },
        select: { email: true },
      });

      return provider?.email ? [{ email: provider.email }] : [];
    }
  }

  /**
   * Generate cryptographically secure random state for CSRF protection
   * Uses crypto.randomBytes instead of Math.random for security
   */
  private generateRandomState(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Validate JWT token format
   */
  private validateJWT(token: string, tokenType: string): boolean {
    if (!token) {
      this.logger.error(`Empty token received for ${tokenType}`);
      return false;
    }

    if (!token.includes('.')) {
      this.logger.debug(`Received ${tokenType} in opaque (non-JWT) format; accepting token as-is.`);
      this.logger.debug(`Token length: ${token.length}, starts with: ${token.substring(0, 50)}...`);
      return true;
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      this.logger.error(`Invalid JWT format for ${tokenType}: ${parts.length} parts instead of 3`);
      this.logger.debug(`Token length: ${token.length}, starts with: ${token.substring(0, 50)}...`);
      return false;
    }
    return true;
  }

  /**
   * Get provider config and decrypt tokens
   *
   * PERFORMANCE OPTIMIZATION:
   * - Background refresh when token expires in < 5 minutes
   * - Returns current valid token immediately (non-blocking)
   * - Blocking refresh only when token already expired
   */
  private async getProviderWithTokens(tenantId: string, providerId: string) {
    const provider = await this.prisma.providerConfig.findFirst({
      where: { id: providerId, tenantId },
    });

    if (!provider) {
      throw new UnauthorizedException('Provider not found');
    }

    this.logger.debug(`Token expires at: ${provider.tokenExpiresAt}`);
    this.logger.debug(`Current time: ${new Date()}`);

    // Decrypt access token
    let accessToken = this.cryptoService.decrypt(
      provider.accessToken!,
      provider.tokenEncryptionIv!,
    );

    this.logger.debug(`Decrypted access token length: ${accessToken.length}`);

    // Validate decrypted token
    if (!this.validateJWT(accessToken, 'access token')) {
      this.logger.error('Decrypted access token is not a valid JWT. Provider needs re-authentication.');
      throw new UnauthorizedException('Invalid token format. Please reconnect this provider.');
    }

    const now = Date.now();
    const expiresAt = provider.tokenExpiresAt?.getTime() || 0;

    // Token already expired - must refresh synchronously
    const isExpired = expiresAt <= now;

    // Token expires within 5 minutes - trigger background refresh
    const needsBackgroundRefresh = !isExpired && expiresAt <= now + 5 * 60 * 1000;

    this.logger.debug(`Is expired: ${isExpired}, Needs background refresh: ${needsBackgroundRefresh}`);

    if (isExpired && provider.refreshToken && provider.refreshTokenEncryptionIv) {
      // BLOCKING: Token expired, must refresh before returning
      this.logger.log(`Attempting to refresh Microsoft token (blocking) for provider ${provider.id}...`);

      try {
        let refreshToken = this.cryptoService.decrypt(
          provider.refreshToken,
          provider.refreshTokenEncryptionIv,
        );

        this.logger.debug(`Decrypted refresh token length: ${refreshToken.length}`);

        const refreshed = await this.refreshAccessToken(refreshToken);
        accessToken = refreshed.accessToken;

        this.logger.log(`✅ Token refreshed successfully (blocking), new expiry: ${refreshed.expiresAt}`);

        // Validate new token before saving
        if (!this.validateJWT(accessToken, 'refreshed access token')) {
          throw new Error('Refreshed token is not a valid JWT');
        }

        const encryptedAccess = this.cryptoService.encrypt(refreshed.accessToken);
        const updateData: any = {
          accessToken: encryptedAccess.encrypted,
          tokenEncryptionIv: encryptedAccess.iv,
          tokenExpiresAt: refreshed.expiresAt,
        };

        if (refreshed.refreshToken && refreshed.refreshToken.length >= 10) {
          this.logger.log('Microsoft issued a new refresh token. Updating stored credentials.');
          refreshToken = refreshed.refreshToken;
          const encryptedRefresh = this.cryptoService.encrypt(refreshToken);
          updateData.refreshToken = encryptedRefresh.encrypted;
          updateData.refreshTokenEncryptionIv = encryptedRefresh.iv;
        } else {
          this.logger.debug('No new refresh token provided during refresh operation.');
        }

        await this.prisma.providerConfig.update({
          where: { id: provider.id },
          data: updateData,
        });

        this.logger.log(`Token saved to database successfully`);
      } catch (error) {
        this.logger.error(
          `❌ Failed to refresh Microsoft access token for provider ${provider.id}: ${error instanceof Error ? error.message : error}`,
        );
        this.logger.error('Stack trace:', error instanceof Error ? error.stack : '');

        // T-0601: Propagate typed MicrosoftProviderError as-is for structured handling
        if (error instanceof MicrosoftAuthError || error instanceof MicrosoftRateLimitError) {
          throw error;
        }

        throw new UnauthorizedException(
          'Failed to refresh access token. Please reconnect this provider.'
        );
      }
    } else if (needsBackgroundRefresh && provider.refreshToken && provider.refreshTokenEncryptionIv) {
      // NON-BLOCKING: Trigger background refresh, return current valid token
      this.refreshTokenInBackground(provider).catch((error) => {
        this.logger.warn(
          `Background Microsoft token refresh failed for provider ${provider.id}: ${error instanceof Error ? error.message : error}`,
        );
      });
    }

    return { provider, accessToken };
  }

  /**
   * Refresh token in background (non-blocking)
   * Updates DB for next request, doesn't affect current request
   */
  private async refreshTokenInBackground(provider: {
    id: string;
    refreshToken: string | null;
    refreshTokenEncryptionIv: string | null;
  }) {
    if (!provider.refreshToken || !provider.refreshTokenEncryptionIv) {
      return;
    }

    this.logger.log(`Starting background token refresh for Microsoft provider ${provider.id}...`);

    let refreshToken = this.cryptoService.decrypt(
      provider.refreshToken,
      provider.refreshTokenEncryptionIv,
    );

    const refreshed = await this.refreshAccessToken(refreshToken);

    // Validate new token before saving
    if (!this.validateJWT(refreshed.accessToken, 'background refreshed access token')) {
      throw new Error('Background refreshed token is not a valid JWT');
    }

    const encryptedAccess = this.cryptoService.encrypt(refreshed.accessToken);
    const updateData: any = {
      accessToken: encryptedAccess.encrypted,
      tokenEncryptionIv: encryptedAccess.iv,
      tokenExpiresAt: refreshed.expiresAt,
    };

    if (refreshed.refreshToken && refreshed.refreshToken.length >= 10) {
      this.logger.log('Microsoft issued a new refresh token during background refresh.');
      refreshToken = refreshed.refreshToken;
      const encryptedRefresh = this.cryptoService.encrypt(refreshToken);
      updateData.refreshToken = encryptedRefresh.encrypted;
      updateData.refreshTokenEncryptionIv = encryptedRefresh.iv;
    }

    await this.prisma.providerConfig.update({
      where: { id: provider.id },
      data: updateData,
    });

    this.logger.log(`✅ Microsoft token refreshed (background) for provider ${provider.id}`);
  }

  /**
   * Test Microsoft Mail API - List mail folders
   */
  async testMailFolders(tenantId: string, providerId: string): Promise<any> {
    try {
      const { accessToken } = await this.getProviderWithTokens(tenantId, providerId);
      const graphClient = this.getGraphClient(accessToken);

      const response = await graphClient.api('/me/mailFolders').get();

      this.logger.log(`Retrieved ${response.value?.length || 0} mail folders`);

      return {
        success: true,
        folders: response.value?.map((folder: any) => ({
          id: folder.id,
          displayName: folder.displayName,
          totalItemCount: folder.totalItemCount,
          unreadItemCount: folder.unreadItemCount,
        })),
      };
    } catch (error: any) {
      this.logger.error('Failed to list mail folders:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Test Microsoft Mail API - List recent messages
   */
  async testMailMessages(tenantId: string, providerId: string): Promise<any> {
    try {
      const { accessToken } = await this.getProviderWithTokens(tenantId, providerId);
      const graphClient = this.getGraphClient(accessToken);

      const response = await graphClient
        .api('/me/messages')
        .top(10)
        .select('subject,from,receivedDateTime,bodyPreview,isRead')
        .orderby('receivedDateTime DESC')
        .get();

      this.logger.log(`Retrieved ${response.value?.length || 0} messages`);

      return {
        success: true,
        count: response.value?.length || 0,
        messages: response.value?.map((msg: any) => ({
          id: msg.id,
          subject: msg.subject,
          from: msg.from?.emailAddress?.address,
          fromName: msg.from?.emailAddress?.name,
          receivedDateTime: msg.receivedDateTime,
          bodyPreview: msg.bodyPreview,
          isRead: msg.isRead,
        })),
      };
    } catch (error: any) {
      this.logger.error('Failed to list mail messages:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Test Microsoft Calendar API - List calendars
   */
  async testCalendars(tenantId: string, providerId: string): Promise<any> {
    try {
      const { accessToken } = await this.getProviderWithTokens(tenantId, providerId);
      const graphClient = this.getGraphClient(accessToken);

      const response = await graphClient.api('/me/calendars').get();

      this.logger.log(`Retrieved ${response.value?.length || 0} calendars`);

      return {
        success: true,
        calendars: response.value?.map((cal: any) => ({
          id: cal.id,
          name: cal.name,
          color: cal.color,
          isDefaultCalendar: cal.isDefaultCalendar,
          canEdit: cal.canEdit,
        })),
      };
    } catch (error: any) {
      this.logger.error('Failed to list calendars:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Test Microsoft Calendar API - List upcoming events
   */
  async testCalendarEvents(tenantId: string, providerId: string): Promise<any> {
    try {
      const { accessToken } = await this.getProviderWithTokens(tenantId, providerId);
      const graphClient = this.getGraphClient(accessToken);

      const startDateTime = new Date().toISOString();
      const endDateTime = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // Next 30 days

      const response = await graphClient
        .api('/me/calendar/calendarView')
        .query({
          startDateTime,
          endDateTime,
          $top: 10,
          $orderby: 'start/dateTime',
        })
        .get();

      this.logger.log(`Retrieved ${response.value?.length || 0} upcoming events`);

      return {
        success: true,
        events: response.value?.map((event: any) => ({
          id: event.id,
          subject: event.subject,
          start: event.start,
          end: event.end,
          location: event.location?.displayName,
          isAllDay: event.isAllDay,
          attendees: event.attendees?.map((a: any) => ({
            email: a.emailAddress?.address,
            name: a.emailAddress?.name,
            status: a.status?.response,
          })),
        })),
      };
    } catch (error: any) {
      this.logger.error('Failed to list calendar events:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Test Microsoft Contacts API - List contacts
   */
  async testContacts(tenantId: string, providerId: string): Promise<any> {
    try {
      const { accessToken } = await this.getProviderWithTokens(tenantId, providerId);
      const graphClient = this.getGraphClient(accessToken);

      const response = await graphClient
        .api('/me/contacts')
        .top(10)
        .select('displayName,emailAddresses,mobilePhone,businessPhones')
        .get();

      this.logger.log(`Retrieved ${response.value?.length || 0} contacts`);

      return {
        success: true,
        contacts: response.value?.map((contact: any) => ({
          id: contact.id,
          name: contact.displayName,
          emails: contact.emailAddresses?.map((e: any) => e.address),
          mobilePhone: contact.mobilePhone,
          businessPhones: contact.businessPhones,
        })),
      };
    } catch (error: any) {
      this.logger.error('Failed to list contacts:', error);
      return { success: false, error: error.message };
    }
  }
}
