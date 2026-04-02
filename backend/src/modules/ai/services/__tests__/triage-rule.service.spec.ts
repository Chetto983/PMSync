import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TriageRuleService } from '../triage-rule.service';

describe('TriageRuleService', () => {
  let prisma: any;
  let service: TriageRuleService;

  beforeEach(() => {
    prisma = {
      tenant: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          triageRules: Array.from({ length: 10 }, (_, index) => ({
            type: 'phrase',
            pattern: `critical customer incident phrase ${index + 1} `.repeat(6),
            action: 'important',
            labelName: `Incident ${index + 1}`,
          })),
        }),
      },
      userLabel: {
        findMany: vi.fn().mockResolvedValue([
          {
            name: 'Important',
            aiPrompt: 'Use for urgent incidents and outages requiring direct attention.',
            category: 'workflow',
            suppressUrgency: false,
            mutuallyExclusiveWith: [],
            defaultLane: 'action-now',
          },
          {
            name: 'Updates',
            aiPrompt: 'Use for release notes and passive notifications.',
            category: 'suppression',
            suppressUrgency: true,
            mutuallyExclusiveWith: ['Important'],
            defaultLane: 'system-alerts',
          },
        ]),
      },
    };

    service = new TriageRuleService(prisma);
  });

  it('builds a compact context without duplicating label prompts', async () => {
    const context = await service.buildTriageContext('tenant-1', {
      includeLabelPrompts: false,
      maxLength: 420,
      maxRules: 4,
      maxLineLength: 90,
    });

    expect(context.length).toBeLessThanOrEqual(420);
    expect(context).toContain('<LABEL_METADATA>');
    expect(context).toContain('<TRIAGE_RULES>');
    expect(context).not.toContain('Use for urgent incidents');
    expect(context).not.toContain('Use for release notes');
  });
});
