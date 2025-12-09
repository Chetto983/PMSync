import { Test, TestingModule } from '@nestjs/testing';
import { ActionExecutorService, ActionExecutionResult } from './action-executor.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { EmailSendService } from '../../../email/services/email-send.service';
import { EmailSyncBackService } from '../../../email/services/email-sync-back.service';
import { CalendarService } from '../../../calendar/services/calendar.service';
import { FolderSyncService } from '../../../email-sync/services/folder-sync.service';
import { CacheService, CacheNamespace } from '../../../../common/services/cache.service';
import { AgentAction, AgentActionType, ActionSeverity } from '../interfaces/agent-action.interface';
import { AgentContext } from '../interfaces/agent-context.interface';
import { jest,describe, it, expect,afterEach,beforeEach} from '@jest/globals';

describe('ActionExecutorService', () => {
  let service: ActionExecutorService;
  let cacheService: jest.Mocked<CacheService>;

  const createMockContext = (): AgentContext => ({
    tenantId: 'tenant-123',
    userId: 'user-456',
    userMessage: 'Test action',
    preferences: { language: 'en' },
  });

  beforeEach(async () => {
    const mockPrisma = {
      email: {
        update: jest.fn<() => Promise<{ id: string; isRead: boolean }>>().mockResolvedValue({ id: 'email-1', isRead: true }),
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
        findFirst: jest.fn<() => Promise<{ id: string; subject: string; externalId: string; providerId: string; folder: string } | null>>().mockResolvedValue({
          id: 'email-1',
          subject: 'Test Email',
          externalId: 'external-123',
          providerId: 'provider-456',
          folder: 'INBOX',
        }),
      },
      calendarEvent: {
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
      },
    };

    const mockEmailSendService = {
      sendEmail: jest.fn(),
    };

    const mockEmailSyncBackService = {
      syncOperationToProvider: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };

    const mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActionExecutorService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EmailSendService, useValue: mockEmailSendService },
        { provide: EmailSyncBackService, useValue: mockEmailSyncBackService },
        { provide: CalendarService, useValue: null },
        { provide: FolderSyncService, useValue: null },
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<ActionExecutorService>(ActionExecutorService);
    cacheService = module.get(CacheService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('idempotency', () => {
    it('should skip execution if idempotency key already exists', async () => {
      const cachedResult: ActionExecutionResult = {
        success: true,
        summary: 'Already marked as read',
        executionTimeMs: 50,
      };

      cacheService.get.mockResolvedValue(cachedResult);

      const mockAction: AgentAction = {
        type: AgentActionType.MARK_READ,
        payload: { emailId: 'email-1' },
        confidence: 0.9,
        severity: ActionSeverity.LOW,
        idempotencyKey: 'tenant-123:MARK_READ:abc123',
      };

      const result = await service.execute(mockAction, createMockContext());

      expect(result).toEqual(cachedResult);
      expect(cacheService.get).toHaveBeenCalledWith(
        mockAction.idempotencyKey,
        { namespace: CacheNamespace.ACTION_IDEMPOTENCY },
      );
      // Should not have tried to store a new result
      expect(cacheService.set).not.toHaveBeenCalled();
    });

    it('should execute and store result when idempotency key not found', async () => {
      cacheService.get.mockResolvedValue(null);
      cacheService.set.mockResolvedValue(undefined);

      const mockAction: AgentAction = {
        type: AgentActionType.MARK_READ,
        payload: { emailId: 'email-1' },
        confidence: 0.9,
        severity: ActionSeverity.LOW,
        idempotencyKey: 'tenant-123:MARK_READ:abc123',
      };

      const result = await service.execute(mockAction, createMockContext());

      expect(result.success).toBe(true);
      expect(cacheService.get).toHaveBeenCalledWith(
        mockAction.idempotencyKey,
        { namespace: CacheNamespace.ACTION_IDEMPOTENCY },
      );
      expect(cacheService.set).toHaveBeenCalledWith(
        mockAction.idempotencyKey,
        expect.objectContaining({ success: true }),
        { namespace: CacheNamespace.ACTION_IDEMPOTENCY, ttl: 300 },
      );
    });

    it('should work without idempotency key', async () => {
      const actionWithoutKey: AgentAction = {
        type: AgentActionType.MARK_READ,
        payload: { emailId: 'email-1' },
        confidence: 0.9,
        severity: ActionSeverity.LOW,
        // No idempotencyKey
      };

      const result = await service.execute(actionWithoutKey, createMockContext());

      expect(result.success).toBe(true);
      // Should not check or store idempotency
      expect(cacheService.get).not.toHaveBeenCalled();
      expect(cacheService.set).not.toHaveBeenCalled();
    });

    it('should handle cache errors gracefully', async () => {
      cacheService.get.mockRejectedValue(new Error('Redis unavailable'));

      const mockAction: AgentAction = {
        type: AgentActionType.MARK_READ,
        payload: { emailId: 'email-1' },
        confidence: 0.9,
        severity: ActionSeverity.LOW,
        idempotencyKey: 'tenant-123:MARK_READ:abc123',
      };

      // Should still execute the action even if cache check fails
      const result = await service.execute(mockAction, createMockContext());

      expect(result.success).toBe(true);
    });
  });

  describe('generateIdempotencyKey', () => {
    it('should generate consistent keys', () => {
      const key = ActionExecutorService.generateIdempotencyKey(
        'tenant-123',
        AgentActionType.SEND_EMAIL,
        'hash123',
      );

      expect(key).toBe('tenant-123:SEND_EMAIL:hash123');
    });
  });

  describe('execute', () => {
    it('should return error for unknown action type', async () => {
      const unknownAction = {
        type: 'UNKNOWN_ACTION' as AgentActionType,
        payload: {},
        confidence: 0.9,
        severity: ActionSeverity.LOW,
      };

      const result = await service.execute(unknownAction, createMockContext());

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown action type');
    });

    it('should track execution time', async () => {
      const action: AgentAction = {
        type: AgentActionType.MARK_READ,
        payload: { emailId: 'email-1' },
        confidence: 0.9,
        severity: ActionSeverity.LOW,
      };

      const result = await service.execute(action, createMockContext());

      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });
});
