import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Consent enforcement service (CONSENT-01)
 *
 * Provides fast consent checks for use by guards and services.
 * Queries the latest consent record for a user+feature pair.
 */
@Injectable()
export class ConsentEnforcementService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if a user has granted consent for a specific feature.
   * Returns false if no consent record exists (default deny).
   */
  async hasConsent(userId: string, tenantId: string, feature: string): Promise<boolean> {
    const record = await this.prisma.userConsent.findFirst({
      where: { userId, tenantId, feature },
      orderBy: { createdAt: 'desc' },
      select: { granted: true },
    });

    return record?.granted ?? false;
  }
}
