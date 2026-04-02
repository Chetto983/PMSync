/**
 * UnifiedReminderDto — Unified shape for both user-created Reminders
 * and AI-detected EmailFollowUps, served via GET /reminders/unified.
 */

export type UnifiedSource = 'user' | 'ai-followup';

export type UnifiedStatus =
  | 'attivo'
  | 'completato'
  | 'annullato'
  | 'sospeso'
  | 'pending'
  | 'reminded'
  | 'resolved'
  | 'expired';

export interface UnifiedReminderItem {
  id: string;
  source: UnifiedSource;
  titolo: string;
  descrizione: string | null;
  contatto: string | null;
  scadenzaDatetime: string | null;
  priorita: 'alta' | 'media' | 'bassa';
  status: UnifiedStatus;

  // Reminder-specific (null for follow-ups)
  azione: string | null;
  condizioneTipo: string | null;
  monitoraEmail: boolean;
  telegramInviato: boolean;
  isRecurring: boolean;
  recurrenceRule: string | null;

  // Follow-up-specific (null for user reminders)
  emailSubject: string | null;
  emailFrom: string | null;
  emailId: string | null;
  followUpType: string | null;
  confidence: number | null;

  createdAt: string;
  updatedAt: string;
}

export interface UnifiedReminderListResponse {
  items: UnifiedReminderItem[];
  total: number;
  page: number;
  limit: number;
  counts: {
    user: number;
    aiFollowUp: number;
  };
}

export interface UnifiedReminderFilters {
  source?: UnifiedSource;
  page?: number;
  limit?: number;
}
