import { EmailCleanupService } from './email-cleanup.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { KnowledgeBaseService } from '../../ai/services/knowledge-base.service';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

describe('EmailCleanupService', () => {
  let service: EmailCleanupService;
  const deleteMock = jest.fn();
  const findManyMock = jest.fn();
  const queryRawMock = jest.fn();
  const knowledgeMock = {
    deleteEmbeddingsForEmail: jest.fn(),
  } as unknown as KnowledgeBaseService;

  const prismaMock = {
    $queryRaw: queryRawMock,
    email: {
      delete: deleteMock,
      findMany: findManyMock,
    },
    emailAttachment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;

  const configMock = {
    get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
      if (key === 'JOBS_ENABLED') return 'true';
      if (key === 'EMAIL_HARD_DELETE_THRESHOLD_DAYS') return '30';
      return defaultValue;
    }),
  } as unknown as ConfigService;

  const storageMock = {
    deleteObjects: jest.fn().mockResolvedValue({ deleted: 0, failed: 0 }),
  } as unknown as StorageService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EmailCleanupService(prismaMock, knowledgeMock, configMock, storageMock);
  });

  it('removes duplicate emails using raw query results', async () => {
    queryRawMock.mockResolvedValue([
      { id: 'dup-1', tenantId: 'tenant-a' },
      { id: 'dup-2', tenantId: 'tenant-a' },
    ]);

    const result = await service.removeDuplicateEmails('tenant-a');

    expect(result.removed).toBe(2);
    expect(result.attachmentsFound).toBe(0);
    expect(result.s3Deleted).toBe(0);
    expect(result.s3Failed).toBe(0);
    expect(deleteMock).toHaveBeenCalledTimes(2);
    expect(knowledgeMock.deleteEmbeddingsForEmail).toHaveBeenCalledTimes(2);
    expect(queryRawMock).toHaveBeenCalledTimes(1);
    expect(storageMock.deleteObjects).not.toHaveBeenCalled();
  });

  it('purges soft deleted emails older than threshold', async () => {
    findManyMock.mockResolvedValue([
      { id: 'soft-1', tenantId: 'tenant-a' },
      { id: 'soft-2', tenantId: 'tenant-a' },
    ]);
    (prismaMock.emailAttachment.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'att-1', storagePath: 's3/a', storageType: 's3' },
    ]);
    (prismaMock.emailAttachment.findMany as jest.Mock).mockResolvedValueOnce([]);
    storageMock.deleteObjects = jest.fn().mockResolvedValue({ deleted: 1, failed: 0 });

    const result = await service.purgeSoftDeletedEmails('tenant-a', 0);

    expect(result.removed).toBe(2);
    expect(result.attachmentsFound).toBe(1);
    expect(result.s3Deleted).toBe(1);
    expect(result.s3Failed).toBe(0);
    expect(deleteMock).toHaveBeenCalledTimes(2);
    expect(knowledgeMock.deleteEmbeddingsForEmail).toHaveBeenCalledTimes(2);
    expect(findManyMock).toHaveBeenCalledTimes(1);
    expect(storageMock.deleteObjects).toHaveBeenCalledTimes(1);
    expect(storageMock.deleteObjects).toHaveBeenCalledWith(['s3/a']);
  });
});
