import { BadRequestException } from '@nestjs/common';
import { EmailInsightsService } from './email-insights.service';

describe('EmailInsightsService.composeEmail', () => {
  const prismaMock: any = {}; // Not used in compose flow

  const buildService = (response: string | Error = 'Draft body') => {
    const mistralMock = {
      completePrompt: jest.fn(),
    };

    if (response instanceof Error) {
      mistralMock.completePrompt.mockRejectedValue(response);
    } else {
      mistralMock.completePrompt.mockResolvedValue(response);
    }

    const service = new EmailInsightsService(prismaMock, mistralMock as any);
    return { service, mistralMock };
  };

  it('returns composed body and variant', async () => {
    const { service, mistralMock } = buildService(
      '{"body":"Hello there","subject":"Hi"}',
    );

    const result = await service.composeEmail(
      'tenant-1',
      {
        prompt: 'Write a friendly follow-up',
        to: ['a@example.com'],
        tone: 'formal',
        locale: 'en',
        variant: 'B',
      },
      'user-1',
    );

    expect(result.body).toBe('Hello there');
    expect(result.subject).toBe('Hi');
    expect(result.variantUsed).toBe('B');
    expect(mistralMock.completePrompt).toHaveBeenCalled();
  });

  it('falls back to plain text when JSON parsing fails', async () => {
    const { service } = buildService('Plain body only');

    const result = await service.composeEmail('tenant-1', { prompt: 'Just draft' });

    expect(result.body).toContain('Plain body only');
    expect(result.subject).toBeUndefined();
  });

  it('throws BadRequestException on provider failure', async () => {
    const { service } = buildService(new Error('LLM down'));

    await expect(
      service.composeEmail('tenant-1', { prompt: 'Hello' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
