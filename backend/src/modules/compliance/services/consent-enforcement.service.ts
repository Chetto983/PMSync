import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping/tenant-context';

/**
 * Consent enforcement service (CONSENT-01)
 *
 * Provides fast consent checks for use by guards and services.
 * Queries the latest consent record for a user+feature pair.
 *
 * NOTE: Uses withoutTenantScopingAsync because ConsentGuard runs as APP_GUARD
 * BEFORE CorrelationInterceptor sets tenant context in AsyncLocalStorage.
 * The tenantId is explicitly provided in the where clause, so scoping is safe.
 */
@Injectable()
export class ConsentEnforcementService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if a user has granted consent for a specific feature.
   * Returns false if no consent record exists (default deny).
   */
  async hasConsent(userId: string, tenantId: string, feature: string): Promise<boolean> {
    const record = await withoutTenantScopingAsync(() =>
      this.prisma.userConsent.findFirst({
        where: { userId, tenantId, feature },
        orderBy: { createdAt: 'desc' },
        select: { granted: true },
      }),
    );

    return record?.granted ?? false;
  }
}
