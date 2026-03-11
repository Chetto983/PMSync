import { useContactStore } from './contact-store';
import type { Contact } from '@/lib/api/contacts';

const makeContact = (overrides: Partial<Contact> = {}): Contact => ({
  id: 'c1',
  displayName: 'Alice',
  emails: [{ value: 'alice@test.com' }],
  company: 'ACME',
  ...overrides,
} as Contact);

beforeEach(() => {
  useContactStore.getState().reset();
});

describe('useContactStore', () => {
  describe('setContacts', () => {
    it('deduplicates by id', () => {
      const contacts = [
        makeContact({ id: 'c1', displayName: 'Alice' }),
        makeContact({ id: 'c1', displayName: 'Alice Duplicate' }),
      ];
      useContactStore.getState().setContacts(contacts);
      expect(useContactStore.getState().contacts).toHaveLength(1);
    });

    it('stores all unique contacts', () => {
      useContactStore.getState().setContacts([
        makeContact({ id: 'c1' }),
        makeContact({ id: 'c2' }),
      ]);
      expect(useContactStore.getState().contacts).toHaveLength(2);
    });
  });

  describe('addContact', () => {
    it('adds a new contact', () => {
      useContactStore.getState().addContact(makeContact({ id: 'c1' }));
      expect(useContactStore.getState().contacts).toHaveLength(1);
    });

    it('prevents duplicate ids', () => {
      useContactStore.getState().addContact(makeContact({ id: 'c1' }));
      useContactStore.getState().addContact(makeContact({ id: 'c1' }));
      expect(useContactStore.getState().contacts).toHaveLength(1);
    });
  });

  describe('updateContact', () => {
    it('updates matching contact', () => {
      useContactStore.getState().setContacts([makeContact({ id: 'c1', displayName: 'Alice' })]);
      useContactStore.getState().updateContact('c1', { displayName: 'Alice Updated' });
      expect(useContactStore.getState().contacts[0].displayName).toBe('Alice Updated');
    });
  });

  describe('deleteContact', () => {
    it('removes contact by id', () => {
      useContactStore.getState().setContacts([makeContact({ id: 'c1' })]);
      useContactStore.getState().deleteContact('c1');
      expect(useContactStore.getState().contacts).toHaveLength(0);
    });

    it('clears selectedContact if it was the deleted contact', () => {
      const contact = makeContact({ id: 'c1' });
      useContactStore.getState().setContacts([contact]);
      useContactStore.getState().setSelectedContact(contact);
      useContactStore.getState().deleteContact('c1');
      expect(useContactStore.getState().selectedContact).toBeNull();
    });

    it('removes from selectedIds Set', () => {
      useContactStore.getState().setContacts([makeContact({ id: 'c1' })]);
      useContactStore.getState().toggleSelection('c1');
      expect(useContactStore.getState().selectedIds.has('c1')).toBe(true);
      useContactStore.getState().deleteContact('c1');
      expect(useContactStore.getState().selectedIds.has('c1')).toBe(false);
    });
  });

  describe('toggleSelection', () => {
    it('adds id to selectedIds', () => {
      useContactStore.getState().toggleSelection('c1');
      expect(useContactStore.getState().selectedIds.has('c1')).toBe(true);
    });

    it('removes id when already selected', () => {
      useContactStore.getState().toggleSelection('c1');
      useContactStore.getState().toggleSelection('c1');
      expect(useContactStore.getState().selectedIds.has('c1')).toBe(false);
    });
  });

  describe('selectAll', () => {
    it('adds all contact ids to selectedIds', () => {
      useContactStore.getState().setContacts([
        makeContact({ id: 'c1' }),
        makeContact({ id: 'c2' }),
      ]);
      useContactStore.getState().selectAll();
      expect(useContactStore.getState().selectedIds.has('c1')).toBe(true);
      expect(useContactStore.getState().selectedIds.has('c2')).toBe(true);
    });
  });

  describe('bulkDelete', () => {
    it('removes multiple contacts by ids', () => {
      useContactStore.getState().setContacts([
        makeContact({ id: 'c1' }),
        makeContact({ id: 'c2' }),
        makeContact({ id: 'c3' }),
      ]);
      useContactStore.getState().bulkDelete(['c1', 'c2']);
      expect(useContactStore.getState().contacts).toHaveLength(1);
      expect(useContactStore.getState().contacts[0].id).toBe('c3');
    });

    it('clears selectedIds after bulk delete', () => {
      useContactStore.getState().setContacts([makeContact({ id: 'c1' })]);
      useContactStore.getState().toggleSelection('c1');
      useContactStore.getState().bulkDelete(['c1']);
      expect(useContactStore.getState().selectedIds.size).toBe(0);
    });
  });

  describe('searchContacts', () => {
    beforeEach(() => {
      useContactStore.getState().setContacts([
        makeContact({ id: 'c1', displayName: 'Alice Smith', emails: [{ value: 'alice@test.com' }], company: 'ACME' }),
        makeContact({ id: 'c2', displayName: 'Bob Jones', emails: [{ value: 'bob@example.com' }], company: 'Widget Co' }),
      ]);
    });

    it('matches by name', () => {
      const result = useContactStore.getState().searchContacts('alice');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('c1');
    });

    it('matches by email', () => {
      const result = useContactStore.getState().searchContacts('bob@example.com');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('c2');
    });

    it('matches by company', () => {
      const result = useContactStore.getState().searchContacts('Widget');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('c2');
    });

    it('returns empty array when no match', () => {
      const result = useContactStore.getState().searchContacts('zzznomatch');
      expect(result).toHaveLength(0);
    });
  });

  describe('loadMore', () => {
    it('increments pagination.page', () => {
      const initialPage = useContactStore.getState().pagination.page;
      useContactStore.getState().loadMore();
      expect(useContactStore.getState().pagination.page).toBe(initialPage + 1);
    });
  });
});
