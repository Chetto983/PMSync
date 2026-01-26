import { create } from 'zustand';
import type { Email } from '@/lib/api/emails';

/**
 * Pagination state for email list
 */
export interface EmailPaginationState {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

interface EmailListState {
  emails: Email[];
  isLoading: boolean;
  isLoadingMore: boolean;

  // Pagination
  pagination: EmailPaginationState;

  // Actions - Email management
  setEmails: (emails: Email[]) => void;
  appendEmails: (emails: Email[]) => void;
  updateEmail: (id: string, updates: Partial<Email>) => void;
  deleteEmail: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setLoadingMore: (loading: boolean) => void;

  // Actions - Pagination
  setPagination: (pagination: Partial<EmailPaginationState>) => void;

  // Reset
  reset: () => void;
}

export const useEmailListStore = create<EmailListState>((set) => ({
  emails: [],
  isLoading: false,
  isLoadingMore: false,
  pagination: {
    page: 1,
    pageSize: 50,
    total: 0,
    hasMore: true,
  },

  setEmails: (emails) => {
    // Dedupe by ID
    const map = new Map<string, Email>();
    emails.forEach((e) => map.set(e.id, e));
    set({ emails: Array.from(map.values()) });
  },

  appendEmails: (newEmails) =>
    set((state) => {
      // Filter out duplicates
      const existingIds = new Set(state.emails.map((e) => e.id));
      const uniqueNewEmails = newEmails.filter((e) => !existingIds.has(e.id));
      return {
        emails: [...state.emails, ...uniqueNewEmails],
      };
    }),

  updateEmail: (id, updates) =>
    set((state) => {
      const emailIndex = state.emails.findIndex((e) => e.id === id);
      if (emailIndex === -1) return state;

      const newEmails = [...state.emails];
      newEmails[emailIndex] = { ...newEmails[emailIndex], ...updates };

      return { emails: newEmails };
    }),

  deleteEmail: (id) =>
    set((state) => ({
      emails: state.emails.filter((e) => e.id !== id),
    })),

  setLoading: (loading) => set({ isLoading: loading }),

  setLoadingMore: (loading) => set({ isLoadingMore: loading }),

  setPagination: (pagination) =>
    set((state) => ({
      pagination: { ...state.pagination, ...pagination },
    })),

  reset: () =>
    set({
      emails: [],
      isLoading: false,
      isLoadingMore: false,
      pagination: {
        page: 1,
        pageSize: 50,
        total: 0,
        hasMore: true,
      },
    }),
}));
