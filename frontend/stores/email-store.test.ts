import { useEmailStore, Email } from './email-store';

// Suppress console logs during tests
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

// Reset store before each test
beforeEach(() => {
  useEmailStore.getState().reset();
});

const createMockEmail = (overrides: Partial<Email> = {}): Email => ({
  id: `email-${Math.random().toString(36).substr(2, 9)}`,
  providerId: 'provider-1',
  externalId: 'ext-1',
  from: 'sender@example.com',
  to: ['recipient@example.com'],
  subject: 'Test Subject',
  receivedAt: new Date().toISOString(),
  isRead: false,
  ...overrides,
});

describe('useEmailStore', () => {
  describe('initial state', () => {
    it('should have empty emails', () => {
      expect(useEmailStore.getState().emails).toEqual([]);
    });

    it('should have zero unread count', () => {
      expect(useEmailStore.getState().unreadCount).toBe(0);
    });

    it('should have no selected email', () => {
      expect(useEmailStore.getState().selectedEmail).toBeNull();
    });

    it('should not be loading', () => {
      expect(useEmailStore.getState().isLoading).toBe(false);
    });
  });

  describe('setEmails', () => {
    it('should set emails array', () => {
      const emails = [createMockEmail(), createMockEmail()];
      useEmailStore.getState().setEmails(emails);
      expect(useEmailStore.getState().emails).toEqual(emails);
    });
  });

  describe('addEmail', () => {
    it('should add email to the beginning', () => {
      const email1 = createMockEmail({ subject: 'First' });
      const email2 = createMockEmail({ subject: 'Second' });

      useEmailStore.getState().addEmail(email1);
      useEmailStore.getState().addEmail(email2);

      const { emails } = useEmailStore.getState();
      expect(emails[0].subject).toBe('Second');
      expect(emails[1].subject).toBe('First');
    });

    it('should increment unread count for unread emails', () => {
      const unreadEmail = createMockEmail({ isRead: false });
      useEmailStore.getState().addEmail(unreadEmail);
      expect(useEmailStore.getState().unreadCount).toBe(1);
    });

    it('should not increment unread count for read emails', () => {
      const readEmail = createMockEmail({ isRead: true });
      useEmailStore.getState().addEmail(readEmail);
      expect(useEmailStore.getState().unreadCount).toBe(0);
    });

    it('should prevent duplicate emails', () => {
      const email = createMockEmail();
      useEmailStore.getState().addEmail(email);
      useEmailStore.getState().addEmail(email);
      expect(useEmailStore.getState().emails).toHaveLength(1);
    });
  });

  describe('updateEmail', () => {
    it('should update existing email', () => {
      const email = createMockEmail({ subject: 'Original' });
      useEmailStore.getState().setEmails([email]);

      useEmailStore.getState().updateEmail(email.id, { subject: 'Updated' });

      const updated = useEmailStore.getState().emails[0];
      expect(updated.subject).toBe('Updated');
    });

    it('should update unread count when marking as read', () => {
      const email = createMockEmail({ isRead: false });
      useEmailStore.getState().setEmails([email]);
      useEmailStore.getState().setUnreadCount(1);

      useEmailStore.getState().updateEmail(email.id, { isRead: true });

      expect(useEmailStore.getState().unreadCount).toBe(0);
    });

    it('should update selected email if it matches', () => {
      const email = createMockEmail();
      useEmailStore.getState().setEmails([email]);
      useEmailStore.getState().setSelectedEmail(email);

      useEmailStore.getState().updateEmail(email.id, { subject: 'New Subject' });

      expect(useEmailStore.getState().selectedEmail?.subject).toBe('New Subject');
    });
  });

  describe('deleteEmail', () => {
    it('should remove email from list', () => {
      const email = createMockEmail();
      useEmailStore.getState().setEmails([email]);

      useEmailStore.getState().deleteEmail(email.id);

      expect(useEmailStore.getState().emails).toHaveLength(0);
    });

    it('should decrement unread count for unread email', () => {
      const email = createMockEmail({ isRead: false });
      useEmailStore.getState().setEmails([email]);
      useEmailStore.getState().setUnreadCount(1);

      useEmailStore.getState().deleteEmail(email.id);

      expect(useEmailStore.getState().unreadCount).toBe(0);
    });

    it('should clear selected email if deleted', () => {
      const email = createMockEmail();
      useEmailStore.getState().setEmails([email]);
      useEmailStore.getState().setSelectedEmail(email);

      useEmailStore.getState().deleteEmail(email.id);

      expect(useEmailStore.getState().selectedEmail).toBeNull();
    });
  });

  describe('multi-selection', () => {
    it('should toggle selection', () => {
      const email = createMockEmail();
      useEmailStore.getState().setEmails([email]);

      useEmailStore.getState().toggleSelection(email.id);
      expect(useEmailStore.getState().selectedIds.has(email.id)).toBe(true);

      useEmailStore.getState().toggleSelection(email.id);
      expect(useEmailStore.getState().selectedIds.has(email.id)).toBe(false);
    });

    it('should select all emails', () => {
      const emails = [createMockEmail(), createMockEmail(), createMockEmail()];
      useEmailStore.getState().setEmails(emails);

      useEmailStore.getState().selectAll();

      expect(useEmailStore.getState().selectedIds.size).toBe(3);
    });

    it('should clear selection', () => {
      const email = createMockEmail();
      useEmailStore.getState().setEmails([email]);
      useEmailStore.getState().toggleSelection(email.id);

      useEmailStore.getState().clearSelection();

      expect(useEmailStore.getState().selectedIds.size).toBe(0);
    });
  });

  describe('bulk actions', () => {
    it('should mark multiple emails as read', () => {
      const emails = [
        createMockEmail({ isRead: false }),
        createMockEmail({ isRead: false }),
        createMockEmail({ isRead: false }),
      ];
      useEmailStore.getState().setEmails(emails);
      useEmailStore.getState().setUnreadCount(3);

      useEmailStore.getState().markAsRead([emails[0].id, emails[1].id]);

      const state = useEmailStore.getState();
      expect(state.emails[0].isRead).toBe(true);
      expect(state.emails[1].isRead).toBe(true);
      expect(state.emails[2].isRead).toBe(false);
      expect(state.unreadCount).toBe(1);
    });

    it('should mark emails as starred', () => {
      const emails = [createMockEmail(), createMockEmail()];
      useEmailStore.getState().setEmails(emails);

      useEmailStore.getState().markAsStarred([emails[0].id], true);

      expect(useEmailStore.getState().emails[0].isStarred).toBe(true);
      expect(useEmailStore.getState().emails[1].isStarred).toBeUndefined();
    });

    it('should bulk delete emails', () => {
      const emails = [
        createMockEmail({ isRead: false }),
        createMockEmail({ isRead: false }),
        createMockEmail({ isRead: true }),
      ];
      useEmailStore.getState().setEmails(emails);
      useEmailStore.getState().setUnreadCount(2);

      useEmailStore.getState().bulkDelete([emails[0].id, emails[1].id]);

      const state = useEmailStore.getState();
      expect(state.emails).toHaveLength(1);
      expect(state.unreadCount).toBe(0);
    });

    it('should move emails to folder', () => {
      const emails = [createMockEmail({ folder: 'INBOX' })];
      useEmailStore.getState().setEmails(emails);

      useEmailStore.getState().moveToFolder([emails[0].id], 'ARCHIVE');

      expect(useEmailStore.getState().emails[0].folder).toBe('ARCHIVE');
    });
  });

  describe('filtering and search', () => {
    it('should set filters', () => {
      useEmailStore.getState().setFilters({ isRead: false, hasAttachments: true });
      expect(useEmailStore.getState().filters).toEqual({ isRead: false, hasAttachments: true });
    });

    it('should set search query', () => {
      useEmailStore.getState().setSearchQuery('test query');
      expect(useEmailStore.getState().searchQuery).toBe('test query');
    });

    it('should clear filters', () => {
      useEmailStore.getState().setFilters({ isRead: false });
      useEmailStore.getState().setSearchQuery('query');

      useEmailStore.getState().clearFilters();

      expect(useEmailStore.getState().filters).toEqual({});
      expect(useEmailStore.getState().searchQuery).toBe('');
    });
  });

  describe('pagination', () => {
    it('should set pagination', () => {
      useEmailStore.getState().setPagination({ page: 2, total: 100 });

      const { pagination } = useEmailStore.getState();
      expect(pagination.page).toBe(2);
      expect(pagination.total).toBe(100);
    });

    it('should load more by incrementing page', () => {
      useEmailStore.getState().loadMore();
      expect(useEmailStore.getState().pagination.page).toBe(2);
    });
  });

  describe('threads', () => {
    it('should update thread mapping', () => {
      useEmailStore.getState().updateThread('thread-1', ['email-1', 'email-2']);
      expect(useEmailStore.getState().threads.get('thread-1')).toEqual(['email-1', 'email-2']);
    });

    it('should get emails in thread', () => {
      const emails = [
        createMockEmail({ id: 'email-1', threadId: 'thread-1' }),
        createMockEmail({ id: 'email-2', threadId: 'thread-1' }),
        createMockEmail({ id: 'email-3', threadId: 'thread-2' }),
      ];
      useEmailStore.getState().setEmails(emails);
      useEmailStore.getState().updateThread('thread-1', ['email-1', 'email-2']);

      const threadEmails = useEmailStore.getState().getThreadEmails('thread-1');
      expect(threadEmails).toHaveLength(2);
    });
  });

  describe('reset', () => {
    it('should reset all state', () => {
      useEmailStore.getState().setEmails([createMockEmail()]);
      useEmailStore.getState().setUnreadCount(5);
      useEmailStore.getState().setSearchQuery('test');

      useEmailStore.getState().reset();

      const state = useEmailStore.getState();
      expect(state.emails).toEqual([]);
      expect(state.unreadCount).toBe(0);
      expect(state.searchQuery).toBe('');
      expect(state.selectedIds.size).toBe(0);
    });
  });
});
