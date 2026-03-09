import { All, Controller, Inject, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { toNodeHandler } from 'better-auth/node';
import { Public } from './public.decorator';

/**
 * Injection token — must match the provider token in BetterAuthModule.
 * Duplicated here to avoid circular import with the module file.
 */
const BETTER_AUTH = 'BETTER_AUTH';

/**
 * Catch-all controller that forwards /api/auth/* requests
 * to the better-auth handler.
 *
 * @Public() — auth routes must be accessible without a session
 * (sign-up, sign-in, password reset, etc.)
 */
@Public()
@Controller('api/auth')
export class BetterAuthController {
  private handler: ReturnType<typeof toNodeHandler>;

  constructor(@Inject(BETTER_AUTH) auth: any) {
    this.handler = toNodeHandler(auth.handler);
  }

  @All('*')
  handleAuth(@Req() req: Request, @Res() res: Response) {
    return this.handler(req, res);
  }
}
