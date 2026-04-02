import { describe, expect, it } from 'vitest';
import { TriageScoreService } from '../triage-score.service';

describe('TriageScoreService', () => {
  const service = new TriageScoreService();

  it('boosts explicit system alert failures even when labels normally suppress urgency', () => {
    const result = service.compute(
      {
        labels: ['System Alert', 'Updates'],
        suppressUrgency: true,
      },
      {
        priority: 4,
        urgency: 'medium',
        intent: 'alert',
        actionability: 'none',
        escalationRisk: false,
        hasDeadline: false,
        deadlineDate: null,
        needsFollowUp: false,
        followUpDate: null,
        followUpReason: null,
      },
      [
        {
          name: 'System Alert',
          aiPrompt: 'Use for operational alerts from GitHub, Railway, or Vercel.',
          category: 'custom',
          suppressUrgency: true,
          mutuallyExclusiveWith: [],
          defaultLane: 'system-alerts',
        },
        {
          name: 'Updates',
          aiPrompt: 'Use for passive product updates and routine notifications.',
          category: 'suppression',
          suppressUrgency: true,
          mutuallyExclusiveWith: [],
          defaultLane: 'review-later',
        },
      ],
      {
        from: 'davide marchetto <notifications@github.com>',
        subject: '[chetto1983/PMSync] Run failed: Frontend CI - main (d4c268c)',
      },
    );

    expect(result.priority).toBe(2);
    expect(result.urgency).toBe('high');
    expect(result.priorityReason).toContain('Operational failure alert');
  });

  it('keeps passive alert digests suppressed when no explicit failure exists', () => {
    const result = service.compute(
      {
        labels: ['System Alert', 'Updates'],
        suppressUrgency: true,
      },
      {
        priority: 3,
        urgency: 'medium',
        intent: 'fyi',
        actionability: 'none',
        escalationRisk: false,
        hasDeadline: false,
        deadlineDate: null,
        needsFollowUp: false,
        followUpDate: null,
        followUpReason: null,
      },
      [
        {
          name: 'System Alert',
          aiPrompt: 'Use for operational alerts from GitHub, Railway, or Vercel.',
          category: 'custom',
          suppressUrgency: true,
          mutuallyExclusiveWith: [],
          defaultLane: 'system-alerts',
        },
        {
          name: 'Updates',
          aiPrompt: 'Use for passive product updates and routine notifications.',
          category: 'suppression',
          suppressUrgency: true,
          mutuallyExclusiveWith: [],
          defaultLane: 'review-later',
        },
      ],
      {
        from: 'GitHub <notifications@github.com>',
        subject: 'GitHub weekly activity digest',
      },
    );

    expect(result.priority).toBe(4);
    expect(result.urgency).toBe('low');
  });
});
