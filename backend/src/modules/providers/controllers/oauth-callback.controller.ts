import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { getConfiguration } from '../../../config/configuration';
import { Public } from '../../../common/auth/public.decorator';

/**
 * OAuth2 callback controller
 * Handles OAuth2 callbacks from Google and Microsoft
 * These endpoints are called by the OAuth provider after user authorization
 */
@ApiTags('OAuth Callbacks')
@Public()
@Controller('auth')
export class OAuthCallbackController {
  private config = getConfiguration();

  private getFrontendUrl(): string {
    const envFrontend = process.env.FRONTEND_URL;

    if (envFrontend) {
      return envFrontend;
    }

    const nonApiOrigin = this.config.api.corsOrigins.find(
      (origin) =>
        origin &&
        !origin.includes(this.config.api.host) &&
        !origin.includes(`${this.config.api.port}`) &&
        !origin.includes('localhost:3000'),
    );

    return nonApiOrigin || 'http://localhost:3001';
  }

  @Get('gmail/callback')
  @ApiOperation({ summary: 'OAuth2 callback for Google (Gmail)' })
  @ApiQuery({ name: 'code', required: true, description: 'Authorization code from Google' })
  @ApiQuery({ name: 'state', required: false, description: 'State parameter for CSRF protection' })
  @ApiResponse({ status: 302, description: 'Redirects to frontend with authorization code' })
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    const frontendUrl = this.getFrontendUrl();

    // If there was an error during OAuth flow
    if (error) {
      return res.redirect(
        `${frontendUrl}/dashboard/settings?section=accounts&error=${encodeURIComponent(error)}&provider=google`,
      );
    }

    // If no code was provided
    if (!code) {
      return res.redirect(
        `${frontendUrl}/dashboard/settings?section=accounts&error=no_code&provider=google`,
      );
    }

    // Redirect to frontend OAuth callback page
    // This page will handle the connection and then redirect to settings
    return res.redirect(
      `${frontendUrl}/auth/oauth-callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state || '')}&provider=google`,
    );
  }

  @Get('microsoft/callback')
  @ApiOperation({ summary: 'OAuth2 callback for Microsoft' })
  @ApiQuery({ name: 'code', required: true, description: 'Authorization code from Microsoft' })
  @ApiQuery({ name: 'state', required: false, description: 'State parameter for CSRF protection' })
  @ApiResponse({ status: 302, description: 'Redirects to frontend with authorization code' })
  async microsoftCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
    @Res() res: Response,
  ) {
    const frontendUrl = this.getFrontendUrl();

    // If there was an error during OAuth flow
    if (error) {
      const errorMsg = errorDescription || error;
      return res.redirect(
        `${frontendUrl}/dashboard/settings?section=accounts&error=${encodeURIComponent(errorMsg)}&provider=microsoft`,
      );
    }

    // If no code was provided
    if (!code) {
      return res.redirect(
        `${frontendUrl}/dashboard/settings?section=accounts&error=no_code&provider=microsoft`,
      );
    }

    // Redirect to frontend OAuth callback page
    // This page will handle the connection and then redirect to settings
    return res.redirect(
      `${frontendUrl}/auth/oauth-callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state || '')}&provider=microsoft`,
    );
  }
}
