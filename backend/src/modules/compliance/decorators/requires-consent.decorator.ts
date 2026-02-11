import { SetMetadata } from '@nestjs/common';

export const REQUIRED_CONSENT = 'requiredConsent';

/**
 * Decorator that marks a route handler as requiring user consent for a specific feature.
 * Used with ConsentGuard to block processing when consent is not granted.
 *
 * @example
 * ```ts
 * @RequiresConsent('ai_smart_replies')
 * @Get('smart-reply')
 * getSmartReply() { ... }
 * ```
 */
export const RequiresConsent = (feature: string) => SetMetadata(REQUIRED_CONSENT, feature);
