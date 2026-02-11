import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConsentStateDto, ConsentHistoryDto } from '../dto/consent.dto';
import {
  CONSENT_FEATURES,
  CURRENT_CONSENT_VERSION,
  FEATURE_TO_PREF_MAP,
} from '../consent.constants';

/**
 * Consent management service (CONSENT-01)
 *
 * Manages GDPR consent with append-only versioned records.
 * Every consent change creates a new immutable record and syncs
 * the current state to UserPreferences for fast runtime checks.
 */
@Injectable()
export class ConsentService {
  private readonly logger = new Logger(ConsentService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get current consent state for all features.
   * Returns each feature with its latest consent status.
   */
  async getCurrentConsents(userId: string, tenantId: string): Promise<ConsentStateDto[]> {
    // Get the latest consent record for each feature
    const latestConsents = await this.prisma.userConsent.findMany({
      where: { userId, tenantId },
      orderBy: { createdAt: 'desc' },
      distinct: ['feature'],
    });

    // Build a lookup map: feature -> latest consent record
    const consentMap = new Map(latestConsents.map((c) => [c.feature, c]));

    // Map all known features to their consent state
    return CONSENT_FEATURES.map((feature) => {
      const record = consentMap.get(feature.id);
      return {
        feature: feature.id,
        label: feature.label,
        description: feature.description,
        granted: record?.granted ?? false,
        lastUpdated: record?.createdAt ?? null,
        version: record?.version ?? null,
        required: feature.required,
      };
    });
  }

  /**
   * Update consent for a specific feature.
   * Creates an immutable record and syncs to UserPreferences.
   */
  async updateConsent(
    userId: string,
    tenantId: string,
    feature: string,
    granted: boolean,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<ConsentStateDto> {
    // Validate feature exists
    const featureDef = CONSENT_FEATURES.find((f) => f.id === feature);
    if (!featureDef) {
      throw new BadRequestException(`Unknown consent feature: ${feature}`);
    }

    // Create immutable consent record
    const record = await this.prisma.userConsent.create({
      data: {
        userId,
        tenantId,
        feature,
        granted,
        version: CURRENT_CONSENT_VERSION,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      },
    });

    // Sync to UserPreferences for fast runtime checks
    await this.syncToPreferences(userId, feature, granted);

    this.logger.log(
      `Consent updated: user=${userId} feature=${feature} granted=${granted} version=${CURRENT_CONSENT_VERSION}`,
    );

    return {
      feature: featureDef.id,
      label: featureDef.label,
      description: featureDef.description,
      granted: record.granted,
      lastUpdated: record.createdAt,
      version: record.version,
      required: featureDef.required,
    };
  }

  /**
   * Get consent change history, optionally filtered by feature.
   * Returns the last 50 records in descending order.
   */
  async getConsentHistory(
    userId: string,
    tenantId: string,
    feature?: string,
  ): Promise<ConsentHistoryDto[]> {
    const where: { userId: string; tenantId: string; feature?: string } = {
      userId,
      tenantId,
    };
    if (feature) {
      where.feature = feature;
    }

    const records = await this.prisma.userConsent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return records.map((r) => ({
      id: r.id,
      feature: r.feature,
      granted: r.granted,
      version: r.version,
      createdAt: r.createdAt,
      ipAddress: r.ipAddress,
    }));
  }

  /**
   * Sync consent state to UserPreferences for fast runtime checks.
   * Only AI features have corresponding UserPreferences columns.
   * Features without a mapping (e.g., email_analytics) are skipped.
   */
  private async syncToPreferences(
    userId: string,
    feature: string,
    granted: boolean,
  ): Promise<void> {
    const prefColumn = FEATURE_TO_PREF_MAP[feature];
    if (!prefColumn) {
      // Feature has no UserPreferences equivalent, skip silently
      return;
    }

    try {
      await this.prisma.userPreferences.update({
        where: { userId },
        data: { [prefColumn]: granted },
      });
    } catch (error) {
      // UserPreferences might not exist yet (new user) - log but don't fail
      this.logger.warn(
        `Failed to sync consent to UserPreferences for user=${userId} feature=${feature}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
