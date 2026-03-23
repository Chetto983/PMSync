import { describe, expect, it, beforeEach, vi } from 'vitest';
import { DataCleanupService } from './data-cleanup.service';

function createMockPrisma() {
  const stub = () => ({
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    count: vi.fn().mockResolvedValue(0),
  });
  return {
    agentActionFeedback: stub(),
    agentLearningProfile: stub(),
    aIMemory: stub(),
    aiConversation: {
      deleteMany: vi.fn().mockResolvedValue({ count: 7 }),
      count: vi.fn().mockResolvedValue(3),
    },
    session: stub(),
    verification: stub(),
    passwordResetToken: stub(),
    trustedDevice: stub(),
    invitation: stub(),
    aiRunLedger: stub(),
    aiDraftFeedback: stub(),
    telegramLog: stub(),
    reminder: stub(),
    calendarEvent: stub(),
  } as any;
}

describe('DataCleanupService AI chat retention', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: DataCleanupService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new DataCleanupService(prisma);
  });

  it('deletes AI chat conversations older than 30 days during cleanup', async () => {
    const result = await service.cleanupExpiredData();

    expect(result.conversations).toBe(7);
    expect(prisma.aiConversation.deleteMany).toHaveBeenCalledTimes(1);

    const call = prisma.aiConversation.deleteMany.mock.calls[0][0];
    expect(call.where.updatedAt.lt).toBeInstanceOf(Date);
  });

  it('includes AI chat conversations in expired counts', async () => {
    const result = await service.getExpiredCounts();

    expect(result.conversations).toBe(3);
    expect(result.total).toBe(3);
    expect(prisma.aiConversation.count).toHaveBeenCalledTimes(1);
  });

  it('cleans expired auth records (sessions, verifications, tokens, devices, invitations)', async () => {
    prisma.session.deleteMany.mockResolvedValue({ count: 5 });
    prisma.verification.deleteMany.mockResolvedValue({ count: 2 });
    prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 1 });
    prisma.trustedDevice.deleteMany.mockResolvedValue({ count: 3 });
    prisma.invitation.deleteMany.mockResolvedValue({ count: 4 });

    const result = await service.cleanupExpiredData();

    expect(result.sessions).toBe(5);
    expect(result.verifications).toBe(2);
    expect(result.resetTokens).toBe(1);
    expect(result.trustedDevices).toBe(3);
    expect(result.invitations).toBe(4);
  });

  it('cleans retention-based records (aiRunLedger, aiDraftFeedback, telegramLogs, reminders, calendarEvents)', async () => {
    prisma.aiRunLedger.deleteMany.mockResolvedValue({ count: 10 });
    prisma.aiDraftFeedback.deleteMany.mockResolvedValue({ count: 6 });
    prisma.telegramLog.deleteMany.mockResolvedValue({ count: 8 });
    prisma.reminder.deleteMany.mockResolvedValue({ count: 3 });
    prisma.calendarEvent.deleteMany.mockResolvedValue({ count: 2 });

    const result = await service.cleanupExpiredData();

    expect(result.aiRunLedger).toBe(10);
    expect(result.aiDraftFeedback).toBe(6);
    expect(result.telegramLogs).toBe(8);
    expect(result.reminders).toBe(3);
    expect(result.calendarEvents).toBe(2);
  });

  it('includes all new counts in getExpiredCounts', async () => {
    prisma.session.count.mockResolvedValue(2);
    prisma.verification.count.mockResolvedValue(1);
    prisma.passwordResetToken.count.mockResolvedValue(3);
    prisma.trustedDevice.count.mockResolvedValue(1);
    prisma.invitation.count.mockResolvedValue(2);
    prisma.aiRunLedger.count.mockResolvedValue(5);
    prisma.aiDraftFeedback.count.mockResolvedValue(4);
    prisma.telegramLog.count.mockResolvedValue(6);
    prisma.reminder.count.mockResolvedValue(2);
    prisma.calendarEvent.count.mockResolvedValue(1);

    const result = await service.getExpiredCounts();

    expect(result.sessions).toBe(2);
    expect(result.verifications).toBe(1);
    expect(result.resetTokens).toBe(3);
    expect(result.trustedDevices).toBe(1);
    expect(result.invitations).toBe(2);
    expect(result.aiRunLedger).toBe(5);
    expect(result.aiDraftFeedback).toBe(4);
    expect(result.telegramLogs).toBe(6);
    expect(result.reminders).toBe(2);
    expect(result.calendarEvents).toBe(1);
    expect(result.total).toBe(3 + 2 + 1 + 3 + 1 + 2 + 5 + 4 + 6 + 2 + 1); // conversations=3 + all new
  });
});
