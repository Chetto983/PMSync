import {
  buildRecommendedLabelSet,
  normalizeTriageOnboardingRules,
  TRIAGE_LABEL_TAXONOMY,
} from '../triage-onboarding.contract';

describe('triage-onboarding.contract', () => {
  it('normalizes and deduplicates onboarding rules', () => {
    const normalized = normalizeTriageOnboardingRules({
      customerDomains: [' Acme.com ', '@acme.com', 'https://contoso.it/path'],
      importantSenders: ['CEO@Acme.com ', 'ceo@acme.com'],
      projectTopics: [' PMSync deploy ', 'PMSync deploy'],
      followUpSlaHours: 24.4,
    });

    expect(normalized.customerDomains).toEqual(['acme.com', 'contoso.it']);
    expect(normalized.importantSenders).toEqual(['ceo@acme.com']);
    expect(normalized.projectTopics).toEqual(['PMSync deploy']);
    expect(normalized.followUpSlaHours).toBe(24);
  });

  it('drops invalid follow-up windows outside the accepted range', () => {
    const normalized = normalizeTriageOnboardingRules({
      followUpSlaHours: 2,
    });

    expect(normalized.followUpSlaHours).toBeNull();
  });

  it('builds operational labels from onboarding rules', () => {
    const recommendations = buildRecommendedLabelSet(
      normalizeTriageOnboardingRules({
        customerDomains: ['acme.com'],
        importantSenders: ['cto@acme.com'],
        systemAlertSources: ['GitHub Actions'],
        reviewLaterTopics: ['weekly digest'],
        billingTopics: ['invoice overdue'],
        followUpSlaHours: 48,
      }),
    );

    expect(recommendations.map((label) => label.name)).toEqual(
      expect.arrayContaining([
        'Customer',
        'System Alert',
        'Review Later',
        'Important',
        'Follow-up',
        'Finance',
      ]),
    );
    expect(recommendations.find((label) => label.name === 'Customer')?.aiPrompt).toContain('acme.com');
    expect(recommendations.find((label) => label.name === 'Follow-up')?.aiPrompt).toContain('48 hours');
  });

  it('marks suppression labels explicitly in the taxonomy', () => {
    const promotions = TRIAGE_LABEL_TAXONOMY.find((label) => label.name === 'Promotions');
    const reviewLater = TRIAGE_LABEL_TAXONOMY.find((label) => label.name === 'Review Later');

    expect(promotions?.suppressesUrgency).toBe(true);
    expect(reviewLater?.family).toBe('suppression');
  });
});
