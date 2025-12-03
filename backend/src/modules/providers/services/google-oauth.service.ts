import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { randomBytes } from 'crypto';
import { getConfiguration } from '../../../config/configuration';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';

/**
 * PKCE options for enhanced OAuth security
 */
export interface PKCEOptions {
  state: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);
  private oauth2Client: OAuth2Client;
  private config = getConfiguration();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: CryptoService,
  ) {
    const { clientId, clientSecret, redirectUri } = this.config.oauth.gmail;

    this.oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);
  }

  /**
   * Generate Google OAuth2 authorization URL
   * Supports PKCE (Proof Key for Code Exchange) for enhanced security
   */
  generateAuthUrl(
    scopes?: string[],
    pkceOptions?: { state: string; codeChallenge: string; codeChallengeMethod: 'S256' },
  ): { authUrl: string; state: string } {
    const defaultScopes = [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://mail.google.com/',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/contacts',
    ];

    const requestedScopes = scopes || defaultScopes;

    // Use provided state or generate one (fallback for backward compatibility)
    const state = pkceOptions?.state || this.generateRandomState();

    const { redirectUri, clientId, clientSecret } = this.config.oauth.gmail;
    const tempClient = new OAuth2Client(clientId, clientSecret, redirectUri);

    // Build auth URL options
    const authUrlOptions: any = {
      access_type: 'offline',
      scope: requestedScopes,
      state,
      prompt: 'consent',
    };

    // Add PKCE if provided
    if (pkceOptions?.codeChallenge) {
      authUrlOptions.code_challenge = pkceOptions.codeChallenge;
      authUrlOptions.code_challenge_method = pkceOptions.codeChallengeMethod;
    }

    const authUrl = tempClient.generateAuthUrl(authUrlOptions);

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
      const { redirectUri, clientId, clientSecret } = this.config.oauth.gmail;
      const tempClient = new OAuth2Client(clientId, clientSecret, redirectUri);

      // Exchange code for tokens (with PKCE code_verifier if provided)
      const tokenOptions: any = { code: authorizationCode };
      if (codeVerifier) {
        tokenOptions.codeVerifier = codeVerifier;
      }
      const { tokens } = await tempClient.getToken(tokenOptions);

      if (!tokens.access_token) {
        throw new UnauthorizedException('Failed to obtain access token');
      }

      if (!tokens.refresh_token) {
        throw new UnauthorizedException('Failed to obtain refresh token. User may need to revoke access and reconnect.');
      }

      // Set credentials on temp client for verification
      tempClient.setCredentials(tokens);

      // Get email from ID token
      const ticket = await tempClient.verifyIdToken({
        idToken: tokens.id_token || '',
        audience: this.config.oauth.gmail.clientId,
      });
      const payload = ticket.getPayload();
      const email = payload?.email;

      if (!email) {
        throw new UnauthorizedException('Failed to retrieve user email from token');
      }

      // Calculate token expiration
      const expiresAt = tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : new Date(Date.now() + 3600 * 1000); // Default 1 hour

      this.logger.log(`Successfully exchanged code for tokens for ${email}`);

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        email,
      };
    } catch (error) {
      this.logger.error('Failed to exchange authorization code:', error);
      throw new UnauthorizedException('Invalid authorization code');
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    expiresAt: Date;
  }> {
    try {
      this.oauth2Client.setCredentials({ refresh_token: refreshToken });

      const { credentials } = await this.oauth2Client.refreshAccessToken();

      if (!credentials.access_token) {
        throw new UnauthorizedException('Failed to refresh access token');
      }

      const expiresAt = credentials.expiry_date
        ? new Date(credentials.expiry_date)
        : new Date(Date.now() + 3600 * 1000);

      this.logger.log('Successfully refreshed access token');

      return {
        accessToken: credentials.access_token,
        expiresAt,
      };
    } catch (error) {
      this.logger.error('Failed to refresh access token:', error);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Test Gmail API connection
   */
  async testGmailConnection(accessToken: string): Promise<boolean> {
    try {
      // Simple test: verify token is valid
      this.oauth2Client.setCredentials({ access_token: accessToken });
      const tokenInfo = await this.oauth2Client.getTokenInfo(accessToken);

      this.logger.log('Gmail API connection test successful');
      return !!tokenInfo.email;
    } catch (error) {
      this.logger.error('Gmail API connection test failed:', error);
      return false;
    }
  }

  /**
   * Test Google Calendar API connection
   */
  async testCalendarConnection(accessToken: string): Promise<boolean> {
    try {
      // Simple test: verify token is valid
      this.oauth2Client.setCredentials({ access_token: accessToken });
      const tokenInfo = await this.oauth2Client.getTokenInfo(accessToken);

      this.logger.log('Google Calendar API connection test successful');
      return !!tokenInfo.email;
    } catch (error) {
      this.logger.error('Google Calendar API connection test failed:', error);
      return false;
    }
  }

  /**
   * Generate random state for CSRF protection
   * Uses cryptographically secure random bytes
   */
  private generateRandomState(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Get provider config and decrypt tokens
   */
  private async getProviderWithTokens(tenantId: string, providerId: string) {
    const provider = await this.prisma.providerConfig.findFirst({
      where: { id: providerId, tenantId },
    });

    if (!provider) {
      throw new UnauthorizedException('Provider not found');
    }

    // Decrypt access token
    let accessToken = this.cryptoService.decrypt(
      provider.accessToken!,
      provider.tokenEncryptionIv!,
    );

    const needsRefresh =
      !provider.tokenExpiresAt ||
      provider.tokenExpiresAt.getTime() <= Date.now() + 60 * 1000;

    if (needsRefresh && provider.refreshToken && provider.refreshTokenEncryptionIv) {
      try {
        const refreshToken = this.cryptoService.decrypt(
          provider.refreshToken,
          provider.refreshTokenEncryptionIv,
        );

        const refreshed = await this.refreshAccessToken(refreshToken);
        accessToken = refreshed.accessToken;

        const encryptedAccess = this.cryptoService.encrypt(refreshed.accessToken);

        await this.prisma.providerConfig.update({
          where: { id: provider.id },
          data: {
            accessToken: encryptedAccess.encrypted,
            tokenEncryptionIv: encryptedAccess.iv,
            tokenExpiresAt: refreshed.expiresAt,
          },
        });
      } catch (error) {
        this.logger.warn(
          `Failed to refresh Google access token for provider ${provider.id}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    return { provider, accessToken };
  }

  /**
   * Test Gmail API - List labels
   */
  async testGmailLabels(tenantId: string, providerId: string): Promise<any> {
    try {
      const { accessToken } = await this.getProviderWithTokens(tenantId, providerId);

      const auth = new OAuth2Client();
      auth.setCredentials({ access_token: accessToken });

      const gmail = google.gmail({ version: 'v1', auth: auth as any });
      const response = await gmail.users.labels.list({ userId: 'me' });

      this.logger.log(`Retrieved ${response.data.labels?.length || 0} Gmail labels`);

      return {
        success: true,
        labels: response.data.labels?.map((label) => ({
          id: label.id,
          name: label.name,
          type: label.type,
        })),
      };
    } catch (error: any) {
      this.logger.error('Failed to list Gmail labels:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * List Gmail send-as identities (aliases)
   */
  async getSendAsAliases(tenantId: string, providerId: string): Promise<{ email: string; name?: string }[]> {
    try {
      const { accessToken } = await this.getProviderWithTokens(tenantId, providerId);
      const auth = new OAuth2Client();
      auth.setCredentials({ access_token: accessToken });

      const gmail = google.gmail({ version: 'v1', auth: auth as any });
      const response = await gmail.users.settings.sendAs.list({ userId: 'me' });
      const sendAs = response.data.sendAs || [];

      return sendAs
        .map((alias) => ({
          email: alias.sendAsEmail || '',
          name: alias.displayName || undefined,
        }))
        .filter((alias) => alias.email);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Failed to fetch send-as aliases from Gmail API for provider ${providerId}: ${errorMessage}. Falling back to provider email.`
      );

      // Fallback: return the primary provider email if Gmail API fails
      const provider = await this.prisma.providerConfig.findFirst({
        where: { id: providerId, tenantId },
        select: { email: true },
      });

      return provider?.email ? [{ email: provider.email }] : [];
    }
  }

  /**
   * Test Gmail API - List recent messages
   */
  async testGmailMessages(tenantId: string, providerId: string): Promise<any> {
    try {
      const { accessToken } = await this.getProviderWithTokens(tenantId, providerId);

      const auth = new OAuth2Client();
      auth.setCredentials({ access_token: accessToken });

      const gmail = google.gmail({ version: 'v1', auth: auth as any });
      const response = await gmail.users.messages.list({
        userId: 'me',
        maxResults: 10,
      });

      const messages = [];
      for (const msg of response.data.messages || []) {
        const message = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'metadata',
          metadataHeaders: ['From', 'To', 'Subject', 'Date'],
        });

        const headers: any = {};
        message.data.payload?.headers?.forEach((header) => {
          headers[header.name!] = header.value;
        });

        messages.push({
          id: message.data.id,
          threadId: message.data.threadId,
          snippet: message.data.snippet,
          from: headers['From'],
          to: headers['To'],
          subject: headers['Subject'],
          date: headers['Date'],
        });
      }

      this.logger.log(`Retrieved ${messages.length} Gmail messages`);

      return {
        success: true,
        count: messages.length,
        messages,
      };
    } catch (error: any) {
      this.logger.error('Failed to list Gmail messages:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Test Google Calendar API - List calendars
   */
  async testCalendars(tenantId: string, providerId: string): Promise<any> {
    try {
      const { accessToken } = await this.getProviderWithTokens(tenantId, providerId);

      const auth = new OAuth2Client();
      auth.setCredentials({ access_token: accessToken });

      const calendar = google.calendar({ version: 'v3', auth: auth as any });
      const response = await calendar.calendarList.list();

      this.logger.log(`Retrieved ${response.data.items?.length || 0} calendars`);

      return {
        success: true,
        calendars: response.data.items?.map((cal) => ({
          id: cal.id,
          summary: cal.summary,
          description: cal.description,
          timeZone: cal.timeZone,
          primary: cal.primary,
          accessRole: cal.accessRole,
        })),
      };
    } catch (error: any) {
      this.logger.error('Failed to list calendars:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Test Google Calendar API - List upcoming events
   */
  async testCalendarEvents(tenantId: string, providerId: string): Promise<any> {
    try {
      const { accessToken } = await this.getProviderWithTokens(tenantId, providerId);

      const auth = new OAuth2Client();
      auth.setCredentials({ access_token: accessToken });

      const calendar = google.calendar({ version: 'v3', auth: auth as any });
      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: new Date().toISOString(),
        maxResults: 10,
        singleEvents: true,
        orderBy: 'startTime',
      });

      this.logger.log(`Retrieved ${response.data.items?.length || 0} upcoming events`);

      return {
        success: true,
        events: response.data.items?.map((event) => ({
          id: event.id,
          summary: event.summary,
          description: event.description,
          start: event.start,
          end: event.end,
          location: event.location,
          attendees: event.attendees?.map((a) => ({ email: a.email, status: a.responseStatus })),
        })),
      };
    } catch (error: any) {
      this.logger.error('Failed to list calendar events:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Test Google People API - List contacts
   */
  async testContacts(tenantId: string, providerId: string): Promise<any> {
    try {
      const { accessToken } = await this.getProviderWithTokens(tenantId, providerId);

      const auth = new OAuth2Client();
      auth.setCredentials({ access_token: accessToken });

      const people = google.people({ version: 'v1', auth: auth as any });
      const response = await people.people.connections.list({
        resourceName: 'people/me',
        pageSize: 10,
        personFields: 'names,emailAddresses,phoneNumbers',
      });

      this.logger.log(`Retrieved ${response.data.connections?.length || 0} contacts`);

      return {
        success: true,
        contacts: response.data.connections?.map((person) => ({
          resourceName: person.resourceName,
          name: person.names?.[0]?.displayName,
          emails: person.emailAddresses?.map((e) => e.value),
          phones: person.phoneNumbers?.map((p) => p.value),
        })),
      };
    } catch (error: any) {
      this.logger.error('Failed to list contacts:', error);
      return { success: false, error: error.message };
    }
  }
}
