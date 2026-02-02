import { Test, TestingModule } from '@nestjs/testing';
import { EmbeddingCrudService } from '../embedding-crud.service';
import { PrismaService } from '../../../../prisma/prisma.service';

const mockPrismaService = {
  embedding: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
};

describe('EmbeddingCrudService', () => {
  let service: EmbeddingCrudService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingCrudService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<EmbeddingCrudService>(EmbeddingCrudService);
    prisma = module.get(PrismaService);
  });

  describe('Multi-tenant isolation', () => {
    const tenantId = 'tenant-123';

    it('listEmbeddings should filter by tenantId', async () => {
      mockPrismaService.embedding.findMany.mockResolvedValue([]);
      mockPrismaService.embedding.count.mockResolvedValue(0);

      await service.listEmbeddings(tenantId, { limit: 10, offset: 0 });

      expect(prisma.embedding.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId },
        }),
      );
      expect(prisma.embedding.count).toHaveBeenCalledWith({
        where: { tenantId },
      });
    });

    it('deleteEmbedding should verify tenant ownership', async () => {
      const embeddingId = 'emb-456';
      mockPrismaService.embedding.findFirst.mockResolvedValue({ id: embeddingId });
      mockPrismaService.embedding.deleteMany.mockResolvedValue({ count: 1 });

      await service.deleteEmbedding(tenantId, embeddingId);

      // Verifies tenant ownership via findFirst
      expect(prisma.embedding.findFirst).toHaveBeenCalledWith({
        where: { id: embeddingId, tenantId },
        select: { id: true },
      });
      // Then deletes
      expect(prisma.embedding.deleteMany).toHaveBeenCalledWith({
        where: { id: embeddingId, tenantId },
      });
    });

    it('deleteEmbeddingsForEmail should include tenantId filter', async () => {
      const emailId = 'email-789';
      mockPrismaService.embedding.deleteMany.mockResolvedValue({ count: 3 });

      const count = await service.deleteEmbeddingsForEmail(tenantId, emailId);

      // Uses emailId: { in: [...] } because it delegates to deleteEmbeddingsForEmails
      expect(prisma.embedding.deleteMany).toHaveBeenCalledWith({
        where: { tenantId, emailId: { in: [emailId] } },
      });
      expect(count).toBe(3);
    });

    it('deleteEmbeddingsForContact should include tenantId filter', async () => {
      const contactId = 'contact-abc';
      mockPrismaService.embedding.deleteMany.mockResolvedValue({ count: 2 });

      const count = await service.deleteEmbeddingsForContact(tenantId, contactId);

      expect(prisma.embedding.deleteMany).toHaveBeenCalledWith({
        where: { tenantId, contactId },
      });
      expect(count).toBe(2);
    });
  });

  describe('listEmbeddings', () => {
    it('should return paginated results with correct structure', async () => {
      const tenantId = 'tenant-123';
      const mockItems = [
        { id: 'emb-1', documentName: 'Doc 1' },
        { id: 'emb-2', documentName: 'Doc 2' },
      ];
      mockPrismaService.embedding.findMany.mockResolvedValue(mockItems);
      mockPrismaService.embedding.count.mockResolvedValue(100);

      const result = await service.listEmbeddings(tenantId, { limit: 10, offset: 20 });

      expect(result).toEqual({
        items: mockItems,
        total: 100,
        limit: 10,
        offset: 20,
      });
    });

    it('should use default pagination values', async () => {
      const tenantId = 'tenant-123';
      mockPrismaService.embedding.findMany.mockResolvedValue([]);
      mockPrismaService.embedding.count.mockResolvedValue(0);

      const result = await service.listEmbeddings(tenantId);

      expect(prisma.embedding.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 25, // Default is 25
          skip: 0,
        }),
      );
      expect(result.limit).toBe(25);
      expect(result.offset).toBe(0);
    });
  });

  describe('deleteEmbeddingsForEmails (batch)', () => {
    it('should delete embeddings for multiple emails', async () => {
      const tenantId = 'tenant-123';
      const emailIds = ['email-1', 'email-2', 'email-3'];
      mockPrismaService.embedding.deleteMany.mockResolvedValue({ count: 5 });

      const count = await service.deleteEmbeddingsForEmails(tenantId, emailIds);

      expect(prisma.embedding.deleteMany).toHaveBeenCalledWith({
        where: { tenantId, emailId: { in: emailIds } },
      });
      expect(count).toBe(5);
    });

    it('should return 0 for empty emailIds array', async () => {
      const count = await service.deleteEmbeddingsForEmails('tenant-123', []);
      expect(count).toBe(0);
      expect(prisma.embedding.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('bulkDeleteEmbeddingsByEmailIds', () => {
    const tenantId = 'tenant-123';

    it('should delete in batches when exceeding batch size', async () => {
      // Create 120 email IDs to test batching (default batch = 50)
      const emailIds = Array.from({ length: 120 }, (_, i) => `email-${i}`);
      mockPrismaService.embedding.deleteMany
        .mockResolvedValueOnce({ count: 50 })
        .mockResolvedValueOnce({ count: 50 })
        .mockResolvedValueOnce({ count: 20 });

      const count = await service.bulkDeleteEmbeddingsByEmailIds(tenantId, emailIds);

      expect(prisma.embedding.deleteMany).toHaveBeenCalledTimes(3);
      expect(count).toBe(120);
    });

    it('should respect custom batch size', async () => {
      const emailIds = Array.from({ length: 25 }, (_, i) => `email-${i}`);
      mockPrismaService.embedding.deleteMany
        .mockResolvedValueOnce({ count: 10 })
        .mockResolvedValueOnce({ count: 10 })
        .mockResolvedValueOnce({ count: 5 });

      await service.bulkDeleteEmbeddingsByEmailIds(tenantId, emailIds, 10);

      expect(prisma.embedding.deleteMany).toHaveBeenCalledTimes(3);
    });
  });

  describe('bulkDeleteEmbeddingsByContactIds', () => {
    const tenantId = 'tenant-123';

    it('should delete contact embeddings in batches', async () => {
      const contactIds = Array.from({ length: 75 }, (_, i) => `contact-${i}`);
      mockPrismaService.embedding.deleteMany
        .mockResolvedValueOnce({ count: 50 })
        .mockResolvedValueOnce({ count: 25 });

      const count = await service.bulkDeleteEmbeddingsByContactIds(tenantId, contactIds);

      expect(prisma.embedding.deleteMany).toHaveBeenCalledTimes(2);
      expect(count).toBe(75);
    });

    it('should enforce tenantId in contact deletion', async () => {
      const contactIds = ['contact-1'];
      mockPrismaService.embedding.deleteMany.mockResolvedValue({ count: 1 });

      await service.bulkDeleteEmbeddingsByContactIds(tenantId, contactIds);

      expect(prisma.embedding.deleteMany).toHaveBeenCalledWith({
        where: { tenantId, contactId: { in: contactIds } },
      });
    });
  });

  describe('Indexed field usage (O(log n) vs O(n))', () => {
    it('should use indexed emailId field, not JSONB metadata path', async () => {
      const tenantId = 'tenant-123';
      const emailId = 'email-456';
      mockPrismaService.embedding.deleteMany.mockResolvedValue({ count: 1 });

      await service.deleteEmbeddingsForEmail(tenantId, emailId);

      // Verify using direct emailId field (via { in: [...] }), NOT metadata path
      const call = prisma.embedding.deleteMany.mock.calls[0][0];
      expect(call.where.emailId).toEqual({ in: [emailId] });
      expect(call.where).not.toHaveProperty('metadata');
    });

    it('should use indexed contactId field, not JSONB metadata path', async () => {
      const tenantId = 'tenant-123';
      const contactId = 'contact-789';
      mockPrismaService.embedding.deleteMany.mockResolvedValue({ count: 1 });

      await service.deleteEmbeddingsForContact(tenantId, contactId);

      // Verify using direct contactId field, NOT metadata path
      const call = prisma.embedding.deleteMany.mock.calls[0][0];
      expect(call.where.contactId).toBe(contactId); // Uses direct value, not { in: [...] }
      expect(call.where).not.toHaveProperty('metadata');
    });
  });
});
