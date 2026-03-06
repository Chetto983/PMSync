import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { fromNodeHeaders } from 'better-auth/node';
import { BETTER_AUTH } from './better-auth.module';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Global guard that validates better-auth session cookies.
 *
 * Replaces per-controller JwtAuthGuard with a single global APP_GUARD
 * backed by DB sessions (no JWT). Registered as APP_GUARD in AppModule.
 *
 * NEST-04 note: No bodyParser changes needed in NestJS. This server is
 * a session consumer only -- it never receives auth mutation POST bodies.
 * All auth mutations (login, register, etc.) are handled by the Next.js
 * better-auth provider on port 3001.
 */
@Injectable()
export class BetterAuthGuard implements CanActivate {
  constructor(
    @Inject(BETTER_AUTH) private readonly auth: any,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    // Validate session via better-auth
    const result = await this.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });

    if (!result) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    const { session, user } = result;

    // Check if account is active
    if (user.isActive === false) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Map to backward-compatible request.user shape
    request.user = {
      id: user.id,
      userId: user.id, // backward compat: many services use userId
      tenantId: user.tenantId,
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      role: user.role ?? 'member',
      sessionId: session.id,
    };

    return true;
  }
}
