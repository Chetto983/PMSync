import { renderHook } from '@testing-library/react';
import { useWebSocket } from '@/hooks/use-websocket';
import { websocketClient } from '@/lib/websocket-client';
import { useEmailStore } from '@/stores/email-store';
import { useCalendarStore } from '@/stores/calendar-store';
import { useContactStore } from '@/stores/contact-store';
import { useFoldersStore } from '@/stores/folders-store';
import { useSyncStore } from '@/stores/sync-store';

// Mock all stores
jest.mock('@/stores/email-store');
jest.mock('@/stores/calendar-store');
jest.mock('@/stores/contact-store');
jest.mock('@/stores/folders-store');
jest.mock('@/stores/sync-store');

// Mock websocket client
jest.mock('@/lib/websocket-client', () => ({
  websocketClient: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    isConnected: jest.fn(),
    ping: jest.fn(),
    joinRoom: jest.fn(),
    leaveRoom: jest.fn(),
    onEmailNew: jest.fn(() => jest.fn()),
    onEmailUpdate: jest.fn(() => jest.fn()),
    onEmailDelete: jest.fn(() => jest.fn()),
    onUnreadCountUpdate: jest.fn(() => jest.fn()),
    onFolderCountsUpdate: jest.fn(() => jest.fn()),
    onThreadUpdate: jest.fn(() => jest.fn()),
    onEmailBatchProcessed: jest.fn(() => jest.fn()),
    onCalendarEventNew: jest.fn(() => jest.fn()),
    onCalendarEventUpdate: jest.fn(() => jest.fn()),
    onCalendarEventDelete: jest.fn(() => jest.fn()),
    onContactNew: jest.fn(() => jest.fn()),
    onContactUpdate: jest.fn(() => jest.fn()),
    onContactDelete: jest.fn(() => jest.fn()),
    onSyncStatus: jest.fn(() => jest.fn()),
  },
}));

describe('useWebSocket Hook - Thread Support', () => {
  const mockToken = 'mock-jwt-token';
  let mockEmailStore: any;
  let mockCalendarStore: any;
  let mockContactStore: any;
  let mockFoldersStore: any;
  let mockSyncStore: any;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Setup mock stores
    mockEmailStore = {
      addEmail: jest.fn(),
      updateEmail: jest.fn(),
      deleteEmail: jest.fn(),
      setUnreadCount: jest.fn(),
      updateThread: jest.fn(),
    };

    mockCalendarStore = {
      addEvent: jest.fn(),
      updateEvent: jest.fn(),
      deleteEvent: jest.fn(),
    };

    mockContactStore = {
      addContact: jest.fn(),
      updateContact: jest.fn(),
      deleteContact: jest.fn(),
    };

    mockFoldersStore = {
      updateFolderCounts: jest.fn(),
    };

    mockSyncStore = {
      setStatus: jest.fn(),
    };

    (useEmailStore as unknown as jest.Mock).mockReturnValue(mockEmailStore);
    (useCalendarStore as unknown as jest.Mock).mockReturnValue(mockCalendarStore);
    (useContactStore as unknown as jest.Mock).mockReturnValue(mockContactStore);
    (useFoldersStore as unknown as jest.Mock).mockReturnValue(mockFoldersStore);
    (useSyncStore as unknown as jest.Mock).mockReturnValue(mockSyncStore);

    (websocketClient.connect as jest.Mock).mockResolvedValue(undefined);
    (websocketClient.isConnected as jest.Mock).mockReturnValue(false);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('Connection Management', () => {
    it('should connect when token is provided and enabled', async () => {
      renderHook(() => useWebSocket(mockToken, true));

      expect(websocketClient.connect).toHaveBeenCalledWith(mockToken);
    });

    it('should not connect when token is null', () => {
      renderHook(() => useWebSocket(null, true));

      expect(websocketClient.connect).not.toHaveBeenCalled();
    });

    it('should not connect when disabled', () => {
      renderHook(() => useWebSocket(mockToken, false));

      expect(websocketClient.connect).not.toHaveBeenCalled();
    });

    it('should disconnect on unmount', async () => {
      const { unmount } = renderHook(() => useWebSocket(mockToken, true));

      // Wait for connection to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      unmount();

      expect(websocketClient.disconnect).toHaveBeenCalled();
    });
  });

  describe('Email Events', () => {
    it('should add email on onEmailNew', () => {
      let emailNewHandler: any;

      (websocketClient.onEmailNew as jest.Mock).mockImplementation((handler) => {
        emailNewHandler = handler;
        return jest.fn();
      });

      renderHook(() => useWebSocket(mockToken, true));

      emailNewHandler({ email: { id: 'email-1', subject: 'Hello' } });

      expect(mockEmailStore.addEmail).toHaveBeenCalledWith({ id: 'email-1', subject: 'Hello' });
    });

    it('should update unread count on onUnreadCountUpdate', () => {
      let unreadHandler: any;

      (websocketClient.onUnreadCountUpdate as jest.Mock).mockImplementation((handler) => {
        unreadHandler = handler;
        return jest.fn();
      });

      renderHook(() => useWebSocket(mockToken, true));

      unreadHandler({ count: 42 });

      expect(mockEmailStore.setUnreadCount).toHaveBeenCalledWith(42);
    });

    it('should delete email on onEmailDelete', () => {
      let deleteHandler: any;

      (websocketClient.onEmailDelete as jest.Mock).mockImplementation((handler) => {
        deleteHandler = handler;
        return jest.fn();
      });

      renderHook(() => useWebSocket(mockToken, true));

      deleteHandler({ emailId: 'email-9' });

      expect(mockEmailStore.deleteEmail).toHaveBeenCalledWith('email-9');
    });

    it('should update folder counts on onFolderCountsUpdate', () => {
      let folderCountsHandler: any;

      (websocketClient.onFolderCountsUpdate as jest.Mock).mockImplementation((handler) => {
        folderCountsHandler = handler;
        return jest.fn();
      });

      renderHook(() => useWebSocket(mockToken, true));

      folderCountsHandler({
        providerId: 'p1',
        folderId: 'INBOX',
        totalCount: 10,
        unreadCount: 4,
        folderName: 'Inbox',
      });

      expect(mockFoldersStore.updateFolderCounts).toHaveBeenCalledWith('p1', 'INBOX', {
        totalCount: 10,
        unreadCount: 4,
        folderName: 'Inbox',
      });
    });
  });

  describe('Thread Update Handler', () => {
    it('should register onThreadUpdate handler', () => {
      renderHook(() => useWebSocket(mockToken, true));

      expect(websocketClient.onThreadUpdate).toHaveBeenCalled();
    });

    it('should call updateThread when thread update event received', () => {
      let threadUpdateHandler: any;

      (websocketClient.onThreadUpdate as jest.Mock).mockImplementation((handler) => {
        threadUpdateHandler = handler;
        return jest.fn();
      });

      renderHook(() => useWebSocket(mockToken, true));

      // Simulate thread update event
      const mockThreadUpdate = {
        threadId: 'thread-123',
        emailIds: ['email-1', 'email-2', 'email-3'],
        timestamp: '2025-01-01T10:00:00Z',
      };

      threadUpdateHandler(mockThreadUpdate);

      expect(mockEmailStore.updateThread).toHaveBeenCalledWith('thread-123', ['email-1', 'email-2', 'email-3']);
    });

    it('should not call updateThread when threadId is missing', () => {
      let threadUpdateHandler: any;

      (websocketClient.onThreadUpdate as jest.Mock).mockImplementation((handler) => {
        threadUpdateHandler = handler;
        return jest.fn();
      });

      renderHook(() => useWebSocket(mockToken, true));

      const invalidUpdate = {
        emailIds: ['email-1'],
        timestamp: '2025-01-01T10:00:00Z',
      };

      threadUpdateHandler(invalidUpdate);

      expect(mockEmailStore.updateThread).not.toHaveBeenCalled();
    });

    it('should not call updateThread when emailIds is missing', () => {
      let threadUpdateHandler: any;

      (websocketClient.onThreadUpdate as jest.Mock).mockImplementation((handler) => {
        threadUpdateHandler = handler;
        return jest.fn();
      });

      renderHook(() => useWebSocket(mockToken, true));

      const invalidUpdate = {
        threadId: 'thread-123',
        timestamp: '2025-01-01T10:00:00Z',
      };

      threadUpdateHandler(invalidUpdate);

      expect(mockEmailStore.updateThread).not.toHaveBeenCalled();
    });

    it('should cleanup onThreadUpdate on unmount', () => {
      const unsubscribeMock = jest.fn();

      (websocketClient.onThreadUpdate as jest.Mock).mockReturnValue(unsubscribeMock);

      const { unmount } = renderHook(() => useWebSocket(mockToken, true));

      unmount();

      expect(unsubscribeMock).toHaveBeenCalled();
    });
  });

  describe('Batch Processed Handler', () => {
    it('should register onEmailBatchProcessed handler', () => {
      renderHook(() => useWebSocket(mockToken, true));

      expect(websocketClient.onEmailBatchProcessed).toHaveBeenCalled();
    });

    it('should update sync status when batch processed', () => {
      let batchProcessedHandler: any;

      (websocketClient.onEmailBatchProcessed as jest.Mock).mockImplementation((handler) => {
        batchProcessedHandler = handler;
        return jest.fn();
      });

      renderHook(() => useWebSocket(mockToken, true));

      const mockBatchEvent = {
        providerId: 'provider-123',
        processed: 150,
        created: 10,
        syncType: 'full' as const,
        timestamp: '2025-01-01T10:00:00Z',
      };

      batchProcessedHandler(mockBatchEvent);

      expect(mockSyncStore.setStatus).toHaveBeenCalledWith({
        providerId: 'provider-123',
        status: 'completed',
        progress: 100,
        timestamp: '2025-01-01T10:00:00Z',
      });
    });

    it('should cleanup onEmailBatchProcessed on unmount', () => {
      const unsubscribeMock = jest.fn();

      (websocketClient.onEmailBatchProcessed as jest.Mock).mockReturnValue(unsubscribeMock);

      const { unmount } = renderHook(() => useWebSocket(mockToken, true));

      unmount();

      expect(unsubscribeMock).toHaveBeenCalled();
    });
  });

  describe('Email Update Handler - Dual Format Support', () => {
    it('should handle email update with complete email object (new format)', () => {
      let emailUpdateHandler: any;

      (websocketClient.onEmailUpdate as jest.Mock).mockImplementation((handler) => {
        emailUpdateHandler = handler;
        return jest.fn();
      });

      renderHook(() => useWebSocket(mockToken, true));

      const mockUpdateWithEmail = {
        emailId: 'email-123',
        email: {
          id: 'email-123',
          subject: 'Updated Subject',
          labels: ['label-1', 'label-2'],
          emailLabels: [
            { label: { id: 'label-1', name: 'Important' } },
            { label: { id: 'label-2', name: 'Work' } },
          ],
        },
        timestamp: '2025-01-01T10:00:00Z',
      };

      emailUpdateHandler(mockUpdateWithEmail);

      expect(mockEmailStore.updateEmail).toHaveBeenCalledWith(
        'email-123',
        mockUpdateWithEmail.email
      );
    });

  });

  describe('Security Tests', () => {
    it('should handle malicious thread data safely', () => {
      let threadUpdateHandler: any;

      (websocketClient.onThreadUpdate as jest.Mock).mockImplementation((handler) => {
        threadUpdateHandler = handler;
        return jest.fn();
      });

      renderHook(() => useWebSocket(mockToken, true));

      const maliciousUpdate = {
        threadId: '<script>alert("XSS")</script>',
        emailIds: ['<img src=x onerror=alert(1)>', 'email-2'],
        timestamp: '2025-01-01T10:00:00Z',
      };

      expect(() => {
        threadUpdateHandler(maliciousUpdate);
      }).not.toThrow();

      expect(mockEmailStore.updateThread).toHaveBeenCalled();
    });

    it('should handle extremely large email arrays', () => {
      let threadUpdateHandler: any;

      (websocketClient.onThreadUpdate as jest.Mock).mockImplementation((handler) => {
        threadUpdateHandler = handler;
        return jest.fn();
      });

      renderHook(() => useWebSocket(mockToken, true));

      const largeUpdate = {
        threadId: 'thread-large',
        emailIds: Array.from({ length: 10000 }, (_, i) => `email-${i}`),
        timestamp: '2025-01-01T10:00:00Z',
      };

      expect(() => {
        threadUpdateHandler(largeUpdate);
      }).not.toThrow();

      expect(mockEmailStore.updateThread).toHaveBeenCalledWith(
        'thread-large',
        expect.arrayContaining(['email-0', 'email-9999'])
      );
    });

    it('should handle malformed timestamp', () => {
      let batchProcessedHandler: any;

      (websocketClient.onEmailBatchProcessed as jest.Mock).mockImplementation((handler) => {
        batchProcessedHandler = handler;
        return jest.fn();
      });

      renderHook(() => useWebSocket(mockToken, true));

      const malformedTimestamp = {
        providerId: 'provider-123',
        processed: 100,
        timestamp: 'not-a-valid-date',
      };

      expect(() => {
        batchProcessedHandler(malformedTimestamp);
      }).not.toThrow();
    });
  });

  describe('All Event Handlers Registration', () => {
    it('should register all email event handlers', () => {
      renderHook(() => useWebSocket(mockToken, true));

      expect(websocketClient.onEmailNew).toHaveBeenCalled();
      expect(websocketClient.onEmailUpdate).toHaveBeenCalled();
      expect(websocketClient.onEmailDelete).toHaveBeenCalled();
      expect(websocketClient.onUnreadCountUpdate).toHaveBeenCalled();
      expect(websocketClient.onFolderCountsUpdate).toHaveBeenCalled();
      expect(websocketClient.onThreadUpdate).toHaveBeenCalled();
      expect(websocketClient.onEmailBatchProcessed).toHaveBeenCalled();
    });

    it('should register all calendar event handlers', () => {
      renderHook(() => useWebSocket(mockToken, true));

      expect(websocketClient.onCalendarEventNew).toHaveBeenCalled();
      expect(websocketClient.onCalendarEventUpdate).toHaveBeenCalled();
      expect(websocketClient.onCalendarEventDelete).toHaveBeenCalled();
    });

    it('should register all contact event handlers', () => {
      renderHook(() => useWebSocket(mockToken, true));

      expect(websocketClient.onContactNew).toHaveBeenCalled();
      expect(websocketClient.onContactUpdate).toHaveBeenCalled();
      expect(websocketClient.onContactDelete).toHaveBeenCalled();
    });

    it('should register sync status handler', () => {
      renderHook(() => useWebSocket(mockToken, true));

      expect(websocketClient.onSyncStatus).toHaveBeenCalled();
    });
  });

  describe('Cleanup on Unmount', () => {
    it('should unsubscribe from all handlers on unmount', () => {
      const unsubscribeMocks = {
        emailNew: jest.fn(),
        emailUpdate: jest.fn(),
        emailDelete: jest.fn(),
        unreadCount: jest.fn(),
        folderCounts: jest.fn(),
        threadUpdate: jest.fn(),
        batchProcessed: jest.fn(),
        calendarNew: jest.fn(),
        calendarUpdate: jest.fn(),
        calendarDelete: jest.fn(),
        contactNew: jest.fn(),
        contactUpdate: jest.fn(),
        contactDelete: jest.fn(),
        syncStatus: jest.fn(),
      };

      (websocketClient.onEmailNew as jest.Mock).mockReturnValue(unsubscribeMocks.emailNew);
      (websocketClient.onEmailUpdate as jest.Mock).mockReturnValue(unsubscribeMocks.emailUpdate);
      (websocketClient.onEmailDelete as jest.Mock).mockReturnValue(unsubscribeMocks.emailDelete);
      (websocketClient.onUnreadCountUpdate as jest.Mock).mockReturnValue(unsubscribeMocks.unreadCount);
      (websocketClient.onFolderCountsUpdate as jest.Mock).mockReturnValue(unsubscribeMocks.folderCounts);
      (websocketClient.onThreadUpdate as jest.Mock).mockReturnValue(unsubscribeMocks.threadUpdate);
      (websocketClient.onEmailBatchProcessed as jest.Mock).mockReturnValue(unsubscribeMocks.batchProcessed);
      (websocketClient.onCalendarEventNew as jest.Mock).mockReturnValue(unsubscribeMocks.calendarNew);
      (websocketClient.onCalendarEventUpdate as jest.Mock).mockReturnValue(unsubscribeMocks.calendarUpdate);
      (websocketClient.onCalendarEventDelete as jest.Mock).mockReturnValue(unsubscribeMocks.calendarDelete);
      (websocketClient.onContactNew as jest.Mock).mockReturnValue(unsubscribeMocks.contactNew);
      (websocketClient.onContactUpdate as jest.Mock).mockReturnValue(unsubscribeMocks.contactUpdate);
      (websocketClient.onContactDelete as jest.Mock).mockReturnValue(unsubscribeMocks.contactDelete);
      (websocketClient.onSyncStatus as jest.Mock).mockReturnValue(unsubscribeMocks.syncStatus);

      const { unmount } = renderHook(() => useWebSocket(mockToken, true));

      unmount();

      // All unsubscribe functions should be called
      Object.values(unsubscribeMocks).forEach((unsubscribe) => {
        expect(unsubscribe).toHaveBeenCalled();
      });
    });
  });
});
