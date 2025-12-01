/**
 * Tests for email query keys
 */

import { emailKeys } from './email-keys';

describe('emailKeys', () => {
  describe('all', () => {
    it('should return root key', () => {
      expect(emailKeys.all).toEqual(['emails']);
    });
  });

  describe('lists', () => {
    it('should return lists key', () => {
      expect(emailKeys.lists()).toEqual(['emails', 'list']);
    });
  });

  describe('list', () => {
    it('should return list key with empty params', () => {
      expect(emailKeys.list()).toEqual(['emails', 'list', {}]);
    });

    it('should return list key with params', () => {
      const params = { folder: 'INBOX', page: 1, limit: 50 };
      expect(emailKeys.list(params)).toEqual(['emails', 'list', params]);
    });

    it('should handle partial params', () => {
      const params = { folder: 'SENT' };
      expect(emailKeys.list(params)).toEqual(['emails', 'list', params]);
    });
  });

  describe('details', () => {
    it('should return details key', () => {
      expect(emailKeys.details()).toEqual(['emails', 'detail']);
    });
  });

  describe('detail', () => {
    it('should return detail key with id', () => {
      expect(emailKeys.detail('abc123')).toEqual(['emails', 'detail', 'abc123']);
    });

    it('should work with different id formats', () => {
      expect(emailKeys.detail('uuid-format-id')).toEqual(['emails', 'detail', 'uuid-format-id']);
    });
  });

  describe('threads', () => {
    it('should return threads key', () => {
      expect(emailKeys.threads()).toEqual(['emails', 'thread']);
    });
  });

  describe('thread', () => {
    it('should return thread key with id', () => {
      expect(emailKeys.thread('thread-123')).toEqual(['emails', 'thread', 'thread-123']);
    });
  });

  describe('conversations', () => {
    it('should return conversations key', () => {
      expect(emailKeys.conversations()).toEqual(['emails', 'conversations']);
    });
  });

  describe('conversationList', () => {
    it('should return conversation list key with empty params', () => {
      expect(emailKeys.conversationList()).toEqual(['emails', 'conversations', {}]);
    });

    it('should return conversation list key with params', () => {
      const params = { page: 1, limit: 50, folder: 'INBOX' };
      expect(emailKeys.conversationList(params)).toEqual(['emails', 'conversations', params]);
    });
  });

  describe('search', () => {
    it('should return search key', () => {
      expect(emailKeys.search()).toEqual(['emails', 'search']);
    });
  });

  describe('searchResults', () => {
    it('should return search results key with query', () => {
      expect(emailKeys.searchResults('test query')).toEqual([
        'emails',
        'search',
        { query: 'test query', providerId: undefined, limit: undefined },
      ]);
    });

    it('should return search results key with all params', () => {
      expect(emailKeys.searchResults('test', 'provider-1', 20)).toEqual([
        'emails',
        'search',
        { query: 'test', providerId: 'provider-1', limit: 20 },
      ]);
    });
  });

  describe('stats', () => {
    it('should return stats key', () => {
      expect(emailKeys.stats()).toEqual(['emails', 'stats']);
    });
  });

  describe('statsByProvider', () => {
    it('should return stats key with all as default', () => {
      expect(emailKeys.statsByProvider()).toEqual(['emails', 'stats', 'all']);
    });

    it('should return stats key with provider id', () => {
      expect(emailKeys.statsByProvider('provider-1')).toEqual(['emails', 'stats', 'provider-1']);
    });
  });

  describe('drafts', () => {
    it('should return drafts key', () => {
      expect(emailKeys.drafts()).toEqual(['emails', 'drafts']);
    });
  });

  describe('draft', () => {
    it('should return draft key with id', () => {
      expect(emailKeys.draft('draft-123')).toEqual(['emails', 'drafts', 'draft-123']);
    });
  });

  describe('syncStatus', () => {
    it('should return sync status key', () => {
      expect(emailKeys.syncStatus()).toEqual(['emails', 'sync-status']);
    });
  });

  describe('retention', () => {
    it('should return retention key', () => {
      expect(emailKeys.retention()).toEqual(['emails', 'retention']);
    });
  });

  describe('key hierarchy', () => {
    it('should have proper hierarchy for invalidation', () => {
      // All list keys should start with ['emails', 'list']
      const listKey = emailKeys.list({ folder: 'INBOX' });
      expect(listKey.slice(0, 2)).toEqual(['emails', 'list']);

      // All detail keys should start with ['emails', 'detail']
      const detailKey = emailKeys.detail('id');
      expect(detailKey.slice(0, 2)).toEqual(['emails', 'detail']);

      // Invalidating ['emails'] should invalidate all
      expect(emailKeys.all).toEqual(['emails']);
    });
  });
});
