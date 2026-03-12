import { Controller, Get, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from './public.decorator';
import { generateCsrfToken } from '../middleware/csrf.middleware';

/**
 * CSRF Token Controller (SEC-04)
 *
 * Serves the CSRF token via GET /api/v1/auth/csrf-token.
 * The generateCsrfToken function from csrf-csrf sets the HMAC-signed
 * cookie and returns the token value for the X-CSRF-Token header.
 *
 * @Public() — must be accessible without session (pre-auth flows need CSRF too)
 */
@Public()
@ApiTags('Auth')
@Controller('auth')
export class CsrfTokenController {
  @Get('csrf-token')
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  @ApiOperation({ summary: 'Get CSRF token for double-submit cookie protection' })
  @ApiResponse({ status: 200, description: 'Returns CSRF token' })
  getCsrfToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const csrfToken = generateCsrfToken(req, res);
    return { csrfToken };
  }
}
