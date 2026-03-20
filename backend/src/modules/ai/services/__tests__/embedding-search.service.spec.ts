import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { EmbeddingSearchService } from '../embedding-search.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { MistralService } from '../mistral.service';
import { EmbeddingsService } from '../embeddings.service';

const mockPrismaService = {
  email: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
};

const mockMistralService = {
  generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
};

const mockEmbeddingsService = {
  findSimilarContent: jest.fn(),
};

describe('EmbeddingSearchService', () => {
  let service: EmbeddingSearchService;
  let prisma: typeof mockPrismaService;
  let embeddingsService: typeof mockEmbeddingsService;
  let mistralService: typeof mockMistralService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingSearchService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: MistralService, useValue: mockMistralService },
        { provide: EmbeddingsService, useValue: mockEmbeddingsService },
      ],
    }).compile();

    service = module.get<EmbeddingSearchService>(EmbeddingSearchService);
    prisma = module.get(PrismaService);
    embeddingsService = module.get(EmbeddingsService);
    mistralService = module.get(MistralService);
  });

  describe('GDPR Compliance', () => {
    const tenantId = 'tenant-123';

    it('should hydrate search results from Email table, not embedding metadata', async () => {
      // Setup: Vector search returns embedding with emailId in metadata
      mockEmbeddingsService.findSimilarContent.mockResolvedValue([
        { id: 'emb-1', documentName: null, metadata: { emailId: 'email-1', subject: 'OLD' }, distance: 0.1 },
      ]);

      // Setup: Email table has current data
      mockPrismaService.email.findMany.mockResolvedValue([
        {
          id: 'email-1',
          subject: 'CURRENT Subject',
          snippet: 'Current snippet',
          from: 'sender@example.com',
          receivedAt: new Date('2024-01-01'),
        },
      ]);

      const result = await service.search({
        tenantId,
        query: 'test query',
        limit: 5,
      });

      // GDPR: snippet should come from Email table (current), not embedding metadata
      // Note: subject falls back to metadata if Email doesn't have it, but snippet is always from Email
      expect(result.items[0].snippet).toBe('Current snippet');
      expect(prisma.email.findMany).toHaveBeenCalled();
    });

    it('should return null values for missing hydration data (deleted email)', async () => {
      // Vector search returns embeddings with emailIds in metadata
      mockEmbeddingsService.findSimilarContent.mockResolvedValue([
        { id: 'emb-1', documentName: null, metadata: { emailId: 'email-1' }, distance: 0.1 },
        { id: 'emb-2', documentName: null, metadata: { emailId: 'email-2' }, distance: 0.2 }, // Deleted
      ]);

      // Only email-1 exists (email-2 was deleted for GDPR)
      mockPrismaService.email.findMany.mockResolvedValue([
        { id: 'email-1', subject: 'Subject 1', snippet: 'Snippet 1', from: null, receivedAt: null },
      ]);

      const result = await service.search({
        tenantId,
        query: 'test query',
        limit: 10,
      });

      // Service does NOT filter deleted emails - returns all matches with null hydration
      expect(result.items).toHaveLength(2);
      expect(result.items[0].emailId).toBe('email-1');
      expect(result.items[0].snippet).toBe('Snippet 1');
      // Deleted email returns null values
      expect(result.items[1].emailId).toBe('email-2');
      expect(result.items[1].snippet).toBeNull();
    });
  });

  describe('Multi-tenant isolation', () => {
    it('should pass tenantId to vector search', async () => {
      mockEmbeddingsService.findSimilarContent.mockResolvedValue([]);

      await service.search({
        tenantId: 'specific-tenant',
        query: 'test',
        limit: 5,
      });

      // embeddingsService.findSimilarContent(tenantId, embedding, limit)
      expect(embeddingsService.findSimilarContent).toHaveBeenCalledWith(
        'specific-tenant',
        expect.any(Array), // embedding vector
        5,
      );
    });

    it('should filter email hydration by tenantId', async () => {
      mockEmbeddingsService.findSimilarContent.mockResolvedValue([
        { id: 'emb-1', documentName: null, metadata: { emailId: 'email-1' }, distance: 0.1 },
      ]);
      mockPrismaService.email.findMany.mockResolvedValue([]);

      await service.search({
        tenantId: 'specific-tenant',
        query: 'test',
        limit: 5,
      });

      expect(prisma.email.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'specific-tenant',
          }),
        }),
      );
    });
  });

  describe('Search by emailId', () => {
    it('should compose search text from email when emailId provided', async () => {
      const emailId = 'email-to-search';
      // Service uses findFirst to fetch email for search composition
      mockPrismaService.email.findFirst.mockResolvedValue({
        subject: 'Test Subject',
        snippet: 'Test snippet',
        bodyText: 'Body content',
        bodyHtml: null,
      });
      mockEmbeddingsService.findSimilarContent.mockResolvedValue([]);

      await service.search({
        tenantId: 'tenant-123',
        emailId,
        limit: 5,
      });

      // Should fetch email via findFirst for composition
      expect(prisma.email.findFirst).toHaveBeenCalledWith({
        where: { id: emailId, tenantId: 'tenant-123' },
        select: expect.objectContaining({
          subject: true,
          snippet: true,
        }),
      });
    });

    it('should throw BadRequestException when email not found (no query to search)', async () => {
      mockPrismaService.email.findFirst.mockResolvedValue(null);

      await expect(
        service.search({
          tenantId: 'tenant-123',
          emailId: 'nonexistent-email',
          limit: 5,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when neither query nor emailId provided', async () => {
      await expect(
        service.search({
          tenantId: 'tenant-123',
          limit: 5,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Score calculation', () => {
    it('should calculate score as 1 - distance (higher = more similar)', async () => {
      mockEmbeddingsService.findSimilarContent.mockResolvedValue([
        { id: 'emb-1', documentName: null, metadata: {}, distance: 0.2 },
      ]);
      mockPrismaService.email.findMany.mockResolvedValue([]);

      const result = await service.search({
        tenantId: 'tenant-123',
        query: 'test',
        limit: 5,
      });

      // Score should be 1 - 0.2 = 0.8
      expect(result.items[0].score).toBeCloseTo(0.8);
      expect(result.items[0].distance).toBe(0.2);
    });
  });

  describe('Limit enforcement', () => {
    it('should respect MAX_SEARCH_LIMIT of 10', async () => {
      mockEmbeddingsService.findSimilarContent.mockResolvedValue([]);

      await service.search({
        tenantId: 'tenant-123',
        query: 'test',
        limit: 100, // Request more than max
      });

      // findSimilarContent(tenantId, embedding, limit)
      expect(embeddingsService.findSimilarContent).toHaveBeenCalledWith(
        'tenant-123',
        expect.any(Array),
        10, // Should be capped at MAX_SEARCH_LIMIT
      );
    });

    it('should use DEFAULT_SEARCH_LIMIT of 5 when not specified', async () => {
      mockEmbeddingsService.findSimilarContent.mockResolvedValue([]);

      await service.search({
        tenantId: 'tenant-123',
        query: 'test',
        // limit not specified
      });

      expect(embeddingsService.findSimilarContent).toHaveBeenCalledWith(
        'tenant-123',
        expect.any(Array),
        5, // DEFAULT_SEARCH_LIMIT
      );
    });
  });

  describe('SearchResult structure', () => {
    it('should return correct SearchResult format', async () => {
      mockEmbeddingsService.findSimilarContent.mockResolvedValue([
        { id: 'emb-1', documentName: null, metadata: { emailId: 'email-1', source: 'email' }, distance: 0.15 },
      ]);
      mockPrismaService.email.findMany.mockResolvedValue([
        {
          id: 'email-1',
          subject: 'Test Subject',
          snippet: 'Test snippet',
          from: 'sender@test.com',
          receivedAt: new Date('2024-06-15'),
        },
      ]);

      const result = await service.search({
        tenantId: 'tenant-123',
        query: 'test',
        limit: 5,
      });

      expect(result).toMatchObject({
        usedQuery: 'test',
        items: expect.arrayContaining([
          expect.objectContaining({
            id: 'emb-1',
            emailId: 'email-1',
            subject: 'Test Subject',
            snippet: 'Test snippet',
            from: 'sender@test.com',
            score: expect.any(Number),
            distance: 0.15,
          }),
        ]),
      });
    });

    it('should include receivedAt as ISO string', async () => {
      const date = new Date('2024-06-15T10:30:00Z');
      mockEmbeddingsService.findSimilarContent.mockResolvedValue([
        { id: 'emb-1', documentName: null, metadata: { emailId: 'email-1' }, distance: 0.1 },
      ]);
      mockPrismaService.email.findMany.mockResolvedValue([
        { id: 'email-1', subject: 'Test', snippet: 'Test', from: null, receivedAt: date },
      ]);

      const result = await service.search({
        tenantId: 'tenant-123',
        query: 'test',
        limit: 5,
      });

      expect(result.items[0].receivedAt).toBe(date.toISOString());
    });
  });

  describe('Embedding generation', () => {
    it('should generate embedding for search query', async () => {
      mockEmbeddingsService.findSimilarContent.mockResolvedValue([]);

      await service.search({
        tenantId: 'tenant-123',
        query: 'my search query',
        limit: 5,
      });

      expect(mistralService.generateEmbedding).toHaveBeenCalledWith(
        'my search query',
        undefined,
        { tenantId: 'tenant-123' },
      );
    });
  });

  describe('Empty results', () => {
    it('should return empty items when no matches found', async () => {
      mockEmbeddingsService.findSimilarContent.mockResolvedValue([]);

      const result = await service.search({
        tenantId: 'tenant-123',
        query: 'test',
        limit: 5,
      });

      expect(result.items).toEqual([]);
      expect(result.usedQuery).toBe('test');
    });
  });
});
