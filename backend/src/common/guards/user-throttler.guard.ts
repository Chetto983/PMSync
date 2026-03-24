import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { RATE_TIER_KEY, RateTier } from '../decorators/rate-tier.decorator';

/**
 * Tier-aware ThrottlerGuard that applies exactly ONE rate limit tier per request.
 *
 * Tier selection logic:
 * 1. If @RateTier decorator is present, use that tier
 * 2. Otherwise auto-assign: GET/HEAD/OPTIONS -> 'read', everything else -> 'safe-write'
 *
 * This prevents false 429s from the default NestJS behavior of checking ALL tiers
 * on every request. A GET should only count against the read tier (300/min),
 * not also against safe-write/destructive-write/send.
 *
 * Also uses userId for authenticated requests instead of IP address,
 * preventing users behind shared NAT/VPN/proxy from exhausting each other's limits.
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

  /**
   * Override canActivate to filter throttlers to a single tier before
   * delegating to the parent's per-throttler loop.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Preserve existing skip logic (health, metrics)
    if (await this.shouldSkip(context)) {
      return true;
    }

    const handler = context.getHandler();
    const classRef = context.getClass();

    // Determine which single tier applies to this request
    const decoratorTier = this.reflector.getAllAndOverride<RateTier>(
      RATE_TIER_KEY,
      [handler, classRef],
    );

    let tierName: string;
    if (decoratorTier) {
      tierName = decoratorTier;
    } else {
      const req = context
        .switchToHttp()
        .getRequest<{ method?: string }>();
      const method = req.method || 'GET';
      tierName =
        method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
          ? 'read'
          : 'safe-write';
    }

    // Filter to only the matching tier, then delegate to parent
    const allThrottlers = this.throttlers;
    const matchingThrottlers = allThrottlers.filter(
      (t) => t.name === tierName,
    );

    if (matchingThrottlers.length === 0) {
      // No matching tier config -- allow request (fail-open)
      return true;
    }

    // Temporarily swap throttlers to only the matching tier
    this.throttlers = matchingThrottlers;
    try {
      return await super.canActivate(context);
    } finally {
      this.throttlers = allThrottlers;
    }
  }
}
