// Mock langchain ESM deps used indirectly by controller imports
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

import { MultiAgentController } from './multi-agent.controller';

describe('MultiAgentController - feedback stats endpoint', () => {
  const TENANT_ID = 'tenant-1';
  const USER_ID = 'user-1';

  let feedbackService: any;
  let controller: MultiAgentController;

  beforeEach(() => {
    feedbackService = {
      getAggregateStats: jest.fn().mockResolvedValue({ totalAttempts: 10 }),
    };

    controller = new MultiAgentController(
      {} as any,
      {} as any,
      {} as any,
      feedbackService as any,
    );
  });

  const buildReq = () =>
    ({
      user: {
        tenantId: TENANT_ID,
        userId: USER_ID,
        email: 'user@example.com',
        role: 'user',
      },
    } as any);

  it('returns aggregate feedback stats for tenant', async () => {
    const res = await controller.getFeedbackStats(buildReq());

    expect(feedbackService.getAggregateStats).toHaveBeenCalledWith(TENANT_ID);
    expect(res).toEqual({
      success: true,
      stats: { totalAttempts: 10 },
    });
  });
});
