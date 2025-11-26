// Mock langchain ESM deps used by multi-agent.service imports
jest.mock('@langchain/mistralai', () => ({
  ChatMistralAI: jest.fn().mockImplementation(() => ({
    invoke: jest.fn().mockResolvedValue({ content: 'mocked' }),
  })),
}));
jest.mock('@langchain/core/prompts', () => ({
  PromptTemplate: {
    fromTemplate: jest.fn().mockReturnValue({
      pipe: jest.fn().mockReturnThis(),
    }),
  },
}));
jest.mock('@langchain/core/output_parsers', () => ({
  StringOutputParser: jest.fn().mockImplementation(() => ({})),
}));

import { ForbiddenException } from '@nestjs/common';
import { MultiAgentController } from './multi-agent.controller';
import { AgentIntent } from '../interfaces/agent-context.interface';

describe('MultiAgentController - processMessage security', () => {
  const TENANT_ID = 'tenant-1';
  const USER_ID = 'user-1';

  let prisma: any;
  let multiAgentService: any;
  let controller: MultiAgentController;

  beforeEach(() => {
    prisma = {
      chatSession: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      userPreferences: {
        findUnique: jest.fn().mockResolvedValue({
          language: 'en',
          timezone: 'UTC',
          aiAutoApproveThreshold: 0.9,
          aiSmartRepliesEnabled: true,
          aiSummarizationEnabled: true,
          aiSchedulingEnabled: true,
        }),
      },
    };

    multiAgentService = {
      process: jest.fn().mockResolvedValue({
        messages: ['ok'],
        pendingActionIds: [],
        executedActionIds: [],
        intent: { intent: AgentIntent.GENERAL, confidence: 1, reasoning: '', suggestedAgents: [] },
        agentUsed: 'GeneralAgent',
        executionTimeMs: 1,
        needsMoreInfo: false,
      }),
    };

    controller = new MultiAgentController(
      prisma as any,
      multiAgentService as any,
      {} as any,
      {} as any,
    );
  });

  const buildReq = (overrides: Partial<any> = {}) =>
    ({
      user: {
        tenantId: TENANT_ID,
        userId: USER_ID,
        email: 'user@example.com',
        role: 'user',
      },
      ...overrides,
    } as any);

  it('throws if a forged sessionId does not belong to the user/tenant', async () => {
    prisma.chatSession.findFirst.mockResolvedValue(null);

    await expect(
      controller.processMessage(
        buildReq(),
        { message: 'hi', sessionId: 'forged' } as any,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates a session when none is provided and returns its id', async () => {
    prisma.chatSession.create.mockResolvedValue({ id: 'new-session' });

    const result = await controller.processMessage(
      buildReq(),
      { message: 'hi' } as any,
    );

    expect(prisma.chatSession.create).toHaveBeenCalledWith({
      data: {
        tenantId: TENANT_ID,
        userId: USER_ID,
        title: 'Multi-agent session',
        messages: [],
      },
      select: { id: true },
    });
    expect(multiAgentService.process).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'new-session' }),
      expect.any(Object),
    );
    expect(result.sessionId).toBe('new-session');
  });
});
