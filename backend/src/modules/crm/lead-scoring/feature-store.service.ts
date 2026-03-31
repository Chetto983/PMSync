import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  EngagementFeatureService,
  EngagementFeatures,
} from './engagement-feature.service';
import {
  FirmographicFeatureService,
  FirmographicFeatures,
} from './firmographic-feature.service';
import {
  BehavioralFeatureService,
  BehavioralFeatures,
} from './behavioral-feature.service';

export interface ComputedFeatures {
  engagement: EngagementFeatures;
  firmographic: FirmographicFeatures;
  behavioral: BehavioralFeatures;
}

const RETENTION_DAYS = 90;

@Injectable()
export class FeatureStoreService {
  private readonly logger = new Logger(FeatureStoreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engagement: EngagementFeatureService,
    private readonly firmographic: FirmographicFeatureService,
    private readonly behavioral: BehavioralFeatureService,
  ) {}

  /**
   * Compute all features for a contact and persist to the feature store.
   */
  async computeAndStore(
    tenantId: string,
    contactId: string,
  ): Promise<ComputedFeatures> {
    const [engagementFeatures, firmographicFeatures, behavioralFeatures] =
      await Promise.all([
        this.engagement.extract(tenantId, contactId),
        this.firmographic.extract(tenantId, contactId),
        this.behavioral.extract(tenantId, contactId),
      ]);

    const features: ComputedFeatures = {
      engagement: engagementFeatures,
      firmographic: firmographicFeatures,
      behavioral: behavioralFeatures,
    };

    await this.prisma.leadFeatureStore.create({
      data: {
        tenantId,
        contactId,
        features: JSON.parse(JSON.stringify(features)),
        computedAt: new Date(),
      },
    });

    return features;
  }

  /**
   * Get the latest features for a contact from the store.
   */
  async getLatest(
    tenantId: string,
    contactId: string,
  ): Promise<ComputedFeatures | null> {
    const record = await this.prisma.leadFeatureStore.findFirst({
      where: { tenantId, contactId },
      orderBy: { computedAt: 'desc' },
    });

    if (!record) return null;
    return record.features as unknown as ComputedFeatures;
  }

  /**
   * Delete feature records older than RETENTION_DAYS.
   * Called by scheduled cleanup job.
   */
  async cleanupExpired(tenantId?: string): Promise<number> {
    const cutoff = new Date(
      Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    const where: { computedAt: { lt: Date }; tenantId?: string } = {
      computedAt: { lt: cutoff },
    };
    if (tenantId) {
      where.tenantId = tenantId;
    }

    const result = await this.prisma.leadFeatureStore.deleteMany({ where });
    this.logger.log(
      `Cleaned up ${result.count} expired feature records (cutoff: ${cutoff.toISOString()})`,
    );
    return result.count;
  }

  /**
   * Flatten ComputedFeatures into a numeric vector for ML model input.
   * Returns [featureNames[], featureValues[]] for consistent ordering.
   */
  static toFeatureVector(
    features: ComputedFeatures,
  ): { names: string[]; values: number[] } {
    const e = features.engagement;
    const f = features.firmographic;
    const b = features.behavioral;

    const names = [
      'eng_emails_sent',
      'eng_emails_received',
      'eng_total_interactions',
      'eng_avg_response_hours',
      'eng_replied_ratio',
      'eng_last_interaction_days',
      'eng_meeting_count',
      'eng_recency_score',
      'firm_has_account',
      'firm_company_size',
      'firm_has_industry',
      'firm_revenue_range',
      'firm_has_website',
      'firm_has_phone',
      'firm_has_address',
      'firm_deal_count',
      'firm_total_value',
      'beh_deal_count',
      'beh_open_deals',
      'beh_won_deals',
      'beh_lost_deals',
      'beh_avg_velocity_days',
      'beh_highest_stage_progress',
      'beh_last_recency_days',
      'beh_activity_30d',
      'beh_activity_90d',
      'beh_recent_deal_activity',
    ];

    const values = [
      e.emailsSent,
      e.emailsReceived,
      e.totalInteractions,
      e.avgResponseTimeHours ?? 0,
      e.repliedRatio,
      e.lastInteractionDaysAgo ?? 365,
      e.meetingCount,
      e.recentActivityScore,
      f.hasAccount ? 1 : 0,
      f.companySize,
      f.hasIndustry ? 1 : 0,
      f.revenueRange,
      f.hasWebsite ? 1 : 0,
      f.hasPhone ? 1 : 0,
      f.hasAddress ? 1 : 0,
      f.accountDealCount,
      f.accountTotalValue,
      b.dealCount,
      b.openDealCount,
      b.wonDealCount,
      b.lostDealCount,
      b.avgDealVelocityDays ?? 0,
      b.highestDealStageProgress,
      b.lastContactRecencyDays ?? 365,
      b.activityCount30d,
      b.activityCount90d,
      b.hasRecentDealActivity ? 1 : 0,
    ];

    return { names, values };
  }
}
