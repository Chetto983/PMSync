/**
 * Action Summaries - Backward Compatible Wrapper
 *
 * This file provides a backward-compatible interface for action summaries.
 * All translations are sourced from en.ts and it.ts locale files.
 *
 * Usage in ActionExecutorService:
 *   import { actionSummaries as t, getLocale } from '../locales/action-summaries';
 *   const locale = getLocale(context.language);
 *   const summary = t.emailSent[locale](to, subject);
 */
import { en } from './en';
import { it } from './it';

export type SupportedLocale = 'en' | 'it';

/**
 * Get locale from user preferences or context
 */
export function getLocale(language?: string): SupportedLocale {
  if (!language) return 'en';
  return language.toLowerCase().startsWith('it') ? 'it' : 'en';
}

/**
 * Helper to format date for locale
 */
export function formatDateForLocale(date: Date, locale: SupportedLocale): string {
  return date.toLocaleDateString(locale === 'it' ? 'it-IT' : 'en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Action summaries with locale-based access pattern: t.key[locale](args)
 * This provides backward compatibility with existing action-executor.service.ts
 *
 * Translations are sourced from en.ts and it.ts - single source of truth.
 */
export const actionSummaries = {
  // Email actions
  emailSent: { en: en.actions.emailSent, it: it.actions.emailSent },
  emailSentNoSubject: { en: en.actions.emailSentNoSubject, it: it.actions.emailSentNoSubject },
  replySent: { en: en.actions.replySent, it: it.actions.replySent },
  emailForwarded: { en: en.actions.emailForwarded, it: it.actions.emailForwarded },
  emailDeleted: { en: en.actions.emailDeleted, it: it.actions.emailDeleted },
  emailArchived: { en: en.actions.emailArchived, it: it.actions.emailArchived },
  emailMarkedRead: { en: en.actions.emailMarkedRead, it: it.actions.emailMarkedRead },
  emailMarkedUnread: { en: en.actions.emailMarkedUnread, it: it.actions.emailMarkedUnread },
  emailStarred: { en: en.actions.emailStarred, it: it.actions.emailStarred },
  emailUnstarred: { en: en.actions.emailUnstarred, it: it.actions.emailUnstarred },
  emailsSearchFound: { en: en.actions.emailsSearchFound, it: it.actions.emailsSearchFound },
  emailsSearchNotFound: { en: en.actions.emailsSearchNotFound, it: it.actions.emailsSearchNotFound },
  labelsAdded: { en: en.actions.labelsAdded, it: it.actions.labelsAdded },
  labelsRemoved: { en: en.actions.labelsRemoved, it: it.actions.labelsRemoved },
  labelsAddedAndRemoved: { en: en.actions.labelsAddedAndRemoved, it: it.actions.labelsAddedAndRemoved },
  emailCategorized: { en: en.actions.emailCategorized, it: it.actions.emailCategorized },
  unreadEmailsFound: { en: en.actions.unreadEmailsFound, it: it.actions.unreadEmailsFound },

  // Calendar actions
  eventCreated: { en: en.actions.eventCreated, it: it.actions.eventCreated },
  eventUpdated: { en: en.actions.eventUpdated, it: it.actions.eventUpdated },
  eventDeleted: { en: en.actions.eventDeleted, it: it.actions.eventDeleted },
  eventsFound: { en: en.actions.eventsFound, it: it.actions.eventsFound },
  availabilityFree: { en: en.actions.availabilityFree, it: it.actions.availabilityFree },
  availabilityBusy: { en: en.actions.availabilityBusy, it: it.actions.availabilityBusy },
  eventRescheduled: { en: en.actions.eventRescheduled, it: it.actions.eventRescheduled },

  // Contact actions
  contactCreated: { en: en.actions.contactCreated, it: it.actions.contactCreated },
  contactUpdated: { en: en.actions.contactUpdated, it: it.actions.contactUpdated },
  contactDeleted: { en: en.actions.contactDeleted, it: it.actions.contactDeleted },
  contactsSearchFound: { en: en.actions.contactsSearchFound, it: it.actions.contactsSearchFound },
  contactsSearchNotFound: { en: en.actions.contactsSearchNotFound, it: it.actions.contactsSearchNotFound },
  contactsMerged: { en: en.actions.contactsMerged, it: it.actions.contactsMerged },
  contactFound: { en: en.actions.contactFound, it: it.actions.contactFound },
  contactNotFound: { en: en.actions.contactNotFound, it: it.actions.contactNotFound },

  // Folder actions
  folderCreated: { en: en.actions.folderCreated, it: it.actions.folderCreated },
  folderRenamed: { en: en.actions.folderRenamed, it: it.actions.folderRenamed },
  folderDeleted: { en: en.actions.folderDeleted, it: it.actions.folderDeleted },

  // Fallback labels
  noSubject: { en: en.actions.noSubject, it: it.actions.noSubject },
  unknownSender: { en: en.actions.unknownSender, it: it.actions.unknownSender },
  event: { en: en.actions.event, it: it.actions.event },
  contact: { en: en.actions.contact, it: it.actions.contact },
};
