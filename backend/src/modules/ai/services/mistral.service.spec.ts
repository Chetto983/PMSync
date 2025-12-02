import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmbeddingsService } from './embeddings.service';
import { MistralService } from './mistral.service';

jest.mock('@mistralai/mistralai', () => {
  const chatComplete = jest.fn();
  const embeddingsCreate = jest.fn();
  const ctor = jest.fn().mockImplementation(() => ({
    chat: { complete: chatComplete },
    embeddings: { create: embeddingsCreate },
  }));
  return {
    Mistral: ctor,
    __mocks: {
      chatComplete,
      embeddingsCreate,
      ctor,
    },
  };
});

const {
  __mocks: {
    chatComplete: mockChatComplete,
    embeddingsCreate: mockEmbeddingsCreate,
    ctor: mockConstructor,
  },
} = jest.requireMock('@mistralai/mistralai');

describe('MistralService', () => {
  let service: MistralService;
  let configValues: Record<string, string | undefined>;
  let configService: { get: jest.Mock };
  let prismaService: Record<string, never>;
  let embeddingsService: {
    saveEmbedding: jest.Mock;
    findSimilarContent: jest.Mock;
  };

  const originalEnvApiKey = process.env.MISTRAL_API_KEY;
  const originalEnvModel = process.env.MISTRAL_MODEL;

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env.MISTRAL_API_KEY;
    delete process.env.MISTRAL_MODEL;
    configValues = {
      MISTRAL_API_KEY: 'test-api-key',
      MISTRAL_MODEL: 'mistral-medium-latest',
    };
    configService = {
      get: jest.fn((key: string) => configValues[key]),
    };
    // PrismaService mock - Message model was removed from schema
    prismaService = {};
    embeddingsService = {
      saveEmbedding: jest.fn().mockResolvedValue(undefined),
      findSimilarContent: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MistralService,
        { provide: ConfigService, useValue: configService },
        { provide: PrismaService, useValue: prismaService },
        { provide: EmbeddingsService, useValue: embeddingsService },
      ],
    }).compile();

    service = module.get<MistralService>(MistralService);
  });

  afterAll(() => {
    if (originalEnvApiKey) {
      process.env.MISTRAL_API_KEY = originalEnvApiKey;
    } else {
      delete process.env.MISTRAL_API_KEY;
    }
    if (originalEnvModel) {
      process.env.MISTRAL_MODEL = originalEnvModel;
    } else {
      delete process.env.MISTRAL_MODEL;
    }
  });

  describe('createMistralClient', () => {
    it('throws when API key is missing', async () => {
      configValues.MISTRAL_API_KEY = undefined;

      await expect(service.createMistralClient()).rejects.toThrow(
        'Mistral API key is not configured',
      );
      expect(mockConstructor).not.toHaveBeenCalled();
    });

    it('creates client when API key is available', async () => {
      await service.createMistralClient();

      expect(mockConstructor).toHaveBeenCalledWith({ apiKey: 'test-api-key' });
    });
  });

  describe('completePrompt', () => {
    it('returns trimmed assistant text', async () => {
      mockChatComplete.mockResolvedValue({
        choices: [{ message: { content: '  Hello world  ' } }],
      });

      const result = await service.completePrompt({
        systemPrompt: 'system',
        userPrompt: 'User',
        temperature: 0.5,
        maxTokens: 100,
      });

      expect(result).toBe('Hello world');
      expect(mockChatComplete).toHaveBeenCalledWith({
        model: 'mistral-medium-latest',
        messages: [
          { role: 'system', content: 'system' },
          { role: 'user', content: 'User' },
        ],
        temperature: 0.5,
        maxTokens: 100,
      });
    });

    it('throws when assistant response is empty', async () => {
      mockChatComplete.mockResolvedValue({
        choices: [{ message: { content: '   ' } }],
      });

      await expect(
        service.completePrompt({
          userPrompt: 'prompt',
        }),
      ).rejects.toThrow('Empty response from AI service');
    });
  });

  describe('generateEmbedding', () => {
    it('returns embedding vector from client', async () => {
      mockEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: [0.1, 0.2, 0.3] }],
      });

      const result = await service.generateEmbedding('text');

      expect(result).toEqual([0.1, 0.2, 0.3]);
      expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
        model: 'mistral-embed',
        inputs: 'text',
      });
    });
  });

  describe('generateBulkEmbeddings', () => {
    it('returns empty array for empty input', async () => {
      const result = await service.generateBulkEmbeddings([]);

      expect(result).toEqual([]);
      expect(mockEmbeddingsCreate).not.toHaveBeenCalled();
    });

    it('generates embeddings for multiple texts in a single call', async () => {
      mockEmbeddingsCreate.mockResolvedValue({
        data: [
          { index: 0, embedding: [0.1, 0.2, 0.3] },
          { index: 1, embedding: [0.4, 0.5, 0.6] },
          { index: 2, embedding: [0.7, 0.8, 0.9] },
        ],
      });

      const result = await service.generateBulkEmbeddings([
        'first text',
        'second text',
        'third text',
      ]);

      expect(result).toEqual([
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
        [0.7, 0.8, 0.9],
      ]);
      expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
        model: 'mistral-embed',
        inputs: ['first text', 'second text', 'third text'],
      });
    });

    it('sorts embeddings by index to ensure correct order', async () => {
      // Return embeddings in wrong order
      mockEmbeddingsCreate.mockResolvedValue({
        data: [
          { index: 2, embedding: [0.7, 0.8, 0.9] },
          { index: 0, embedding: [0.1, 0.2, 0.3] },
          { index: 1, embedding: [0.4, 0.5, 0.6] },
        ],
      });

      const result = await service.generateBulkEmbeddings([
        'first text',
        'second text',
        'third text',
      ]);

      // Should be reordered by index
      expect(result).toEqual([
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
        [0.7, 0.8, 0.9],
      ]);
    });

    it('throws error when response data is empty', async () => {
      mockEmbeddingsCreate.mockResolvedValue({
        data: [],
      });

      await expect(
        service.generateBulkEmbeddings(['text1', 'text2']),
      ).rejects.toThrow('Mistral bulk embeddings response did not contain data');
    });

    it('throws error when embedding count does not match input count', async () => {
      mockEmbeddingsCreate.mockResolvedValue({
        data: [
          { index: 0, embedding: [0.1, 0.2, 0.3] },
          // Missing second embedding
        ],
      });

      await expect(
        service.generateBulkEmbeddings(['text1', 'text2']),
      ).rejects.toThrow('Expected 2 embeddings but received 1');
    });

    it('throws error when an embedding is empty or invalid', async () => {
      mockEmbeddingsCreate.mockResolvedValue({
        data: [
          { index: 0, embedding: [0.1, 0.2, 0.3] },
          { index: 1, embedding: [] }, // Empty embedding
        ],
      });

      await expect(
        service.generateBulkEmbeddings(['text1', 'text2']),
      ).rejects.toThrow('Embedding at index 1 is empty or invalid');
    });
  });

  describe('searchSimilarContent', () => {
    it('returns empty array when search fails', async () => {
      embeddingsService.findSimilarContent.mockRejectedValue(new Error('DB error'));

      const results = await service.searchSimilarContent('tenant', [0.1], 5);

      expect(results).toEqual([]);
    });
  });

  describe('generateResponse', () => {
    const baseArgs = {
      tenantId: 'tenant-a',
      userId: 'user-1',
      userPrompt: 'Tell me the plan',
      conversationHistory: [{ role: 'assistant', content: 'Prev answer' }],
    };

    it('returns fallback response when API key missing', async () => {
      configValues.MISTRAL_API_KEY = undefined;

      const response = await service.generateResponse(
        baseArgs.tenantId,
        baseArgs.userId,
        baseArgs.userPrompt,
        baseArgs.conversationHistory,
      );

      expect(response).toContain('AI assistant is not configured');
    });

    it('persists user message and assistant answer when call succeeds', async () => {
      mockEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: [0.9, 0.8] }],
      });
      embeddingsService.findSimilarContent.mockResolvedValue([
        { content: 'Doc summary', documentName: 'Doc 1' },
      ]);
      mockChatComplete.mockResolvedValue({
        choices: [{ message: { content: 'Final answer' } }],
      });

      const response = await service.generateResponse(
        baseArgs.tenantId,
        baseArgs.userId,
        baseArgs.userPrompt,
        baseArgs.conversationHistory,
      );

      expect(response).toBe('Final answer');
      expect(embeddingsService.saveEmbedding).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-a',
          content: 'Tell me the plan',
        }),
      );
      expect(embeddingsService.findSimilarContent).toHaveBeenCalled();
      expect(mockChatComplete).toHaveBeenCalled();
    });

    it('gracefully handles errors from Mistral API', async () => {
      mockEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: [0.1, 0.2] }],
      });
      const error = new Error('Service down') as any;
      error.statusCode = 503;
      mockChatComplete.mockRejectedValue(error);

      const response = await service.generateResponse(
        baseArgs.tenantId,
        baseArgs.userId,
        baseArgs.userPrompt,
        baseArgs.conversationHistory,
      );

      expect(response).toContain('Mistral API is experiencing issues right now');
    });
  });
});
