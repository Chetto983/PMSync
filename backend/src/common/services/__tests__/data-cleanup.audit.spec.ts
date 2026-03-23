import { DataCleanupService } from '../data-cleanup.service';

/**
 * Unit tests for audit retention cron (AUDIT-03)
 *
 * Proves:
 * - AUDIT-03: cleanupOldAuditLogs deletes records older than 3 years
 * - Correct date calculation (3 years back)
 * - Count of deleted records is logged and returned
 */

function createMockPrisma() {
  const stub = () => ({ deleteMany: jest.fn(), count: jest.fn() });
  return {
    auditLog: { deleteMany: jest.fn() },
    // Stubs required by DataCleanupService constructor (unused in these tests)
    agentActionFeedback: stub(),
    agentLearningProfile: stub(),
    aIMemory: stub(),
    aiConversation: stub(),
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
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
  } as any;
}

describe('DataCleanupService - cleanupOldAuditLogs (AUDIT-03)', () => {
  let service: DataCleanupService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new DataCleanupService(prisma);
  });

  it('deletes audit records older than 3 years', async () => {
    prisma.auditLog.deleteMany.mockResolvedValue({ count: 42 });

    const result = await service.cleanupOldAuditLogs();

    expect(result).toBe(42);
    expect(prisma.auditLog.deleteMany).toHaveBeenCalledTimes(1);

    const callArgs = prisma.auditLog.deleteMany.mock.calls[0][0];
    expect(callArgs.where.createdAt.lt).toBeInstanceOf(Date);
  });

  it('uses correct date calculation (3 years back from now)', async () => {
    prisma.auditLog.deleteMany.mockResolvedValue({ count: 0 });

    const beforeCall = new Date();
    beforeCall.setFullYear(beforeCall.getFullYear() - 3);

    await service.cleanupOldAuditLogs();

    const afterCall = new Date();
    afterCall.setFullYear(afterCall.getFullYear() - 3);

    const callArgs = prisma.auditLog.deleteMany.mock.calls[0][0];
    const cutoffDate: Date = callArgs.where.createdAt.lt;

    // The cutoff date should be approximately 3 years ago (within 1 second tolerance)
    expect(cutoffDate.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime() - 1000);
    expect(cutoffDate.getTime()).toBeLessThanOrEqual(afterCall.getTime() + 1000);
  });

  it('returns 0 and does not throw when Prisma fails', async () => {
    prisma.auditLog.deleteMany.mockRejectedValue(new Error('DB offline'));

    const result = await service.cleanupOldAuditLogs();

    expect(result).toBe(0);
  });
});
