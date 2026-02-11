import { SetMetadata } from '@nestjs/common';

export const SKIP_LEGAL_CHECK = 'skipLegalCheck';

/**
 * Decorator that marks a route handler as exempt from LegalAcceptanceGuard.
 * Use on endpoints that must remain accessible before legal acceptance
 * (e.g., the acceptance endpoint itself, auth endpoints, status checks).
 *
 * @example
 * ```ts
 * @SkipLegalCheck()
 * @Get('status')
 * getStatus() { ... }
 * ```
 */
export const SkipLegalCheck = () => SetMetadata(SKIP_LEGAL_CHECK, true);
