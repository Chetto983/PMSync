import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { ContextService } from '../context.service';

const mockPrisma = {
  contact: {
    findUnique: jest.fn(),
  },
  accountContact: {
    findFirst: jest.fn(),
  },
  crmDeal: {
    findMany: jest.fn(),
  },
  ticket: {
    findMany: jest.fn(),
  },
  crmActivity: {
    findMany: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

describe('ContextService', () => {
  let service: ContextService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ContextService>(ContextService);
  });

  it('aggregates account, deals, tickets and activity for a contact', async () => {
    mockPrisma.contact.findUnique.mockResolvedValue({
      id: 'contact-1',
      displayName: 'Alice Ops',
      company: 'Ops Co',
      emails: [{ value: 'alice@example.com', primary: true }],
      lastInteractedAt: new Date('2026-04-01T09:00:00.000Z'),
      totalInteractions: 14,
      sentCount: 4,
      receivedCount: 10,
      isDeleted: false,
    });
    mockPrisma.accountContact.findFirst.mockResolvedValue({
      account: {
        id: 'account-1',
        name: 'Ops Co',
        website: 'https://ops.example.com',
        industry: 'Software',
      },
    });
    mockPrisma.crmDeal.findMany.mockResolvedValue([
      {
        id: 'deal-1',
        name: 'Renewal 2026',
        amount: new Prisma.Decimal('1200.50'),
        currency: 'EUR',
        stage: {
          id: 'stage-1',
          name: 'Proposal',
          color: '#009688',
          probability: 60,
        },
      },
    ]);
    mockPrisma.ticket.findMany.mockResolvedValue([
      {
        id: 'ticket-1',
        subject: 'Broken webhook',
        status: 'open',
        priority: 'high',
        createdAt: new Date('2026-03-31T08:00:00.000Z'),
      },
    ]);
    mockPrisma.crmActivity.findMany.mockResolvedValue([
      {
        id: 'act-1',
        type: 'NOTE',
        content: 'Customer asked for ETA',
        createdAt: new Date('2026-03-31T09:30:00.000Z'),
      },
    ]);

    const result = await service.getByContactId('tenant-1', 'contact-1');

    expect(result.contact).toEqual({
      id: 'contact-1',
      displayName: 'Alice Ops',
      company: 'Ops Co',
      email: 'alice@example.com',
    });
    expect(result.account?.name).toBe('Ops Co');
    expect(result.deals[0]).toMatchObject({
      id: 'deal-1',
      amount: '1200.5',
      currency: 'EUR',
    });
    expect(result.tickets[0].createdAt).toBe('2026-03-31T08:00:00.000Z');
    expect(result.recentActivities[0].createdAt).toBe('2026-03-31T09:30:00.000Z');
    expect(result.emailCount).toBe(14);
    expect(result.lastInteraction).toBe('2026-04-01T09:00:00.000Z');
  });

  it('returns null when no contact matches the email lookup', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);

    await expect(service.getByEmail('tenant-1', 'missing@example.com')).resolves.toBeNull();
  });

  it('throws not found for a deleted contact', async () => {
    mockPrisma.contact.findUnique.mockResolvedValue({
      id: 'contact-1',
      isDeleted: true,
    });

    await expect(service.getByContactId('tenant-1', 'contact-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
