import { AuditService, LogDataAccessInput, LogToolExecutionInput } from '../../../common/services/audit.service';

/**
 * Unit tests for expanded AuditService (AUDIT-01, AUDIT-02)
 *
 * Proves:
 * - AUDIT-01: logDataAccess creates correct records with DATA_ACCESS:{method} action
 * - AUDIT-02: logToolExecution creates correct records with AI_TOOL:{toolName} action
 * - Both methods swallow errors (fire-and-forget)
 */

function createMockPrisma() {
  return {
    auditLog: {
      create: jest.fn(),
    },
  } as any;
}

describe('AuditService', () => {
  let service: AuditService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AuditService(prisma);
  });

  describe('logDataAccess (AUDIT-01)', () => {
    it('creates record with action = DATA_ACCESS:GET and correct fields', async () => {
      prisma.auditLog.create.mockResolvedValue({});

      const input: LogDataAccessInput = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        action: 'GET',
        entity: 'EmailController',
        entityId: 'email-123',
        path: '/api/v1/emails/email-123',
        ipAddress: '10.0.0.1',
      };

      await service.logDataAccess(input);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          userId: 'user-1',
          action: 'DATA_ACCESS:GET',
          entity: 'EmailController',
          entityId: 'email-123',
          changes: { path: '/api/v1/emails/email-123' },
          ipAddress: '10.0.0.1',
        },
      });
    });

    it('creates record with action = DATA_ACCESS:POST and path in changes', async () => {
      prisma.auditLog.create.mockResolvedValue({});

      const input: LogDataAccessInput = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        action: 'POST',
        entity: 'ConsentController',
        path: '/api/v1/compliance/consent',
      };

      await service.logDataAccess(input);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          userId: 'user-1',
          action: 'DATA_ACCESS:POST',
          entity: 'ConsentController',
          entityId: 'N/A',
          changes: { path: '/api/v1/compliance/consent' },
          ipAddress: undefined,
        },
      });
    });

    it('swallows errors and does not throw on Prisma failure', async () => {
      prisma.auditLog.create.mockRejectedValue(new Error('DB connection failed'));

      // Should NOT throw
      await expect(
        service.logDataAccess({
          tenantId: 'tenant-1',
          action: 'GET',
          entity: 'Test',
          path: '/test',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('logToolExecution (AUDIT-02)', () => {
    it('creates record with action = AI_TOOL:{toolName} and agent name as entityId', async () => {
      prisma.auditLog.create.mockResolvedValue({});

      const input: LogToolExecutionInput = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        toolName: 'get_email_content',
        agentName: 'PMSync',
        inputSummary: 'emailId',
        outputSummary: '{"subject": "Meeting"}',
        durationMs: 150,
        status: 'success',
      };

      await service.logToolExecution(input);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          userId: 'user-1',
          action: 'AI_TOOL:get_email_content',
          entity: 'VoltAgent',
          entityId: 'PMSync',
          changes: {
            inputSummary: 'emailId',
            outputSummary: '{"subject": "Meeting"}',
            durationMs: 150,
            status: 'success',
          },
        },
      });
    });

    it('truncates inputSummary and outputSummary to 200 chars', async () => {
      prisma.auditLog.create.mockResolvedValue({});

      const longInput = 'A'.repeat(300);
      const longOutput = 'B'.repeat(300);

      await service.logToolExecution({
        tenantId: 'tenant-1',
        toolName: 'search_emails',
        agentName: 'PMSync',
        inputSummary: longInput,
        outputSummary: longOutput,
        durationMs: 500,
        status: 'success',
      });

      const createCall = prisma.auditLog.create.mock.calls[0][0];
      expect(createCall.data.changes.inputSummary).toHaveLength(200);
      expect(createCall.data.changes.outputSummary).toHaveLength(200);
      expect(createCall.data.changes.inputSummary).toBe('A'.repeat(200));
      expect(createCall.data.changes.outputSummary).toBe('B'.repeat(200));
    });

    it('swallows errors and does not throw on Prisma failure', async () => {
      prisma.auditLog.create.mockRejectedValue(new Error('DB write failed'));

      await expect(
        service.logToolExecution({
          tenantId: 'tenant-1',
          toolName: 'fail_tool',
          agentName: 'Agent',
          inputSummary: 'input',
          outputSummary: 'output',
          durationMs: 0,
          status: 'error',
        }),
      ).resolves.toBeUndefined();
    });
  });
});
