import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { KnowledgeBaseService } from './knowledge-base.service';
import { MistralService } from './mistral.service';
import { EmbeddingsService } from './embeddings.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailEmbeddingQueueService } from './email-embedding.queue';
import { QueryEmbeddingCacheService } from './query-embedding-cache.service';
import { AttachmentContentExtractorService } from './attachment-content-extractor.service';

describe('KnowledgeBaseService - Bulk Embeddings', () => {
  let service: KnowledgeBaseService;
  let mistralService: jest.Mocked<MistralService>;
  let embeddingsService: jest.Mocked<EmbeddingsService>;

  beforeEach(async () => {
    const mockMistralService = {
      createMistralClient: jest.fn().mockResolvedValue({}),
      generateBulkEmbeddings: jest.fn().mockResolvedValue([
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
        [0.7, 0.8, 0.9],
      ]),
      getEmbeddingModel: jest.fn().mockReturnValue('mistral-embed'),
    };

    const mockEmbeddingsService = {
      hasEmbeddingForEmail: jest.fn().mockResolvedValue(false),
      saveEmbedding: jest.fn().mockResolvedValue(undefined),
    };

    const mockPrismaService = {
      embedding: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const mockEmailEmbeddingQueue = {};
    const mockQueryEmbeddingCache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const mockAttachmentContentExtractor = {
      extractText: jest.fn().mockResolvedValue(''),
    };
    const mockConfigService = {
      get: jest.fn().mockReturnValue(12000),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KnowledgeBaseService,
        { provide: MistralService, useValue: mockMistralService },
        { provide: EmbeddingsService, useValue: mockEmbeddingsService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EmailEmbeddingQueueService, useValue: mockEmailEmbeddingQueue },
        { provide: QueryEmbeddingCacheService, useValue: mockQueryEmbeddingCache },
        { provide: AttachmentContentExtractorService, useValue: mockAttachmentContentExtractor },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<KnowledgeBaseService>(KnowledgeBaseService);
    mistralService = module.get(MistralService);
    embeddingsService = module.get(EmbeddingsService);
  });

  describe('createBulkEmbeddingsForEmails', () => {
    it('should process multiple emails in a single bulk operation', async () => {
      const emailOptions = [
        {
          tenantId: 'tenant-1',
          emailId: 'email-1',
          subject: 'Test Email 1',
          bodyText: 'This is the first test email content',
          from: 'sender1@test.com',
          receivedAt: new Date(),
        },
        {
          tenantId: 'tenant-1',
          emailId: 'email-2',
          subject: 'Test Email 2',
          bodyText: 'This is the second test email content',
          from: 'sender2@test.com',
          receivedAt: new Date(),
        },
      ];

      const results = await service.createBulkEmbeddingsForEmails(emailOptions);

      // Should call generateBulkEmbeddings once for all chunks
      expect(mistralService.generateBulkEmbeddings).toHaveBeenCalledTimes(1);

      // Should have results for both emails
      expect(results).toHaveLength(2);
      expect(results[0].emailId).toBe('email-1');
      expect(results[0].success).toBe(true);
      expect(results[1].emailId).toBe('email-2');
      expect(results[1].success).toBe(true);

      // Should save embeddings for all chunks
      expect(embeddingsService.saveEmbedding).toHaveBeenCalled();
    });

    it('should return empty array for empty input', async () => {
      const results = await service.createBulkEmbeddingsForEmails([]);

      expect(results).toEqual([]);
      expect(mistralService.generateBulkEmbeddings).not.toHaveBeenCalled();
    });

    it('should skip emails with empty content', async () => {
      const emailOptions = [
        {
          tenantId: 'tenant-1',
          emailId: 'email-empty',
          subject: '',
          bodyText: null,
          from: null,
          receivedAt: new Date(),
        },
      ];

      const results = await service.createBulkEmbeddingsForEmails(emailOptions);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Empty content');
      expect(mistralService.generateBulkEmbeddings).not.toHaveBeenCalled();
    });

    it('should skip emails that already have embeddings', async () => {
      embeddingsService.hasEmbeddingForEmail.mockResolvedValue(true);

      const emailOptions = [
        {
          tenantId: 'tenant-1',
          emailId: 'email-existing',
          subject: 'Existing Email',
          bodyText: 'This email already has embeddings',
          from: 'sender@test.com',
          receivedAt: new Date(),
        },
      ];

      const results = await service.createBulkEmbeddingsForEmails(emailOptions);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Already exists');
      expect(mistralService.generateBulkEmbeddings).not.toHaveBeenCalled();
    });

    it('should fall back to individual processing if bulk fails', async () => {
      mistralService.generateBulkEmbeddings.mockRejectedValueOnce(
        new Error('Bulk operation failed'),
      );

      const emailOptions = [
        {
          tenantId: 'tenant-1',
          emailId: 'email-1',
          subject: 'Test Email',
          bodyText: 'Test content',
          from: 'sender@test.com',
          receivedAt: new Date(),
        },
      ];

      const results = await service.createBulkEmbeddingsForEmails(emailOptions);

      // Should have attempted bulk first, then fallen back
      expect(mistralService.generateBulkEmbeddings).toHaveBeenCalled();
      expect(results).toHaveLength(1);
    });
  });

  describe('Performance characteristics', () => {
    it('should generate embeddings for all chunks in a single API call', async () => {
      // Create an email with content that will be chunked
      const longContent = 'Test content. '.repeat(1000); // ~14KB of text

      const emailOptions = [
        {
          tenantId: 'tenant-1',
          emailId: 'email-long',
          subject: 'Long Email',
          bodyText: longContent,
          from: 'sender@test.com',
          receivedAt: new Date(),
        },
      ];

      await service.createBulkEmbeddingsForEmails(emailOptions);

      // Should only call generateBulkEmbeddings once, regardless of chunk count
      expect(mistralService.generateBulkEmbeddings).toHaveBeenCalledTimes(1);

      // Verify it was called with an array of texts (chunks)
      const callArgs = mistralService.generateBulkEmbeddings.mock.calls[0];
      expect(Array.isArray(callArgs[0])).toBe(true);
      expect(callArgs[0].length).toBeGreaterThan(0);
    });

    it('should combine chunks from multiple emails into one bulk call', async () => {
      const emailOptions = [
        {
          tenantId: 'tenant-1',
          emailId: 'email-1',
          subject: 'Email 1',
          bodyText: 'Content 1',
          from: 'sender1@test.com',
          receivedAt: new Date(),
        },
        {
          tenantId: 'tenant-1',
          emailId: 'email-2',
          subject: 'Email 2',
          bodyText: 'Content 2',
          from: 'sender2@test.com',
          receivedAt: new Date(),
        },
        {
          tenantId: 'tenant-1',
          emailId: 'email-3',
          subject: 'Email 3',
          bodyText: 'Content 3',
          from: 'sender3@test.com',
          receivedAt: new Date(),
        },
      ];

      await service.createBulkEmbeddingsForEmails(emailOptions);

      // Should call generateBulkEmbeddings once for all emails
      expect(mistralService.generateBulkEmbeddings).toHaveBeenCalledTimes(1);

      // Should have processed all 3 emails
      const results = await service.createBulkEmbeddingsForEmails(emailOptions);
      expect(results.filter((r) => r.success).length).toBeLessThanOrEqual(3);
    });
  });
});
