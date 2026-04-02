/**
 * Locale-aware Telegram message dictionary.
 *
 * Supports IT + EN. Lookup user's `UserPreference.language` (default 'en').
 */

export type TelegramLocale = 'it' | 'en';

const messages = {
  REMINDER: { it: 'PROMEMORIA', en: 'REMINDER' },
  DEADLINE: { it: 'Scadenza', en: 'Deadline' },
  EMAIL_DETECTED: { it: 'EMAIL RILEVATA', en: 'EMAIL DETECTED' },
  URGENT: { it: 'URGENTE', en: 'URGENT' },
  NO_RESPONSE: { it: 'Nessuna risposta ricevuta', en: 'No response received' },
  CHECK_EMAIL: { it: 'Controlla la mail e aggiorna lo stato', en: 'Check your email and update the status' },
  SUBJECT: { it: 'Oggetto', en: 'Subject' },
  DESCRIPTION: { it: 'Dettagli', en: 'Details' },
  DONE: { it: 'Fatto', en: 'Done' },
  COMPLETED: { it: 'Completato!', en: 'Completed!' },
  REMINDER_NOT_FOUND: { it: 'Promemoria non trovato', en: 'Reminder not found' },
  ACCOUNT_NOT_LINKED: { it: 'Account non collegato', en: 'Account not linked' },
  ERROR: { it: 'Errore', en: 'Error' },
  ACTIVE_MONITORING: { it: 'attivi · monitora mail', en: 'active · monitoring mail' },
  FOLLOW_UP_AI: { it: 'FOLLOW-UP AI', en: 'FOLLOW-UP AI' },
  SLOT_MORNING: { it: 'Mattina', en: 'Morning' },
  SLOT_AFTERNOON: { it: 'Pomeriggio', en: 'Afternoon' },
  SLOT_EVENING: { it: 'Sera', en: 'Evening' },
} as const;

type MessageKey = keyof typeof messages;

/**
 * Get a localized Telegram message string.
 * Falls back to 'en' if locale is not supported.
 */
export function t(key: MessageKey, locale: TelegramLocale = 'en'): string {
  const entry = messages[key];
  return entry[locale] ?? entry.en;
}

/**
 * Get localized slot label (mattina/pomeriggio/sera).
 */
export function getSlotLabel(slot: string, locale: TelegramLocale = 'en'): string {
  const slotMap: Record<string, MessageKey> = {
    mattina: 'SLOT_MORNING',
    pomeriggio: 'SLOT_AFTERNOON',
    sera: 'SLOT_EVENING',
  };
  const key = slotMap[slot];
  return key ? t(key, locale) : slot;
}

/**
 * Format a date in the user's locale.
 */
export function formatDateLocale(date: Date, locale: TelegramLocale = 'en'): string {
  const dateLocale = locale === 'it' ? 'it-IT' : 'en-GB';
  return date.toLocaleDateString(dateLocale, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
