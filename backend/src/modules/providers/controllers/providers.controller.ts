import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../auth/guards/tenant.guard';
import { ProviderConfigService } from '../services/provider-config.service';
import { GoogleOAuthService } from '../services/google-oauth.service';
import { MicrosoftOAuthService } from '../services/microsoft-oauth.service';
import { OAuthStateService } from '../services/oauth-state.service';
import {
  ConnectGoogleProviderDto,
  ConnectMicrosoftProviderDto,
  ConnectGenericProviderDto,
  GoogleOAuthUrlDto,
  MicrosoftOAuthUrlDto,
  ProviderConfigResponseDto,
  OAuthUrlResponseDto,
} from '../dto';

@ApiTags('Providers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('providers')
export class ProvidersController {
  constructor(
    private readonly providerConfigService: ProviderConfigService,
    private readonly googleOAuth: GoogleOAuthService,
    private readonly microsoftOAuth: MicrosoftOAuthService,
    private readonly oauthStateService: OAuthStateService,
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

    // Create secure state with PKCE using OAuthStateService
    const { state, pkce } = await this.oauthStateService.createState('google', {
      userId,
      tenantId,
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

    // Create secure state with PKCE using OAuthStateService
    const { state, pkce } = await this.oauthStateService.createState('microsoft', {
      userId,
      tenantId,
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

  // ========== COMMON OPERATIONS ==========

  @Get()
  @SkipThrottle()
  @ApiOperation({ summary: 'Get all provider configs' })
  @ApiResponse({ status: 200, type: [ProviderConfigResponseDto] })
  async getProviders(@Request() req: any): Promise<ProviderConfigResponseDto[]> {
    const { tenantId } = req.user;
    return this.providerConfigService.getProviderConfigs(tenantId);
  }

  @Get(':id')
  @SkipThrottle()
  @ApiOperation({ summary: 'Get a specific provider config' })
  @ApiResponse({ status: 200, type: ProviderConfigResponseDto })
  async getProvider(
    @Request() req: any,
    @Param('id') id: string,
  ): Promise<ProviderConfigResponseDto> {
    const { tenantId } = req.user;
    return this.providerConfigService.getProviderConfig(tenantId, id);
  }

  @Get(':id/aliases')
  @SkipThrottle()
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
  @SkipThrottle()
  @ApiOperation({ summary: 'Test Gmail API - List labels' })
  @ApiResponse({ status: 200, description: 'Returns Gmail labels' })
  async testGmailLabels(@Request() req: any, @Param('id') id: string): Promise<any> {
    const { tenantId } = req.user;
    return this.googleOAuth.testGmailLabels(tenantId, id);
  }

  @Get(':id/test/gmail-messages')
  @SkipThrottle()
  @ApiOperation({ summary: 'Test Gmail API - List recent messages' })
  @ApiResponse({ status: 200, description: 'Returns recent Gmail messages' })
  async testGmailMessages(@Request() req: any, @Param('id') id: string): Promise<any> {
    const { tenantId } = req.user;
    return this.googleOAuth.testGmailMessages(tenantId, id);
  }

  @Get(':id/test/calendars')
  @SkipThrottle()
  @ApiOperation({ summary: 'Test Google Calendar API - List calendars' })
  @ApiResponse({ status: 200, description: 'Returns Google calendars' })
  async testCalendars(@Request() req: any, @Param('id') id: string): Promise<any> {
    const { tenantId } = req.user;
    return this.googleOAuth.testCalendars(tenantId, id);
  }

  @Get(':id/test/calendar-events')
  @SkipThrottle()
  @ApiOperation({ summary: 'Test Google Calendar API - List upcoming events' })
  @ApiResponse({ status: 200, description: 'Returns upcoming calendar events' })
  async testCalendarEvents(@Request() req: any, @Param('id') id: string): Promise<any> {
    const { tenantId } = req.user;
    return this.googleOAuth.testCalendarEvents(tenantId, id);
  }

  @Get(':id/test/contacts')
  @SkipThrottle()
  @ApiOperation({ summary: 'Test Google People API - List contacts' })
  @ApiResponse({ status: 200, description: 'Returns Google contacts' })
  async testContacts(@Request() req: any, @Param('id') id: string): Promise<any> {
    const { tenantId } = req.user;
    return this.googleOAuth.testContacts(tenantId, id);
  }

  // ========== MICROSOFT TEST ENDPOINTS ==========

  @Get(':id/test/mail-folders')
  @SkipThrottle()
  @ApiOperation({ summary: 'Test Microsoft Mail API - List mail folders' })
  @ApiResponse({ status: 200, description: 'Returns mail folders' })
  async testMailFolders(@Request() req: any, @Param('id') id: string): Promise<any> {
    const { tenantId } = req.user;
    return this.microsoftOAuth.testMailFolders(tenantId, id);
  }

  @Get(':id/test/mail-messages')
  @SkipThrottle()
  @ApiOperation({ summary: 'Test Microsoft Mail API - List recent messages' })
  @ApiResponse({ status: 200, description: 'Returns recent mail messages' })
  async testMailMessages(@Request() req: any, @Param('id') id: string): Promise<any> {
    const { tenantId } = req.user;
    return this.microsoftOAuth.testMailMessages(tenantId, id);
  }

  @Get(':id/test/microsoft-calendars')
  @SkipThrottle()
  @ApiOperation({ summary: 'Test Microsoft Calendar API - List calendars' })
  @ApiResponse({ status: 200, description: 'Returns Microsoft calendars' })
  async testMicrosoftCalendars(@Request() req: any, @Param('id') id: string): Promise<any> {
    const { tenantId } = req.user;
    return this.microsoftOAuth.testCalendars(tenantId, id);
  }

  @Get(':id/test/microsoft-calendar-events')
  @SkipThrottle()
  @ApiOperation({ summary: 'Test Microsoft Calendar API - List upcoming events' })
  @ApiResponse({ status: 200, description: 'Returns upcoming calendar events' })
  async testMicrosoftCalendarEvents(@Request() req: any, @Param('id') id: string): Promise<any> {
    const { tenantId } = req.user;
    return this.microsoftOAuth.testCalendarEvents(tenantId, id);
  }

  @Get(':id/test/microsoft-contacts')
  @SkipThrottle()
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
