import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FollowUpStatus } from '@prisma/client';

import { TasksController } from '../tasks.controller';
import { TasksAggregationService } from '../../services/tasks-aggregation.service';
import { ManualTaskService } from '../../services/manual-task.service';
import { SmartViewService } from '../../services/smart-view.service';
import { PrismaService } from '../../../../prisma/prisma.service';

/**
 * Phase 145.1 — Tests for PATCH /tasks/:sourceType/:id/snooze.
 *
 * Covers the behaviors spec'd in Task 3:
 *   - Manual tasks snooze via ManualTaskService.update (dueDate passthrough).
 *   - Follow-ups snooze via prisma.emailFollowUp.updateMany (tenant + user + status guard).
 *   - Reminders snooze via prisma.reminder.update after tenant check.
 *   - deal_action / ticket -> BadRequestException.
 *   - Past dueDate -> BadRequestException.
 *   - Invalid sourceType -> BadRequestException.
 *   - Not found -> NotFoundException.
 */

const req = {
  user: { id: 'user-1', tenantId: 'tenant-1' },
} as const;

function futureIso(): string {
  return new Date(Date.now() + 86400_000).toISOString();
}

describe('TasksController.snooze', () => {
  let controller: TasksController;
  let mockPrisma: {
    emailFollowUp: { updateMany: jest.Mock };
    reminder: { findUnique: jest.Mock; update: jest.Mock };
  };
  let mockManualTaskService: { update: jest.Mock };
  let mockAggregationService: TasksAggregationService;

  beforeEach(async () => {
    mockPrisma = {
      emailFollowUp: { updateMany: jest.fn() },
      reminder: { findUnique: jest.fn(), update: jest.fn() },
    };
    mockManualTaskService = { update: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        TasksAggregationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ManualTaskService, useValue: mockManualTaskService },
        { provide: SmartViewService, useValue: {} as unknown as SmartViewService },
      ],
    }).compile();

    controller = module.get<TasksController>(TasksController);
    mockAggregationService = module.get<TasksAggregationService>(
      TasksAggregationService,
    );
  });

  it('snoozes manual task with valid future date', async () => {
    mockManualTaskService.update.mockResolvedValue({ id: 't-1' });
    const dueDate = futureIso();

    const result = await controller.snooze(
      req as never,
      'manual',
      't-1',
      { dueDate },
    );

    expect(result).toEqual({ success: true, dueDate });
    expect(mockManualTaskService.update).toHaveBeenCalledWith(
      'tenant-1',
      't-1',
      { dueDate },
    );
  });

  it('snoozes follow_up task via emailFollowUp.updateMany with tenant+user+status guard', async () => {
    mockPrisma.emailFollowUp.updateMany.mockResolvedValue({ count: 1 });
    const dueDate = futureIso();

    const result = await controller.snooze(
      req as never,
      'follow_up',
      'fu-1',
      { dueDate },
    );

    expect(result).toEqual({ success: true, dueDate });
    expect(mockPrisma.emailFollowUp.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'fu-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        status: { in: [FollowUpStatus.PENDING, FollowUpStatus.REMINDED] },
      },
      data: expect.objectContaining({
        dueDate: expect.any(Date),
        status: FollowUpStatus.PENDING,
        remindCount: 0,
      }),
    });
  });

  it('snoozes reminder with tenant guard', async () => {
    mockPrisma.reminder.findUnique.mockResolvedValue({
      id: 'rem-1',
      tenantId: 'tenant-1',
    });
    mockPrisma.reminder.update.mockResolvedValue({ id: 'rem-1' });
    const dueDate = futureIso();

    const result = await controller.snooze(
      req as never,
      'reminder',
      'rem-1',
      { dueDate },
    );

    expect(result).toEqual({ success: true, dueDate });
    expect(mockPrisma.reminder.findUnique).toHaveBeenCalledWith({
      where: { id: 'rem-1' },
    });
    expect(mockPrisma.reminder.update).toHaveBeenCalledWith({
      where: { id: 'rem-1' },
      data: { dueDate: expect.any(Date) },
    });
  });

  it('rejects past dueDate with BadRequestException', async () => {
    await expect(
      controller.snooze(
        req as never,
        'manual',
        't-1',
        { dueDate: '2020-01-01T00:00:00.000Z' },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(mockManualTaskService.update).not.toHaveBeenCalled();
  });

  it('rejects invalid sourceType with BadRequestException', async () => {
    await expect(
      controller.snooze(
        req as never,
        'bogus' as never,
        't-1',
        { dueDate: futureIso() },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(mockManualTaskService.update).not.toHaveBeenCalled();
  });

  it('rejects deal_action sourceType with BadRequestException', async () => {
    await expect(
      controller.snooze(
        req as never,
        'deal_action',
        'nba-1',
        { dueDate: futureIso() },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects ticket sourceType with BadRequestException', async () => {
    await expect(
      controller.snooze(
        req as never,
        'ticket',
        'tkt-1',
        { dueDate: futureIso() },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException when follow_up is missing or already resolved', async () => {
    mockPrisma.emailFollowUp.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      controller.snooze(
        req as never,
        'follow_up',
        'missing-fu',
        { dueDate: futureIso() },
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when manual task update rejects as not found', async () => {
    mockManualTaskService.update.mockRejectedValue(
      new NotFoundException('ManualTask t-x not found'),
    );
    await expect(
      controller.snooze(
        req as never,
        'manual',
        't-x',
        { dueDate: futureIso() },
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when reminder belongs to different tenant', async () => {
    mockPrisma.reminder.findUnique.mockResolvedValue({
      id: 'rem-2',
      tenantId: 'other-tenant',
    });
    await expect(
      controller.snooze(
        req as never,
        'reminder',
        'rem-2',
        { dueDate: futureIso() },
      ),
    ).rejects.toThrow(NotFoundException);
    expect(mockPrisma.reminder.update).not.toHaveBeenCalled();
  });

  // Keep reference to mockAggregationService just so it's imported correctly
  // and stays in scope — we exercise it indirectly via controller -> service.
  it('aggregation service wire-up is present', () => {
    expect(mockAggregationService).toBeDefined();
  });
});
