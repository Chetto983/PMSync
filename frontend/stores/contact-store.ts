import { create } from 'zustand';
import type { Contact } from '@/lib/api/contacts';

/**
 * Pagination state for contacts
 */
export interface ContactPaginationState {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

/**
 * Filter options for contacts
 */
export interface ContactFilters {
  providerId?: string;
  hasEmail?: boolean;
  hasPhone?: boolean;
  company?: string;
}

interface ContactState {
  contacts: Contact[];
  selectedContact: Contact | null;
  isLoading: boolean;
  searchQuery: string;

  // Pagination
  pagination: ContactPaginationState;

  // Multi-selection
  selectedIds: Set<string>;

  // Filters
  filters: ContactFilters;

  // Actions - Contact management
  setContacts: (contacts: Contact[]) => void;
  appendContacts: (contacts: Contact[]) => void;
  addContact: (contact: Contact) => void;
  updateContact: (id: string, updates: Partial<Contact>) => void;
  deleteContact: (id: string) => void;
  setSelectedContact: (contact: Contact | null) => void;
  setLoading: (loading: boolean) => void;
  setSearchQuery: (query: string) => void;

  // Actions - Pagination
  setPagination: (pagination: Partial<ContactPaginationState>) => void;
  loadMore: () => void;

  // Actions - Multi-selection
  toggleSelection: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setSelectedIds: (ids: Set<string>) => void;

  // Actions - Bulk operations
  bulkDelete: (ids: string[]) => void;

  // Actions - Filters
  setFilters: (filters: ContactFilters) => void;
  clearFilters: () => void;

  // Queries
  searchContacts: (query: string) => Contact[];
  getContactByEmail: (email: string) => Contact | undefined;

  // Reset
  reset: () => void;
}

export const useContactStore = create<ContactState>((set, get) => ({
  contacts: [],
  selectedContact: null,
  isLoading: false,
  searchQuery: '',
  pagination: {
    page: 1,
    pageSize: 50,
    total: 0,
    hasMore: false,
  },
  selectedIds: new Set<string>(),
  filters: {},

  setContacts: (contacts) => {
    const map = new Map<string, Contact>();
    contacts.forEach((c) => map.set(c.id, c));
    set({ contacts: Array.from(map.values()) });
  },

  appendContacts: (newContacts) =>
    set((state) => {
      // Filter out duplicates
      const existingIds = new Set(state.contacts.map((c) => c.id));
      const uniqueNewContacts = newContacts.filter((c) => !existingIds.has(c.id));
      return {
        contacts: [...state.contacts, ...uniqueNewContacts],
      };
    }),

  addContact: (contact) =>
    set((state) => {
      // Prevent duplicates
      if (state.contacts.some((c) => c.id === contact.id)) {
        return state;
      }
      return {
        contacts: [contact, ...state.contacts],
      };
    }),

  updateContact: (id, updates) =>
    set((state) => {
      const contactIndex = state.contacts.findIndex((c) => c.id === id);
      if (contactIndex === -1) {
        // If updates include enough info to add, upsert it
        if ((updates as Contact).id === id) {
          return {
            contacts: [...state.contacts, updates as Contact],
          };
        }
        return state;
      }

      const newContacts = [...state.contacts];
      newContacts[contactIndex] = { ...newContacts[contactIndex], ...updates };

      return {
        contacts: newContacts,
        selectedContact:
          state.selectedContact?.id === id ? newContacts[contactIndex] : state.selectedContact,
      };
    }),

  deleteContact: (id) =>
    set((state) => ({
      contacts: state.contacts.filter((c) => c.id !== id),
      selectedContact: state.selectedContact?.id === id ? null : state.selectedContact,
      selectedIds: (() => {
        const newSet = new Set(state.selectedIds);
        newSet.delete(id);
        return newSet;
      })(),
    })),

  setSelectedContact: (contact) => set({ selectedContact: contact }),

  setLoading: (loading) => set({ isLoading: loading }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  // Pagination
  setPagination: (pagination) =>
    set((state) => ({
      pagination: { ...state.pagination, ...pagination },
    })),

  loadMore: () =>
    set((state) => ({
      pagination: { ...state.pagination, page: state.pagination.page + 1 },
    })),

  // Multi-selection
  toggleSelection: (id) =>
    set((state) => {
      const newSelectedIds = new Set(state.selectedIds);
      if (newSelectedIds.has(id)) {
        newSelectedIds.delete(id);
      } else {
        newSelectedIds.add(id);
      }
      return { selectedIds: newSelectedIds };
    }),

  selectAll: () =>
    set((state) => ({
      selectedIds: new Set(state.contacts.map((c) => c.id)),
    })),

  clearSelection: () => set({ selectedIds: new Set<string>() }),

  setSelectedIds: (ids) => set({ selectedIds: ids }),

  // Bulk operations
  bulkDelete: (ids) =>
    set((state) => ({
      contacts: state.contacts.filter((c) => !ids.includes(c.id)),
      selectedContact: state.selectedContact && ids.includes(state.selectedContact.id)
        ? null
        : state.selectedContact,
      selectedIds: new Set<string>(),
    })),

  // Filters
  setFilters: (filters) => set({ filters }),

  clearFilters: () => set({ filters: {} }),

  // Queries
  searchContacts: (query) => {
    const contacts = get().contacts;
    const lowerQuery = query.toLowerCase();
    return contacts.filter((contact) => {
      const name =
        contact.displayName ||
        [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
      const emails = (contact.emails || []).map((e) => e.value?.toLowerCase() || '');
      const phones = (contact.phoneNumbers || []).map((p) => p.value || '');
      return (
        (name && name.toLowerCase().includes(lowerQuery)) ||
        emails.some((e) => e.includes(lowerQuery)) ||
        (contact.company && contact.company.toLowerCase().includes(lowerQuery)) ||
        phones.some((p) => p.includes(lowerQuery))
      );
    });
  },

  getContactByEmail: (email) => {
    const contacts = get().contacts;
    return contacts.find((contact) =>
      (contact.emails || []).some((e) => e.value && e.value.toLowerCase() === email.toLowerCase()),
    );
  },

  reset: () =>
    set({
      contacts: [],
      selectedContact: null,
      isLoading: false,
      searchQuery: '',
      pagination: {
        page: 1,
        pageSize: 50,
        total: 0,
        hasMore: false,
      },
      selectedIds: new Set<string>(),
      filters: {},
    }),
}));
