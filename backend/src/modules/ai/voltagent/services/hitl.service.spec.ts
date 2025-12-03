import { ForbiddenException } from '@nestjs/common';
import { HitlService, PendingActionStatus } from './hitl.service';

describe('HitlService security', () => {
  const TENANT_ID = 'tenant-1';
  const ACTION_ID = 'action-1';
  const OWNER_ID = 'user-owner';
  const OTHER_ID = 'user-other';

  let prisma: any;
  let realtimeEvents: any;
  let service: HitlService;

  beforeEach(() => {
    prisma = {
      agentPendingAction: {
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
      },
      agentLearningProfile: {
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (fns: any[]) => {
        for (const fn of fns) {
          await fn;
        }
      }),
    };

    realtimeEvents = {
      emitAiActionApproved: jest.fn(),
      emitAiActionRejected: jest.fn(),
      emitAiActionCreated: jest.fn(),
      emitAiActionExecuted: jest.fn(),
      emitAiActionFailed: jest.fn(),
    };

    service = new HitlService(prisma, realtimeEvents);
  });

  it('denies access to actions owned by another user', async () => {
    prisma.agentPendingAction.findFirst.mockResolvedValue({
      id: ACTION_ID,
      tenantId: TENANT_ID,
      userId: OWNER_ID,
      status: PendingActionStatus.PENDING,
    });

    await expect(
      service.getPendingAction(TENANT_ID, ACTION_ID, {
        userId: OTHER_ID,
        role: 'user',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows owner to approve their own action', async () => {
    prisma.agentPendingAction.findFirst.mockResolvedValue({
      id: ACTION_ID,
      tenantId: TENANT_ID,
      userId: OWNER_ID,
      status: PendingActionStatus.PENDING,
      agentName: 'EmailAgent',
      actionType: 'SEND_EMAIL',
      confidence: 0.9,
      severity: 'MEDIUM',
      payload: {},
    });

    prisma.agentPendingAction.update.mockResolvedValue({});

    const result = await service.approveAction(
      TENANT_ID,
      ACTION_ID,
      OWNER_ID,
      { userId: OWNER_ID, role: 'user' },
    );

    expect(result.status).toBe(PendingActionStatus.APPROVED);
    expect(prisma.agentPendingAction.update).toHaveBeenCalledWith({
      where: { id: ACTION_ID },
      data: expect.objectContaining({ status: PendingActionStatus.APPROVED }),
    });
  });

  it('allows admin to approve another user action', async () => {
    prisma.agentPendingAction.findFirst.mockResolvedValue({
      id: ACTION_ID,
      tenantId: TENANT_ID,
      userId: OWNER_ID,
      status: PendingActionStatus.PENDING,
      agentName: 'EmailAgent',
      actionType: 'SEND_EMAIL',
      confidence: 0.9,
      severity: 'MEDIUM',
      payload: {},
    });

    prisma.agentPendingAction.update.mockResolvedValue({});

    const result = await service.approveAction(
      TENANT_ID,
      ACTION_ID,
      'admin-user',
      { userId: 'admin-user', role: 'admin' },
    );

    expect(result.status).toBe(PendingActionStatus.APPROVED);
  });
});

