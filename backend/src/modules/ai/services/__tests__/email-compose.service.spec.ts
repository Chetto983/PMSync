import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailComposeService } from '../email-compose.service';

describe('EmailComposeService', () => {
  let mistral: any;
  let utils: any;
  let analysis: any;
  let service: EmailComposeService;

  beforeEach(() => {
    mistral = {
      completePrompt: vi.fn().mockResolvedValue(JSON.stringify({
        body: 'Dear GitKraken Team,\n\nThanks for the Git Roasted update. We reviewed it and will reply shortly.\n\nBest regards,\nDavide',
        subject: 'Re: Try this on your teammate\'s commits',
      })),
    };

    utils = {
      truncate: vi.fn((value: string) => value),
      stripMarkdown: vi.fn((value: string) => value),
      getErrorMessage: vi.fn((error: unknown) => String(error)),
      mapAiErrorToHttpException: vi.fn((error: unknown) => error),
    };

    analysis = {
      resolveLocale: vi.fn(() => 'en'),
    };

    service = new EmailComposeService({} as any, mistral, utils, analysis, undefined as any);
  });

  it('anchors compose prompts to the concrete thread topic', async () => {
    await service.composeEmail('tenant-1', {
      prompt: 'Write a concise professional follow-up about "Try this on your teammate\'s commits".',
      threadContext: [
        {
          subject: "Try this on your teammate's commits",
          body: 'We launched a new Git Roasted feature for code review fun.',
        },
      ],
      senderName: 'Davide',
      tone: 'formal',
      locale: 'en',
    });

    expect(mistral.completePrompt).toHaveBeenCalledWith(expect.objectContaining({
      userPrompt: expect.stringContaining("Specific topic to acknowledge: Try this on your teammate's commits"),
    }));
  });
});
