import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SKIP_LEGAL_CHECK } from '../decorators/skip-legal-check.decorator';
import { LegalAcceptanceService } from '../services/legal-acceptance.service';
import { AuthenticatedRequest } from '../../../common/types/request.types';

/**
 * Guard that blocks requests when user has not accepted the current
 * Terms of Service and Privacy Policy versions.
 *
 * Can be bypassed with @SkipLegalCheck() decorator on specific handlers.
 * Follows the same Reflector + CanActivate pattern as ConsentGuard.
 */
@Injectable()
export class LegalAcceptanceGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly legalAcceptanceService: LegalAcceptanceService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked to skip legal check
    const skipLegal = this.reflector.getAllAndOverride<boolean>(SKIP_LEGAL_CHECK, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipLegal) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.userId ?? request.user?.id;
    const tenantId = request.user?.tenantId;

    if (!userId || !tenantId) {
      throw new ForbiddenException('Authentication required for legal acceptance check');
    }

    const hasAccepted = await this.legalAcceptanceService.hasAcceptedCurrentVersions(
      userId,
      tenantId,
    );

    if (!hasAccepted) {
      throw new ForbiddenException(
        'You must accept the current Terms of Service and Privacy Policy',
      );
    }

    return true;
  }
}
