/**
 * usePageContext Hook
 *
 * Reactive hook that detects the current page context type from:
 * - next/router pathname and query parameters
 * - Zustand store selectors (email, contact, calendar)
 *
 * Returns a typed PageContext for the AI overlay to determine
 * contextual behavior. No API calls -- reads client-side state only.
 *
 * Per D-08/D-09: provides entity type, ID, display label, and
 * whatever metadata Zustand stores expose. Rich data enrichment
 * (body snippets, activity) is handled server-side in Plan 04.
 */

import { useMemo } from 'react';
import { useRouter } from 'next/router';
import { useEmailUIStore } from '@/stores/email-ui-store';
import { useContactStore } from '@/stores/contact-store';
import { useCalendarStore } from '@/stores/calendar-store';

export type PageContextType = 'email' | 'contact' | 'deal' | 'calendar' | 'general';

export interface PageContext {
  type: PageContextType;
  entityId: string | null;
  label: string;
  metadata: Record<string, unknown>;
}

const GENERAL_CONTEXT: PageContext = {
  type: 'general',
  entityId: null,
  label: '',
  metadata: {},
};

export function usePageContext(): PageContext {
  const { pathname, query } = useRouter();

  // Zustand store selectors (reactive -- re-renders on store changes)
  const { activeThreadId, activeEmailId } = useEmailUIStore((s) => ({
    activeThreadId: s.activeThreadId,
    activeEmailId: s.activeEmailId,
  }));
  const selectedContact = useContactStore((s) => s.selectedContact);
  const selectedEvent = useCalendarStore((s) => s.selectedEvent);

  return useMemo(() => {
    // 1. Email: /dashboard/email prefix
    if (pathname.startsWith('/dashboard/email')) {
      const threadId =
        (typeof query.threadId === 'string' ? query.threadId : null) ||
        activeThreadId;

      return {
        type: 'email' as const,
        entityId: threadId,
        label: '',
        metadata: {
          threadId,
          emailId: activeEmailId,
        },
      };
    }

    // 2. Contact: /dashboard/contacts/[contactId]
    if (pathname.startsWith('/dashboard/contacts/') && pathname !== '/dashboard/contacts/') {
      const contactId = typeof query.contactId === 'string' ? query.contactId : null;
      const name =
        selectedContact?.displayName ||
        [selectedContact?.firstName, selectedContact?.lastName].filter(Boolean).join(' ').trim() ||
        '';
      const email = selectedContact?.emails?.[0]?.value || '';

      return {
        type: 'contact' as const,
        entityId: contactId,
        label: name || email,
        metadata: {
          name,
          email,
          company: selectedContact?.company ?? undefined,
        },
      };
    }

    // 3. Deal: /dashboard/crm/deals/ with dealId in query
    if (pathname.startsWith('/dashboard/crm/deals/')) {
      const dealId = typeof query.dealId === 'string' ? query.dealId : null;

      return {
        type: 'deal' as const,
        entityId: dealId,
        label: '',
        metadata: {
          dealId,
        },
      };
    }

    // 4. Calendar: /dashboard/calendar prefix
    if (pathname.startsWith('/dashboard/calendar')) {
      return {
        type: 'calendar' as const,
        entityId: selectedEvent?.id || null,
        label: selectedEvent?.title || '',
        metadata: {
          title: selectedEvent?.title,
          start: selectedEvent?.startTime,
          end: selectedEvent?.endTime,
          attendees: selectedEvent?.attendees,
        },
      };
    }

    // 5. General: all other routes
    return GENERAL_CONTEXT;
  }, [
    pathname,
    query,
    activeThreadId,
    activeEmailId,
    selectedContact,
    selectedEvent,
  ]);
}
