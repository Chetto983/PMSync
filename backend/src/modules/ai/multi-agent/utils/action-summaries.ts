/**
 * Localized action summary messages for action executor results.
 * Centralized for easy maintenance and extension to new languages.
 */

export type SupportedLocale = 'en' | 'it';

/**
 * Get locale from user preferences or context
 */
export function getLocale(language?: string): SupportedLocale {
  return (language || 'en').toLowerCase().startsWith('it') ? 'it' : 'en';
}

/**
 * Localized messages for action summaries
 */
export const actionSummaries = {
  // Email actions
  emailSent: {
    en: (to: string, subject: string) => `Email sent to ${to} with subject "${subject}".`,
    it: (to: string, subject: string) => `Email inviata a ${to} con oggetto "${subject}".`,
  },
  emailSentNoSubject: {
    en: '(No subject)',
    it: '(Senza oggetto)',
  },
  replySent: {
    en: (to: string) => `Reply sent to ${to}.`,
    it: (to: string) => `Risposta inviata a ${to}.`,
  },
  emailForwarded: {
    en: (to: string) => `Email forwarded to ${to}.`,
    it: (to: string) => `Email inoltrata a ${to}.`,
  },
  emailDeleted: {
    en: (subject: string) => `Email "${subject}" deleted.`,
    it: (subject: string) => `Email "${subject}" eliminata.`,
  },
  emailArchived: {
    en: (subject: string) => `Email "${subject}" archived.`,
    it: (subject: string) => `Email "${subject}" archiviata.`,
  },
  emailMarkedRead: {
    en: 'Email marked as read.',
    it: 'Email contrassegnata come letta.',
  },
  emailMarkedUnread: {
    en: 'Email marked as unread.',
    it: 'Email contrassegnata come non letta.',
  },
  emailStarred: {
    en: 'Email starred.',
    it: 'Email contrassegnata con stella.',
  },
  emailUnstarred: {
    en: 'Star removed from email.',
    it: "Stella rimossa dall'email.",
  },
  emailsSearchFound: {
    en: (count: number, query: string) =>
      `Found ${count} email${count === 1 ? '' : 's'} for "${query}".`,
    it: (count: number, query: string) => `Trovate ${count} email per "${query}".`,
  },
  emailsSearchNotFound: {
    en: (query: string) => `No emails found for "${query}".`,
    it: (query: string) => `Nessuna email trovata per "${query}".`,
  },
  labelsAdded: {
    en: (labels: string) => `Labels added: ${labels}.`,
    it: (labels: string) => `Etichette aggiunte: ${labels}.`,
  },
  labelsRemoved: {
    en: (labels: string) => `Labels removed: ${labels}.`,
    it: (labels: string) => `Etichette rimosse: ${labels}.`,
  },
  labelsAddedAndRemoved: {
    en: (added: string, removed: string) =>
      `Labels added: ${added}. Labels removed: ${removed}.`,
    it: (added: string, removed: string) =>
      `Etichette aggiunte: ${added}. Etichette rimosse: ${removed}.`,
  },
  emailCategorized: {
    en: (categories: string) => `Email categorized with: ${categories}.`,
    it: (categories: string) => `Email categorizzata con: ${categories}.`,
  },
  unreadEmailsFound: {
    en: (count: number) =>
      count === 0 ? 'No unread emails found.' : `Found ${count} unread email${count === 1 ? '' : 's'}.`,
    it: (count: number) =>
      count === 0 ? 'Nessuna email non letta trovata.' : `Trovate ${count} email non lette.`,
  },

  // Calendar actions
  eventCreated: {
    en: (title: string, date: string) => `Event "${title}" created for ${date}.`,
    it: (title: string, date: string) => `Evento "${title}" creato per ${date}.`,
  },
  eventUpdated: {
    en: (title: string) => `Event "${title}" updated.`,
    it: (title: string) => `Evento "${title}" aggiornato.`,
  },
  eventDeleted: {
    en: (title: string) => `Event "${title}" deleted.`,
    it: (title: string) => `Evento "${title}" eliminato.`,
  },
  eventsFound: {
    en: (count: number) =>
      count === 0
        ? 'No events found in the selected period.'
        : `Found ${count} event${count === 1 ? '' : 's'} in the selected period.`,
    it: (count: number) =>
      count === 0
        ? 'Nessun evento trovato nel periodo selezionato.'
        : `Trovati ${count} eventi nel periodo selezionato.`,
  },
  availabilityFree: {
    en: (count: number) =>
      `You have free time. ${count} existing commitment${count === 1 ? '' : 's'}.`,
    it: (count: number) => `Hai tempo libero. ${count} impegni già presenti.`,
  },
  availabilityBusy: {
    en: (count: number) => `Busy day with ${count} events.`,
    it: (count: number) => `Giornata molto impegnata con ${count} eventi.`,
  },
  eventRescheduled: {
    en: (title: string, date: string) => `Event "${title}" rescheduled to ${date}.`,
    it: (title: string, date: string) => `Evento "${title}" riprogrammato per ${date}.`,
  },

  // Contact actions
  contactCreated: {
    en: (name: string) => `Contact "${name}" created.`,
    it: (name: string) => `Contatto "${name}" creato.`,
  },
  contactUpdated: {
    en: (name: string) => `Contact "${name}" updated.`,
    it: (name: string) => `Contatto "${name}" aggiornato.`,
  },
  contactDeleted: {
    en: (name: string) => `Contact "${name}" deleted.`,
    it: (name: string) => `Contatto "${name}" eliminato.`,
  },
  contactsSearchFound: {
    en: (count: number, query: string) =>
      `Found ${count} contact${count === 1 ? '' : 's'} for "${query}".`,
    it: (count: number, query: string) => `Trovati ${count} contatti per "${query}".`,
  },
  contactsSearchNotFound: {
    en: (query: string) => `No contacts found for "${query}".`,
    it: (query: string) => `Nessun contatto trovato per "${query}".`,
  },
  contactsMerged: {
    en: (count: number, name: string, removed: number) =>
      `Merged ${count} contacts into "${name}". ${removed} duplicate${removed === 1 ? '' : 's'} removed.`,
    it: (count: number, name: string, removed: number) =>
      `Uniti ${count} contatti in "${name}". ${removed} duplicati rimossi.`,
  },
  contactFound: {
    en: (name: string) => `Found contact: ${name}.`,
    it: (name: string) => `Trovato contatto: ${name}.`,
  },
  contactNotFound: {
    en: 'Contact not found',
    it: 'Contatto non trovato',
  },

  // Folder actions
  folderCreated: {
    en: (name: string) => `Folder "${name}" created.`,
    it: (name: string) => `Cartella "${name}" creata.`,
  },
  folderRenamed: {
    en: (name: string) => `Folder renamed to "${name}".`,
    it: (name: string) => `Cartella rinominata in "${name}".`,
  },
  folderDeleted: {
    en: (path: string) => `Folder "${path}" deleted.`,
    it: (path: string) => `Cartella "${path}" eliminata.`,
  },

  // Fallback labels
  noSubject: {
    en: 'No subject',
    it: 'Senza oggetto',
  },
  unknownSender: {
    en: 'Unknown sender',
    it: 'Mittente sconosciuto',
  },
  event: {
    en: 'Event',
    it: 'Evento',
  },
  contact: {
    en: 'Contact',
    it: 'Contatto',
  },
};

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
