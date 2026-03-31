import {
  buildFallbackBriefingSummary,
  deriveTriageLane,
  groupEmailsByTriageLane,
  isWeakBriefingSummary,
} from './triage-lanes';

describe('triage-lanes', () => {
  it('routes WAITING_FOR follow-ups into waiting-on-reply', () => {
    const lane = deriveTriageLane(
      {
        id: 'email-1',
        subject: 'Proposal follow-up',
        aiPriority: 1,
        aiPriorityReason: 'Waiting on customer confirmation.',
      },
      {
        emailId: 'email-1',
        followUpType: 'WAITING_FOR',
      },
    );

    expect(lane).toBe('waiting-on-reply');
  });

  it('routes deployment alerts into system-alerts', () => {
    const lane = deriveTriageLane({
      id: 'email-2',
      subject: 'Build failed for pmsync',
      from: 'Railway <hello@notify.railway.app>',
      aiPriority: 1,
      aiPriorityReason: 'Production deployment failed.',
    });

    expect(lane).toBe('system-alerts');
  });

  it('builds a factual fallback briefing summary', () => {
    const summary = buildFallbackBriefingSummary(
      [
        {
          id: 'email-1',
          subject: 'Contract needs review',
          aiPriority: 1,
          aiPriorityReason: 'Customer needs an answer today.',
        },
        {
          id: 'email-2',
          subject: 'Build failed for pmsync',
          from: 'Railway <hello@notify.railway.app>',
          aiPriority: 1,
        },
      ],
      [
        {
          emailId: 'email-1',
          followUpType: 'TODO',
        },
      ],
    );

    expect(summary).toContain('need action now');
    expect(summary).toContain('system alerts');
  });

  it('detects weak briefing summaries', () => {
    expect(isWeakBriefingSummary('Unable to generate briefing at this time.')).toBe(true);
    expect(isWeakBriefingSummary('You have 3 urgent threads today.')).toBe(false);
  });

  it('groups emails by lane order', () => {
    const groups = groupEmailsByTriageLane([
      { id: '1', subject: 'Client asks for approval', aiPriority: 1 },
      { id: '2', subject: 'Railway build failed', from: 'Railway', aiPriority: 1 },
    ]);

    expect(groups[0].lane).toBe('action-now');
    expect(groups[2].lane).toBe('system-alerts');
    expect(groups[0].items).toHaveLength(1);
    expect(groups[2].items).toHaveLength(1);
  });
});

