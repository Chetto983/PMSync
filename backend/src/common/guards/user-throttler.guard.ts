import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Custom ThrottlerGuard that uses userId for authenticated requests
 * instead of IP address. This prevents users behind shared NAT/VPN/proxy
 * from exhausting each other's rate limits.
 *
 * Falls back to IP for unauthenticated requests (login, register, etc.).
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    // Use userId if available (authenticated request)
    const user = req['user'] as { id?: string } | undefined;
    if (user?.id) {
      return `user:${user.id}`;
    }

    // Fall back to IP for unauthenticated requests
    return (req['ip'] as string) || 'unknown';
  }

  /**
   * Skip throttling for health/metrics endpoints
   */
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ url?: string }>();
    const url = request?.url || '';

    // Skip internal endpoints
    if (url.startsWith('/health') || url.startsWith('/metrics')) {
      return true;
    }

    return false;
  }
}
