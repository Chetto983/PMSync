/**
 * Pre-split characterization test for EmailInsightsService.
 * Verifies all public methods exist on the class prototype.
 */
import { EmailInsightsService } from '../email-insights.service';

describe('EmailInsightsService (pre-split characterization)', () => {
  it('should be defined as a class', () => {
    expect(EmailInsightsService).toBeDefined();
    expect(typeof EmailInsightsService).toBe('function');
  });

  const expectedPublicMethods = [
    'analyzeEmailUnified',
    'generateSmartReplies',
    'composeEmail',
  ];

  it.each(expectedPublicMethods)('should have public method: %s', (methodName) => {
    expect(typeof EmailInsightsService.prototype[methodName]).toBe('function');
  });

  it('should export UnifiedEmailAnalysis type (compile-time check)', () => {
    // This test validates the import compiles -- if UnifiedEmailAnalysis
    // is not exported, this file will fail to compile.
    const analysis: import('../email-insights.service').UnifiedEmailAnalysis = {
      summary: '', sentiment: 'neutral', tone: 'neutral',
      priority: 3, urgency: 'medium', labels: [], keyTopics: [],
      intent: 'fyi', escalationRisk: false, hasDeadline: false,
      deadlineDate: null, needsFollowUp: false, confidence: 0.7, reasoning: '',
    };
    expect(analysis.sentiment).toBe('neutral');
  });
});
