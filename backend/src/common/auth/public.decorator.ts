import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route or controller as public, skipping BetterAuthGuard validation.
 * Use on health checks, webhooks, OAuth callbacks, and login/register routes.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
