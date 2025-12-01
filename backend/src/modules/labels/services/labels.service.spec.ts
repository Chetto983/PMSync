import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LabelsService } from './labels.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailsService } from '../../email/services/emails.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';

const createPrismaMock = () => ({
  userLabel: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    aggregate: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
  email: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  emailLabel: {
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn().mockResolvedValue(undefined),
});

describe('LabelsService', () => {
  let service: LabelsService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    prisma = createPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LabelsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: EmailsService,
          useValue: {
            updateEmailsLabels: jest.fn(),
          },
        },
        {
          provide: RealtimeEventsService,
          useValue: {
            emitLabelNew: jest.fn(),
            emitLabelUpdate: jest.fn(),
            emitLabelDelete: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<LabelsService>(LabelsService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAllByTenant should filter archived labels', async () => {
    const mockLabels = [{ id: 'label-1', tenantId: 'tenant-1', isArchived: false }];
    prisma.userLabel.findMany.mockResolvedValue(mockLabels as any);

    const result = await service.findAllByTenant('tenant-1');

    expect(result).toBe(mockLabels as any);
    expect(prisma.userLabel.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', isArchived: false },
      include: expect.objectContaining({
        children: expect.any(Object),
        _count: expect.any(Object),
      }),
      orderBy: [{ parentId: 'asc' }, { orderIndex: 'asc' }],
    });
  });

  it('create should generate slug and next order index', async () => {
    prisma.userLabel.findUnique.mockResolvedValueOnce(null);
    prisma.userLabel.aggregate.mockResolvedValue({ _max: { orderIndex: 1 } });

    const created = { id: 'label-1', slug: 'test-label' };
    prisma.userLabel.create.mockResolvedValue(created as any);

    const result = await service.create('tenant-1', { name: 'Test Label' });

    expect(result).toBe(created as any);
    expect(prisma.userLabel.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        slug: 'test-label',
        orderIndex: 2,
      }),
      include: expect.any(Object),
    });
  });

  it('reorder should throw if no label ids are provided', async () => {
    await expect(service.reorder('tenant-1', { labelIds: [] })).rejects.toThrow(
      BadRequestException,
    );
  });
});
