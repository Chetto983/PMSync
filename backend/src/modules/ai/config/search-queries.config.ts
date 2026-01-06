/**
 * Common Search Queries for Cache Pre-Warming
 *
 * Organized by category for maintainability.
 * Add new queries here instead of hardcoding in services.
 *
 * These are used to pre-warm the query embedding cache,
 * reducing Mistral API calls for common searches.
 */

export interface SearchQueryCategory {
  name: string;
  queries: {
    en: string[];
    it: string[];
  };
}

export const SEARCH_QUERY_CATEGORIES: SearchQueryCategory[] = [
  {
    name: 'folders',
    queries: {
      en: ['inbox', 'sent', 'drafts', 'archive', 'trash', 'spam', 'important', 'starred'],
      it: ['posta in arrivo', 'inviati', 'bozze', 'archivio', 'cestino', 'spam', 'importanti', 'speciali'],
    },
  },
  {
    name: 'time',
    queries: {
      en: ['today', 'yesterday', 'this week', 'this month', 'recent', 'new messages', 'last week'],
      it: ['oggi', 'ieri', 'questa settimana', 'questo mese', 'recenti', 'nuovi messaggi', 'settimana scorsa'],
    },
  },
  {
    name: 'priority',
    queries: {
      en: ['urgent', 'important', 'priority', 'action required', 'deadline', 'asap', 'critical'],
      it: ['urgente', 'importante', 'priorità', 'azione richiesta', 'scadenza', 'critico'],
    },
  },
  {
    name: 'email_types',
    queries: {
      en: ['meeting', 'calendar', 'invoice', 'payment', 'receipt', 'order', 'confirmation', 'newsletter', 'unsubscribe'],
      it: ['riunione', 'calendario', 'fattura', 'pagamento', 'ricevuta', 'ordine', 'conferma', 'newsletter'],
    },
  },
  {
    name: 'attachments',
    queries: {
      en: ['attachments', 'has attachment', 'pdf', 'document', 'file'],
      it: ['allegati', 'con allegato', 'pdf', 'documento', 'file'],
    },
  },
  {
    name: 'people',
    queries: {
      en: ['from me', 'to me', 'cc me', 'unread', 'read'],
      it: ['da me', 'a me', 'cc me', 'non letti', 'letti'],
    },
  },
];

/**
 * Get all queries for a specific locale
 */
export function getQueriesByLocale(locale: 'en' | 'it'): string[] {
  return SEARCH_QUERY_CATEGORIES.flatMap(category => category.queries[locale]);
}

/**
 * Get all queries for all supported locales
 */
export function getAllQueries(): string[] {
  const allQueries = new Set<string>();
  for (const category of SEARCH_QUERY_CATEGORIES) {
    category.queries.en.forEach(q => allQueries.add(q));
    category.queries.it.forEach(q => allQueries.add(q));
  }
  return Array.from(allQueries);
}

/**
 * Get queries for a specific category
 */
export function getQueriesByCategory(categoryName: string, locale?: 'en' | 'it'): string[] {
  const category = SEARCH_QUERY_CATEGORIES.find(c => c.name === categoryName);
  if (!category) return [];

  if (locale) {
    return category.queries[locale];
  }
  return [...category.queries.en, ...category.queries.it];
}
