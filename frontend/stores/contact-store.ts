import { create } from 'zustand';
import type { Contact } from '@/lib/api/contacts';

interface ContactState {
  contacts: Contact[];
  selectedContact: Contact | null;
  isLoading: boolean;
  searchQuery: string;

  // Actions
  setContacts: (contacts: Contact[]) => void;
  addContact: (contact: Contact) => void;
  updateContact: (id: string, updates: Partial<Contact>) => void;
  deleteContact: (id: string) => void;
  setSelectedContact: (contact: Contact | null) => void;
  setLoading: (loading: boolean) => void;
  setSearchQuery: (query: string) => void;

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

  setContacts: (contacts) => {
    const map = new Map<string, Contact>();
    contacts.forEach((c) => map.set(c.id, c));
    set({ contacts: Array.from(map.values()) });
  },

  addContact: (contact) =>
    set((state) => {
      // Prevent duplicates
      if (state.contacts.some((c) => c.id === contact.id)) {
        return state;
      }
      return {
        contacts: [...state.contacts, contact],
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
    })),

  setSelectedContact: (contact) => set({ selectedContact: contact }),

  setLoading: (loading) => set({ isLoading: loading }),

  setSearchQuery: (query) => set({ searchQuery: query }),

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
    }),
}));
