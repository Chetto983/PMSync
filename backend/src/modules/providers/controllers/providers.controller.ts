import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { ProviderConfigService } from '../services/provider-config.service';
import { GoogleOAuthService } from '../services/google-oauth.service';
import { MicrosoftOAuthService } from '../services/microsoft-oauth.service';
import { OAuthStateService } from '../services/oauth-state.service';
import {
  ConnectGoogleProviderDto,
  ConnectMicrosoftProviderDto,
  ConnectGenericProviderDto,
  TestImapCredentialsDto,
  GoogleOAuthUrlDto,
  MicrosoftOAuthUrlDto,
  ProviderConfigResponseDto,
  OAuthUrlResponseDto,
  UpdateProviderDto,
} from '../dto';
import { ImapService } from '../services/imap.service';

@ApiTags('Providers')
@ApiBearerAuth()
@UseGuards(TenantGuard, RolesGuard)
@Controller('providers')
export class ProvidersController {
  constructor(
    private readonly providerConfigService: ProviderConfigService,
    private readonly googleOAuth: GoogleOAuthService,
    private readonly microsoftOAuth: MicrosoftOAuthService,
    private readonly oauthStateService: OAuthStateService,
    private readonly imapService: ImapService,
  ) {}

  // ========== GOOGLE PROVIDER ==========

  @Post('google/auth-url')
  @ApiOperation({ summary: 'Get Google OAuth2 authorization URL with PKCE' })
  @ApiResponse({ status: 200, type: OAuthUrlResponseDto })
  async getGoogleAuthUrl(
    @Request() req: any,
    @Body() dto: GoogleOAuthUrlDto,
  ): Promise<OAuthUrlResponseDto> {
    const { tenantId, userId } = req.user;

    // Create secure state with PKCE — 'pl_' prefix distinguishes provider-link
    // callbacks from better-auth login callbacks at the shared redirect URI.
    const { state, pkce } = await this.oauthStateService.createState('google', {
      userId,
      tenantId,
      statePrefix: 'pl_',
    });

    // Generate auth URL with PKCE code_challenge
    const { authUrl } = this.googleOAuth.generateAuthUrl(dto.scopes, {
      state,
      codeChallenge: pkce.codeChallenge,
      codeChallengeMethod: pkce.codeChallengeMethod,
    });

    return { authUrl, state };
  }

  @Post('google/connect')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Connect Google provider (Gmail + Calendar)' })
  @ApiResponse({ status: 201, type: ProviderConfigResponseDto })
  async connectGoogle(
    @Request() req: any,
    @Body() dto: ConnectGoogleProviderDto,
  ): Promise<ProviderConfigResponseDto> {
    const { tenantId, userId } = req.user;

    // Validate state and get PKCE code_verifier if state is provided
    let codeVerifier: string | undefined;
    if (dto.state) {
      const stateData = await this.oauthStateService.validateState(dto.state, 'google');
      codeVerifier = stateData.codeVerifier;
    }

    return this.providerConfigService.connectGoogleProvider(tenantId, userId, dto, codeVerifier);
  }

  // ========== MICROSOFT PROVIDER ==========

  @Post('microsoft/auth-url')
  @ApiOperation({ summary: 'Get Microsoft OAuth2 authorization URL with PKCE' })
  @ApiResponse({ status: 200, type: OAuthUrlResponseDto })
  async getMicrosoftAuthUrl(
    @Request() req: any,
    @Body() dto: MicrosoftOAuthUrlDto,
  ): Promise<OAuthUrlResponseDto> {
    const { tenantId, userId } = req.user;

    // Create secure state with PKCE — 'pl_' prefix distinguishes provider-link
    // callbacks from better-auth login callbacks at the shared redirect URI.
    const { state, pkce } = await this.oauthStateService.createState('microsoft', {
      userId,
      tenantId,
      statePrefix: 'pl_',
    });

    // Generate auth URL with PKCE code_challenge
    const { authUrl } = this.microsoftOAuth.generateAuthUrl(dto.scopes, {
      state,
      codeChallenge: pkce.codeChallenge,
      codeChallengeMethod: pkce.codeChallengeMethod,
    });

    return { authUrl, state };
  }

  @Post('microsoft/connect')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Connect Microsoft provider (Outlook + Graph API)' })
  @ApiResponse({ status: 201, type: ProviderConfigResponseDto })
  async connectMicrosoft(
    @Request() req: any,
    @Body() dto: ConnectMicrosoftProviderDto,
  ): Promise<ProviderConfigResponseDto> {
    const { tenantId, userId } = req.user;

    // Validate state and get PKCE code_verifier if state is provided
    let codeVerifier: string | undefined;
    if (dto.state) {
      const stateData = await this.oauthStateService.validateState(dto.state, 'microsoft');
      codeVerifier = stateData.codeVerifier;
    }

    return this.providerConfigService.connectMicrosoftProvider(tenantId, userId, dto, codeVerifier);
  }

  // ========== AUTO-CONNECT FROM SOCIAL LOGIN ==========

  @Post('auto-connect-social')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Auto-connect email provider from social login tokens',
    description:
      'Resolves tokens from the linked Better Auth social account and creates a ProviderConfig. ' +
      'Eliminates the need for a second OAuth flow during onboarding.',
  })
  @ApiResponse({ status: 200, type: ProviderConfigResponseDto })
  @ApiResponse({ status: 404, description: 'No social account found' })
  async autoConnectSocial(
    @Request() req: any,
  ): Promise<ProviderConfigResponseDto | { connected: false; reason: string }> {
    const { tenantId, userId, email } = req.user;
    const result = await this.providerConfigService.autoConnectSocialProvider(
      tenantId,
      userId,
      email,
    );

    if (!result) {
      return { connected: false, reason: 'No social login account found with valid tokens' };
    }

    return result as unknown as ProviderConfigResponseDto;
  }

  // ========== GENERIC PROVIDER (IMAP/CalDAV) ==========

  @Post('generic/connect')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Connect generic provider (IMAP/SMTP + CalDAV/CardDAV)' })
  @ApiResponse({ status: 201, type: ProviderConfigResponseDto })
  async connectGeneric(
    @Request() req: any,
    @Body() dto: ConnectGenericProviderDto,
  ): Promise<ProviderConfigResponseDto> {
    const { tenantId, userId } = req.user;
    return this.providerConfigService.connectGenericProvider(tenantId, userId, dto);
  }

  @Post('generic/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test IMAP/SMTP credentials before creating provider' })
  @ApiResponse({
    status: 200,
    description: 'Connection test results',
    schema: {
      type: 'object',
      properties: {
        imap: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        smtp: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            skipped: { type: 'boolean' },
          },
        },
      },
    },
  })
  async testGenericCredentials(
    @Body() dto: TestImapCredentialsDto,
  ): Promise<{ imap: { success: boolean; message: string }; smtp: { success: boolean; message: string; skipped?: boolean } }> {
    // Test IMAP connection
    let imapResult: { success: boolean; message: string };
    try {
      const imapSuccess = await this.imapService.testConnection({
        host: dto.imapHost,
        port: dto.imapPort || 993,
        username: dto.imapUsername,
        password: dto.imapPassword,
        useTls: dto.imapUseTls !== false,
      });
      imapResult = {
        success: imapSuccess,
        message: imapSuccess ? 'IMAP connection successful' : 'IMAP connection failed',
      };
    } catch (error) {
      imapResult = {
        success: false,
        message: error instanceof Error ? error.message : 'IMAP connection failed',
      };
    }

    // Test SMTP connection if host provided
    let smtpResult: { success: boolean; message: string; skipped?: boolean };
    if (dto.smtpHost) {
      try {
        const smtpSuccess = await this.imapService.testSmtpConnection({
          host: dto.smtpHost,
          port: dto.smtpPort || 587,
          username: dto.smtpUsername || dto.imapUsername,
          password: dto.smtpPassword || dto.imapPassword,
          useTls: dto.smtpUseTls !== false,
        });
        smtpResult = {
          success: smtpSuccess,
          message: smtpSuccess ? 'SMTP connection successful' : 'SMTP connection failed',
        };
      } catch (error) {
        smtpResult = {
          success: false,
          message: error instanceof Error ? error.message : 'SMTP connection failed',
        };
      }
    } else {
      smtpResult = {
        success: true,
        message: 'SMTP test skipped (no host provided)',
        skipped: true,
      };
    }

    return { imap: imapResult, smtp: smtpResult };
  }

  // ========== COMMON OPERATIONS ==========

  @Get()
  @ApiOperation({ summary: 'Get all provider configs' })
  @ApiResponse({ status: 200, type: [ProviderConfigResponseDto] })
  async getProviders(@Request() req: any): Promise<ProviderConfigResponseDto[]> {
    const { tenantId } = req.user;
    return this.providerConfigService.getProviderConfigs(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific provider config' })
  @ApiResponse({ status: 200, type: ProviderConfigResponseDto })
  async getProvider(
    @Request() req: any,
    @Param('id') id: string,
  ): Promise<ProviderConfigResponseDto> {
    const { tenantId } = req.user;
    return this.providerConfigService.getProviderConfig(tenantId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update provider settings (displayName, scope, isDefault)' })
  @ApiResponse({ status: 200, type: ProviderConfigResponseDto })
  async updateProvider(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateProviderDto,
  ): Promise<ProviderConfigResponseDto> {
    const { tenantId } = req.user;
    return this.providerConfigService.updateProviderConfig(tenantId, id, dto);
  }

  @Get(':id/aliases')
  @ApiOperation({ summary: 'Get sender aliases for a provider' })
  @ApiResponse({ status: 200, description: 'List of aliases' })
  async getAliases(@Request() req: any, @Param('id') id: string) {
    const { tenantId } = req.user;
    return this.providerConfigService.getAliases(id, tenantId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a provider config' })
  @ApiResponse({ status: 204, description: 'Provider config deleted successfully' })
  async deleteProvider(@Request() req: any, @Param('id') id: string): Promise<void> {
    const { tenantId } = req.user;
    await this.providerConfigService.deleteProviderConfig(tenantId, id);
  }

  // ========== TEST ENDPOINTS ==========

  @Get(':id/test/gmail-labels')
  @ApiOperation({ summary: 'Test Gmail API - List labels' })
  @ApiResponse({ status: 200, description: 'Returns Gmail labels' })
  async testGmailLabels(@Request() req: any, @Param('id') id: string): Promise<any> {
    const { tenantId } = req.user;
    return this.googleOAuth.testGmailLabels(tenantId, id);
  }

  @Get(':id/test/gmail-messages')
  @ApiOperation({ summary: 'Test Gmail API - List recent messages' })
  @ApiResponse({ status: 200, description: 'Returns recent Gmail messages' })
  async testGmailMessages(@Request() req: any, @Param('id') id: string): Promise<any> {
    const { tenantId } = req.user;
    return this.googleOAuth.testGmailMessages(tenantId, id);
  }

  @Get(':id/test/calendars')
  @ApiOperation({ summary: 'Test Google Calendar API - List calendars' })
  @ApiResponse({ status: 200, description: 'Returns Google calendars' })
  async testCalendars(@Request() req: any, @Param('id') id: string): Promise<any> {
    const { tenantId } = req.user;
    return this.googleOAuth.testCalendars(tenantId, id);
  }

  @Get(':id/test/calendar-events')
  @ApiOperation({ summary: 'Test Google Calendar API - List upcoming events' })
  @ApiResponse({ status: 200, description: 'Returns upcoming calendar events' })
  async testCalendarEvents(@Request() req: any, @Param('id') id: string): Promise<any> {
    const { tenantId } = req.user;
    return this.googleOAuth.testCalendarEvents(tenantId, id);
  }

  @Get(':id/test/contacts')
  @ApiOperation({ summary: 'Test Google People API - List contacts' })
  @ApiResponse({ status: 200, description: 'Returns Google contacts' })
  async testContacts(@Request() req: any, @Param('id') id: string): Promise<any> {
    const { tenantId } = req.user;
    return this.googleOAuth.testContacts(tenantId, id);
  }

  // ========== MICROSOFT TEST ENDPOINTS ==========

  @Get(':id/test/mail-folders')
  @ApiOperation({ summary: 'Test Microsoft Mail API - List mail folders' })
  @ApiResponse({ status: 200, description: 'Returns mail folders' })
  async testMailFolders(@Request() req: any, @Param('id') id: string): Promise<any> {
    const { tenantId } = req.user;
    return this.microsoftOAuth.testMailFolders(tenantId, id);
  }

  @Get(':id/test/mail-messages')
  @ApiOperation({ summary: 'Test Microsoft Mail API - List recent messages' })
  @ApiResponse({ status: 200, description: 'Returns recent mail messages' })
  async testMailMessages(@Request() req: any, @Param('id') id: string): Promise<any> {
    const { tenantId } = req.user;
    return this.microsoftOAuth.testMailMessages(tenantId, id);
  }

  @Get(':id/test/microsoft-calendars')
  @ApiOperation({ summary: 'Test Microsoft Calendar API - List calendars' })
  @ApiResponse({ status: 200, description: 'Returns Microsoft calendars' })
  async testMicrosoftCalendars(@Request() req: any, @Param('id') id: string): Promise<any> {
    const { tenantId } = req.user;
    return this.microsoftOAuth.testCalendars(tenantId, id);
  }

  @Get(':id/test/microsoft-calendar-events')
  @ApiOperation({ summary: 'Test Microsoft Calendar API - List upcoming events' })
  @ApiResponse({ status: 200, description: 'Returns upcoming calendar events' })
  async testMicrosoftCalendarEvents(@Request() req: any, @Param('id') id: string): Promise<any> {
    const { tenantId } = req.user;
    return this.microsoftOAuth.testCalendarEvents(tenantId, id);
  }

  @Get(':id/test/microsoft-contacts')
  @ApiOperation({ summary: 'Test Microsoft Contacts API - List contacts' })
  @ApiResponse({ status: 200, description: 'Returns Microsoft contacts' })
  async testMicrosoftContacts(@Request() req: any, @Param('id') id: string): Promise<any> {
    const { tenantId } = req.user;
    return this.microsoftOAuth.testContacts(tenantId, id);
  }

  // ========== GENERIC IMAP TEST ENDPOINTS ==========

  @Get(':id/test/imap-connection')
  @ApiOperation({ summary: 'Test IMAP connection' })
  @ApiResponse({ status: 200, description: 'Test IMAP connection' })
  async testImapConnection(@Request() req: any, @Param('id') id: string): Promise<any> {
    const { tenantId } = req.user;
    return this.providerConfigService.testImapConnection(tenantId, id);
  }

  @Get(':id/test/imap-folders')
  @ApiOperation({ summary: 'Test IMAP - List folders' })
  @ApiResponse({ status: 200, description: 'Returns IMAP folders' })
  async testImapFolders(@Request() req: any, @Param('id') id: string): Promise<any> {
    const { tenantId } = req.user;
    return this.providerConfigService.testImapFolders(tenantId, id);
  }

  @Get(':id/test/imap-messages')
  @ApiOperation({ summary: 'Test IMAP - Fetch recent messages' })
  @ApiResponse({ status: 200, description: 'Returns recent IMAP messages' })
  async testImapMessages(@Request() req: any, @Param('id') id: string): Promise<any> {
    const { tenantId } = req.user;
    return this.providerConfigService.testImapMessages(tenantId, id);
  }

  @Get(':id/test/smtp-connection')
  @ApiOperation({ summary: 'Test SMTP connection' })
  @ApiResponse({ status: 200, description: 'Test SMTP connection' })
  async testSmtpConnection(@Request() req: any, @Param('id') id: string): Promise<any> {
    const { tenantId } = req.user;
    return this.providerConfigService.testSmtpConnection(tenantId, id);
  }
}
