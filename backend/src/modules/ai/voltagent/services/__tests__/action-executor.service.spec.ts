import { Test, TestingModule } from '@nestjs/testing';
import { ActionExecutorService, ActionExecutionResult } from '../action-executor.service';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { EmailSendService } from '../../../../email/services/email-send.service';
import { EmailSyncBackService } from '../../../../email/services/email-sync-back.service';
import { CalendarService } from '../../../../calendar/services/calendar.service';
import { FolderSyncService } from '../../../../email-sync/services/folder-sync.service';
import { BulkOperationsQueueService } from '../../../../email-sync/services/bulk-operations-queue.service';
import { CacheService } from '../../../../../common/services/cache.service';
import { PiiResolutionService } from '../../../guards';
import { AgentAction, AgentActionType } from '../../interfaces/agent-action.interface';
import { AgentContext } from '../../interfaces/agent-context.interface';

// Mock services
const mockPrismaService = {
  providerConfig: {
    findFirst: jest.fn(),
  },
};

const mockEmailSendService = {
  sendEmail: jest.fn(),
};

const mockEmailSyncBackService = {
  deleteEmail: jest.fn(),
  archiveEmail: jest.fn(),
  updateFlags: jest.fn(),
};

const mockCalendarService = {
  createEvent: jest.fn(),
  updateEvent: jest.fn(),
  deleteEvent: jest.fn(),
  getEvents: jest.fn(),
  checkAvailability: jest.fn(),
};

const mockFolderSyncService = {
  createFolder: jest.fn(),
  renameFolder: jest.fn(),
  deleteFolder: jest.fn(),
};

const mockBulkOperationsQueue = {
  enqueueBulkDelete: jest.fn(),
  enqueueBulkArchive: jest.fn(),
  enqueueBulkMarkRead: jest.fn(),
  enqueueBulkMove: jest.fn(),
};

const mockCacheService = {
  get: jest.fn(),
  set: jest.fn(),
};

const mockPiiResolutionService = {
  resolvePayload: jest.fn((_, __, payload) => Promise.resolve(payload)),
};

describe('ActionExecutorService', () => {
  let service: ActionExecutorService;
  let emailSendService: typeof mockEmailSendService;
  let emailSyncBackService: typeof mockEmailSyncBackService;
  let calendarService: typeof mockCalendarService;
  let folderSyncService: typeof mockFolderSyncService;
  let bulkOperationsQueue: typeof mockBulkOperationsQueue;

  // Test context and action helpers
  const createContext = (overrides?: Partial<AgentContext>): AgentContext => ({
    tenantId: 'tenant-123',
    userId: 'user-456',
    sessionId: 'session-789',
    correlationId: 'corr-abc',
    locale: 'en',
    ...overrides,
  });

  const createAction = <T extends AgentActionType>(
    type: T,
    payload: Record<string, unknown>,
    overrides?: Partial<AgentAction>,
  ): AgentAction => ({
    type,
    payload,
    reasoning: 'Test action',
    confidence: 0.9,
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActionExecutorService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EmailSendService, useValue: mockEmailSendService },
        { provide: EmailSyncBackService, useValue: mockEmailSyncBackService },
        { provide: CalendarService, useValue: mockCalendarService },
        { provide: FolderSyncService, useValue: mockFolderSyncService },
        { provide: BulkOperationsQueueService, useValue: mockBulkOperationsQueue },
        { provide: CacheService, useValue: mockCacheService },
        { provide: PiiResolutionService, useValue: mockPiiResolutionService },
      ],
    }).compile();

    service = module.get<ActionExecutorService>(ActionExecutorService);
    emailSendService = module.get(EmailSendService);
    emailSyncBackService = module.get(EmailSyncBackService);
    calendarService = module.get(CalendarService);
    folderSyncService = module.get(FolderSyncService);
    bulkOperationsQueue = module.get(BulkOperationsQueueService);
  });

  describe('Email Actions', () => {
    it('should dispatch SEND_EMAIL to EmailExecutor', async () => {
      const action = createAction(AgentActionType.SEND_EMAIL, {
        to: ['test@example.com'],
        subject: 'Test Email',
        body: 'Test body',
      });
      const context = createContext();

      mockEmailSendService.sendEmail.mockResolvedValue({
        id: 'email-123',
        messageId: 'msg-123',
      });

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(emailSendService.sendEmail).toHaveBeenCalled();
    });

    it('should dispatch ARCHIVE_EMAIL to EmailExecutor', async () => {
      const action = createAction(AgentActionType.ARCHIVE_EMAIL, {
        emailId: 'email-123',
      });
      const context = createContext();

      mockEmailSyncBackService.archiveEmail.mockResolvedValue({ success: true });

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
      expect(emailSyncBackService.archiveEmail).toHaveBeenCalled();
    });

    it('should dispatch DELETE_EMAIL to EmailExecutor', async () => {
      const action = createAction(AgentActionType.DELETE_EMAIL, {
        emailId: 'email-123',
      });
      const context = createContext();

      mockEmailSyncBackService.deleteEmail.mockResolvedValue({ success: true });

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
      expect(emailSyncBackService.deleteEmail).toHaveBeenCalled();
    });

    it('should dispatch MARK_READ to EmailExecutor', async () => {
      const action = createAction(AgentActionType.MARK_READ, {
        emailId: 'email-123',
      });
      const context = createContext();

      mockEmailSyncBackService.updateFlags.mockResolvedValue({ success: true });

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
      expect(emailSyncBackService.updateFlags).toHaveBeenCalled();
    });
  });

  describe('Calendar Actions', () => {
    it('should dispatch CREATE_EVENT to CalendarExecutor', async () => {
      const action = createAction(AgentActionType.CREATE_EVENT, {
        title: 'Test Meeting',
        startTime: '2026-03-01T10:00:00Z',
        endTime: '2026-03-01T11:00:00Z',
      });
      const context = createContext();

      mockCalendarService.createEvent.mockResolvedValue({
        id: 'event-123',
        title: 'Test Meeting',
      });

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
      expect(calendarService.createEvent).toHaveBeenCalled();
    });

    it('should dispatch UPDATE_EVENT to CalendarExecutor', async () => {
      const action = createAction(AgentActionType.UPDATE_EVENT, {
        eventId: 'event-123',
        title: 'Updated Meeting',
      });
      const context = createContext();

      mockCalendarService.updateEvent.mockResolvedValue({
        id: 'event-123',
        title: 'Updated Meeting',
      });

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
      expect(calendarService.updateEvent).toHaveBeenCalled();
    });

    it('should dispatch DELETE_EVENT to CalendarExecutor', async () => {
      const action = createAction(AgentActionType.DELETE_EVENT, {
        eventId: 'event-123',
      });
      const context = createContext();

      mockCalendarService.deleteEvent.mockResolvedValue({ success: true });

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
      expect(calendarService.deleteEvent).toHaveBeenCalled();
    });

    it('should dispatch CHECK_AVAILABILITY to CalendarExecutor', async () => {
      const action = createAction(AgentActionType.CHECK_AVAILABILITY, {
        startTime: '2026-03-01T10:00:00Z',
        endTime: '2026-03-01T11:00:00Z',
      });
      const context = createContext();

      mockCalendarService.checkAvailability.mockResolvedValue({
        available: true,
        conflicts: [],
      });

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
      expect(calendarService.checkAvailability).toHaveBeenCalled();
    });
  });

  describe('Contact Actions', () => {
    it('should dispatch CREATE_CONTACT to ContactExecutor', async () => {
      const action = createAction(AgentActionType.CREATE_CONTACT, {
        displayName: 'John Doe',
        email: 'john@example.com',
      });
      const context = createContext();

      mockPrismaService.providerConfig.findFirst.mockResolvedValue({
        id: 'provider-123',
      });

      const result = await service.execute(action, context);

      // Contact executor uses Prisma directly
      expect(result.success).toBe(true);
    });

    it('should dispatch UPDATE_CONTACT to ContactExecutor', async () => {
      const action = createAction(AgentActionType.UPDATE_CONTACT, {
        contactId: 'contact-123',
        displayName: 'Jane Doe',
      });
      const context = createContext();

      const result = await service.execute(action, context);

      // Contact executor uses Prisma directly
      expect(result.success).toBe(true);
    });

    it('should dispatch DELETE_CONTACT to ContactExecutor', async () => {
      const action = createAction(AgentActionType.DELETE_CONTACT, {
        contactId: 'contact-123',
      });
      const context = createContext();

      const result = await service.execute(action, context);

      // Contact executor uses Prisma directly
      expect(result.success).toBe(true);
    });
  });

  describe('Folder Actions', () => {
    it('should dispatch CREATE_FOLDER to FolderExecutor', async () => {
      const action = createAction(AgentActionType.CREATE_FOLDER, {
        name: 'Important',
      });
      const context = createContext();

      mockFolderSyncService.createFolder.mockResolvedValue({
        id: 'folder-123',
        name: 'Important',
      });

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
      expect(folderSyncService.createFolder).toHaveBeenCalled();
    });

    it('should dispatch RENAME_FOLDER to FolderExecutor', async () => {
      const action = createAction(AgentActionType.RENAME_FOLDER, {
        folderId: 'folder-123',
        newName: 'Very Important',
      });
      const context = createContext();

      mockFolderSyncService.renameFolder.mockResolvedValue({
        id: 'folder-123',
        name: 'Very Important',
      });

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
      expect(folderSyncService.renameFolder).toHaveBeenCalled();
    });

    it('should dispatch DELETE_FOLDER to FolderExecutor', async () => {
      const action = createAction(AgentActionType.DELETE_FOLDER, {
        folderId: 'folder-123',
      });
      const context = createContext();

      mockFolderSyncService.deleteFolder.mockResolvedValue({ success: true });

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
      expect(folderSyncService.deleteFolder).toHaveBeenCalled();
    });
  });

  describe('Bulk Email Actions', () => {
    it('should dispatch BULK_DELETE_EMAILS to BulkEmailExecutor', async () => {
      const action = createAction(AgentActionType.BULK_DELETE_EMAILS, {
        emailIds: ['email-1', 'email-2', 'email-3'],
      });
      const context = createContext();

      mockBulkOperationsQueue.enqueueBulkDelete.mockResolvedValue({
        jobId: 'job-123',
      });

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
      expect(bulkOperationsQueue.enqueueBulkDelete).toHaveBeenCalled();
    });

    it('should dispatch BULK_ARCHIVE_EMAILS to BulkEmailExecutor', async () => {
      const action = createAction(AgentActionType.BULK_ARCHIVE_EMAILS, {
        emailIds: ['email-1', 'email-2'],
      });
      const context = createContext();

      mockBulkOperationsQueue.enqueueBulkArchive.mockResolvedValue({
        jobId: 'job-456',
      });

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
      expect(bulkOperationsQueue.enqueueBulkArchive).toHaveBeenCalled();
    });

    it('should dispatch BULK_MARK_READ to BulkEmailExecutor', async () => {
      const action = createAction(AgentActionType.BULK_MARK_READ, {
        emailIds: ['email-1', 'email-2'],
      });
      const context = createContext();

      mockBulkOperationsQueue.enqueueBulkMarkRead.mockResolvedValue({
        jobId: 'job-789',
      });

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
      expect(bulkOperationsQueue.enqueueBulkMarkRead).toHaveBeenCalled();
    });
  });

  describe('Unknown Action Type Handling', () => {
    it('should return error result for unknown action type without throwing', async () => {
      const action = createAction('UNKNOWN_ACTION' as AgentActionType, {});
      const context = createContext();

      const result = await service.execute(action, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown action type');
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Executor Failure Handling', () => {
    it('should catch and return error result when executor throws', async () => {
      const action = createAction(AgentActionType.SEND_EMAIL, {
        to: ['test@example.com'],
        subject: 'Test',
        body: 'Test',
      });
      const context = createContext();

      const expectedError = new Error('Email service unavailable');
      mockEmailSendService.sendEmail.mockRejectedValue(expectedError);

      const result = await service.execute(action, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe(expectedError.message);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle non-Error exceptions gracefully', async () => {
      const action = createAction(AgentActionType.CREATE_EVENT, {
        title: 'Test',
        startTime: '2026-03-01T10:00:00Z',
        endTime: '2026-03-01T11:00:00Z',
      });
      const context = createContext();

      mockCalendarService.createEvent.mockRejectedValue('String error');

      const result = await service.execute(action, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('String error');
    });
  });

  describe('Result Format Validation', () => {
    it('should return ActionExecutionResult with required fields on success', async () => {
      const action = createAction(AgentActionType.CREATE_FOLDER, {
        name: 'Test Folder',
      });
      const context = createContext();

      mockFolderSyncService.createFolder.mockResolvedValue({
        id: 'folder-123',
        name: 'Test Folder',
      });

      const result = await service.execute(action, context);

      // Verify interface compliance
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('executionTimeMs');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.executionTimeMs).toBe('number');
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should return ActionExecutionResult with required fields on error', async () => {
      const action = createAction(AgentActionType.DELETE_EVENT, {
        eventId: 'nonexistent',
      });
      const context = createContext();

      mockCalendarService.deleteEvent.mockRejectedValue(
        new Error('Event not found'),
      );

      const result = await service.execute(action, context);

      // Verify interface compliance
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('executionTimeMs');
      expect(result.success).toBe(false);
      expect(typeof result.error).toBe('string');
      expect(typeof result.executionTimeMs).toBe('number');
    });

    it('should include optional data and summary fields when available', async () => {
      const action = createAction(AgentActionType.SEND_EMAIL, {
        to: ['test@example.com'],
        subject: 'Test',
        body: 'Test body',
      });
      const context = createContext();

      mockEmailSendService.sendEmail.mockResolvedValue({
        id: 'email-123',
        messageId: 'msg-123',
      });

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
      // Data or summary may be present
      if (result.data) {
        expect(typeof result.data).toBe('object');
      }
      if (result.summary) {
        expect(typeof result.summary === 'string' || Array.isArray(result.summary)).toBe(true);
      }
    });
  });

  describe('Idempotency Support', () => {
    it('should skip execution if idempotency key already exists', async () => {
      const action = createAction(AgentActionType.SEND_EMAIL, {
        to: ['test@example.com'],
        subject: 'Test',
        body: 'Test',
      }, {
        idempotencyKey: 'unique-key-123',
      });
      const context = createContext();

      const cachedResult: ActionExecutionResult = {
        success: true,
        summary: 'Email already sent',
        executionTimeMs: 100,
      };

      mockCacheService.get.mockResolvedValue(cachedResult);

      const result = await service.execute(action, context);

      expect(result).toEqual(cachedResult);
      expect(emailSendService.sendEmail).not.toHaveBeenCalled();
    });

    it('should store result with idempotency key on success', async () => {
      const action = createAction(AgentActionType.CREATE_FOLDER, {
        name: 'Test',
      }, {
        idempotencyKey: 'folder-create-123',
      });
      const context = createContext();

      mockFolderSyncService.createFolder.mockResolvedValue({
        id: 'folder-123',
        name: 'Test',
      });
      mockCacheService.get.mockResolvedValue(null);

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
      expect(mockCacheService.set).toHaveBeenCalledWith(
        'folder-create-123',
        expect.objectContaining({
          success: true,
          executionTimeMs: expect.any(Number),
        }),
        expect.any(Object),
      );
    });
  });
});
