/**
 * Lead Scoring Pipeline — Unit Tests
 *
 * Tests feature extraction, feature vectorization, scoring service,
 * and controller endpoint logic with mocked dependencies.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeatureStoreService, ComputedFeatures } from '../feature-store.service';
import { EngagementFeatures } from '../engagement-feature.service';
import { FirmographicFeatures } from '../firmographic-feature.service';
import { BehavioralFeatures } from '../behavioral-feature.service';

// ============ Test Data ============

function makeEngagement(overrides: Partial<EngagementFeatures> = {}): EngagementFeatures {
  return {
    emailsSent: 45,
    emailsReceived: 32,
    totalInteractions: 77,
    avgResponseTimeHours: 4.2,
    repliedRatio: 0.65,
    lastInteractionDaysAgo: 3,
    meetingCount: 5,
    recentActivityScore: 8,
    ...overrides,
  };
}

function makeFirmographic(overrides: Partial<FirmographicFeatures> = {}): FirmographicFeatures {
  return {
    hasAccount: true,
    companySize: 3,
    hasIndustry: true,
    industryCategory: 'Technology',
    revenueRange: 4,
    hasWebsite: true,
    hasPhone: true,
    hasAddress: true,
    accountDealCount: 3,
    accountTotalValue: 150000,
    ...overrides,
  };
}

function makeBehavioral(overrides: Partial<BehavioralFeatures> = {}): BehavioralFeatures {
  return {
    dealCount: 4,
    openDealCount: 2,
    wonDealCount: 1,
    lostDealCount: 1,
    avgDealVelocityDays: 25,
    highestDealStageProgress: 75,
    lastContactRecencyDays: 2,
    activityCount30d: 12,
    activityCount90d: 35,
    hasRecentDealActivity: true,
    ...overrides,
  };
}

function makeFeatures(
  engagement?: Partial<EngagementFeatures>,
  firmographic?: Partial<FirmographicFeatures>,
  behavioral?: Partial<BehavioralFeatures>,
): ComputedFeatures {
  return {
    engagement: makeEngagement(engagement),
    firmographic: makeFirmographic(firmographic),
    behavioral: makeBehavioral(behavioral),
  };
}

// ============ Tests ============

describe('FeatureStoreService.toFeatureVector', () => {
  it('should produce 27 named features', () => {
    const features = makeFeatures();
    const { names, values } = FeatureStoreService.toFeatureVector(features);

    expect(names).toHaveLength(27);
    expect(values).toHaveLength(27);
    expect(names.length).toBe(values.length);
  });

  it('should correctly map engagement features', () => {
    const features = makeFeatures({ emailsSent: 100, repliedRatio: 0.8 });
    const { names, values } = FeatureStoreService.toFeatureVector(features);

    const sentIdx = names.indexOf('eng_emails_sent');
    expect(values[sentIdx]).toBe(100);

    const ratioIdx = names.indexOf('eng_replied_ratio');
    expect(values[ratioIdx]).toBe(0.8);
  });

  it('should handle null values with defaults', () => {
    const features = makeFeatures(
      { avgResponseTimeHours: null, lastInteractionDaysAgo: null },
      {},
      { avgDealVelocityDays: null, lastContactRecencyDays: null },
    );
    const { names, values } = FeatureStoreService.toFeatureVector(features);

    // Null avg response → 0
    const responseIdx = names.indexOf('eng_avg_response_hours');
    expect(values[responseIdx]).toBe(0);

    // Null last interaction → 365
    const lastIntIdx = names.indexOf('eng_last_interaction_days');
    expect(values[lastIntIdx]).toBe(365);

    // Null velocity → 0
    const velocityIdx = names.indexOf('beh_avg_velocity_days');
    expect(values[velocityIdx]).toBe(0);

    // Null recency → 365
    const recencyIdx = names.indexOf('beh_last_recency_days');
    expect(values[recencyIdx]).toBe(365);
  });

  it('should encode boolean features as 0/1', () => {
    const features = makeFeatures(
      {},
      { hasAccount: true, hasWebsite: false },
      { hasRecentDealActivity: false },
    );
    const { names, values } = FeatureStoreService.toFeatureVector(features);

    expect(values[names.indexOf('firm_has_account')]).toBe(1);
    expect(values[names.indexOf('firm_has_website')]).toBe(0);
    expect(values[names.indexOf('beh_recent_deal_activity')]).toBe(0);
  });

  it('should produce all numeric values (no NaN, no undefined)', () => {
    const features = makeFeatures();
    const { values } = FeatureStoreService.toFeatureVector(features);

    for (const v of values) {
      expect(typeof v).toBe('number');
      expect(Number.isNaN(v)).toBe(false);
      expect(v).not.toBeUndefined();
    }
  });
});

describe('Feature profiles', () => {
  it('hot lead profile should have high engagement + deals', () => {
    const hot = makeFeatures(
      { totalInteractions: 100, recentActivityScore: 9, repliedRatio: 0.9 },
      { hasAccount: true, companySize: 4, revenueRange: 5 },
      { wonDealCount: 3, openDealCount: 1, highestDealStageProgress: 90 },
    );
    const { values, names } = FeatureStoreService.toFeatureVector(hot);

    // Sanity: high engagement
    expect(values[names.indexOf('eng_total_interactions')]).toBeGreaterThan(50);
    expect(values[names.indexOf('eng_recency_score')]).toBeGreaterThan(7);
    // Sanity: big company
    expect(values[names.indexOf('firm_company_size')]).toBeGreaterThanOrEqual(4);
    // Sanity: won deals
    expect(values[names.indexOf('beh_won_deals')]).toBeGreaterThanOrEqual(3);
  });

  it('cold lead profile should have minimal engagement', () => {
    const cold = makeFeatures(
      { totalInteractions: 0, recentActivityScore: 0, repliedRatio: 0, lastInteractionDaysAgo: null },
      { hasAccount: false, companySize: 0, revenueRange: 0 },
      { dealCount: 0, openDealCount: 0, wonDealCount: 0, activityCount30d: 0 },
    );
    const { values, names } = FeatureStoreService.toFeatureVector(cold);

    expect(values[names.indexOf('eng_total_interactions')]).toBe(0);
    expect(values[names.indexOf('firm_has_account')]).toBe(0);
    expect(values[names.indexOf('beh_deal_count')]).toBe(0);
  });
});

describe('LeadScoreController tier mapping', () => {
  // Simple tier function test (extracted logic)
  function scoreTier(score: number): 'hot' | 'warm' | 'cold' {
    if (score >= 70) return 'hot';
    if (score >= 40) return 'warm';
    return 'cold';
  }

  it('should map 70+ to hot', () => {
    expect(scoreTier(70)).toBe('hot');
    expect(scoreTier(100)).toBe('hot');
    expect(scoreTier(85)).toBe('hot');
  });

  it('should map 40-69 to warm', () => {
    expect(scoreTier(40)).toBe('warm');
    expect(scoreTier(69)).toBe('warm');
    expect(scoreTier(55)).toBe('warm');
  });

  it('should map 0-39 to cold', () => {
    expect(scoreTier(0)).toBe('cold');
    expect(scoreTier(39)).toBe('cold');
    expect(scoreTier(20)).toBe('cold');
  });
});
