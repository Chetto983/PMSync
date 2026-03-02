import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_CONSENT } from '../decorators/requires-consent.decorator';
import { ConsentEnforcementService } from '../services/consent-enforcement.service';
import { AuthenticatedRequest } from '../../../common/types/request.types';

/**
 * Guard that blocks requests when user has not granted consent for a feature.
 * Applied via @RequiresConsent('feature_id') decorator on route handlers.
 *
 * NOTE: This guard is registered as both APP_GUARD (global) and controller-level.
 * When running as global guard, request.user may not yet be set (JwtAuthGuard
 * hasn't run). In that case we skip — the controller-level instance will
 * re-check after authentication.
 *
 * Follows the same pattern as LegalAcceptanceGuard for unauthenticated requests.
 */
@Injectable()
export class ConsentGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly consentEnforcementService: ConsentEnforcementService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.get<string>(REQUIRED_CONSENT, context.getHandler());
    if (!feature) {
      // No @RequiresConsent decorator on this handler, allow
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // When running as APP_GUARD (global), request.user is not yet set because
    // JwtAuthGuard hasn't executed. Skip gracefully — the controller-level
    // ConsentGuard will enforce after authentication.
    if (!request.user) {
      return true;
    }

    const userId = request.user.userId ?? request.user.id;
    const tenantId = request.user.tenantId;

    if (!userId || !tenantId) {
      throw new ForbiddenException('Authentication required for consent check');
    }

    const hasConsent = await this.consentEnforcementService.hasConsent(userId, tenantId, feature);

    if (!hasConsent) {
      throw new ForbiddenException(`Consent required for feature: ${feature}`);
    }

    return true;
  }
}
