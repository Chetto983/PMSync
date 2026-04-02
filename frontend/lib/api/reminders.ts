/**
 * Reminders & Telegram Settings API Module
 *
 * Provides typed API methods for reminder CRUD and Telegram configuration.
 * Backend endpoints: /api/v1/reminders, /api/v1/telegram/settings
 */

import { apiClient } from '../api-client';

// =============================================================================
// Types - Reminder Entity
// =============================================================================

export type ReminderPeriodo = 'mattina' | 'pomeriggio' | 'sera' | 'tutto_il_giorno';
export type ReminderAzione = 'chiama' | 'scrivi_mail' | 'verifica' | 'conferma' | 'controlla' | 'altro';
export type ReminderPriorita = 'alta' | 'media' | 'bassa';
export type ReminderCondizioneTipo = 'sempre' | 'se_risponde_mail' | 'se_non_risponde_mail' | 'manuale';
export type ReminderStatus = 'attivo' | 'completato' | 'annullato' | 'sospeso';

export interface Reminder {
  id: string;
  tenantId: string;
  userId: string;
  titolo: string;
  descrizione?: string | null;
  contatto?: string | null;
  scadenzaTesto?: string | null;
  scadenzaDatetime?: string | null;
  periodo?: ReminderPeriodo | null;
  azione: ReminderAzione;
  priorita: ReminderPriorita;
  condizioneTipo: ReminderCondizioneTipo;
  condizioneDettaglio?: string | null;
  monitoraEmail: boolean;
  emailKeywords: string[];
  emailMittente?: string | null;
  emailRilevata: boolean;
  emailRilevataAt?: string | null;
  messaggioTelegram?: string | null;
  telegramInviato: boolean;
  telegramInviatoAt?: string | null;
  isRecurring: boolean;
  recurrenceRule?: string | null;
  recurrenceParentId?: string | null;
  status: ReminderStatus;
  completatoAt?: string | null;
  inputUtente?: string | null;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Types - DTOs
// =============================================================================

export interface CreateReminderDto {
  inputUtente?: string;
  titolo?: string;
  descrizione?: string;
  contatto?: string;
  scadenzaTesto?: string;
  scadenzaDatetime?: string;
  periodo?: ReminderPeriodo;
  azione?: ReminderAzione;
  priorita?: ReminderPriorita;
  condizioneTipo?: ReminderCondizioneTipo;
  condizioneDettaglio?: string;
  monitoraEmail?: boolean;
  emailKeywords?: string[];
  emailMittente?: string;
  messaggioTelegram?: string;
}

export interface UpdateReminderDto {
  titolo?: string;
  descrizione?: string;
  contatto?: string;
  scadenzaTesto?: string;
  scadenzaDatetime?: string;
  periodo?: ReminderPeriodo;
  azione?: ReminderAzione;
  priorita?: ReminderPriorita;
  condizioneTipo?: ReminderCondizioneTipo;
  condizioneDettaglio?: string;
  monitoraEmail?: boolean;
  emailKeywords?: string[];
  emailMittente?: string;
  messaggioTelegram?: string;
  status?: ReminderStatus;
  isRecurring?: boolean;
  recurrenceRule?: string;
}

export interface ListRemindersParams {
  status?: ReminderStatus;
  priorita?: ReminderPriorita;
  periodo?: ReminderPeriodo;
  page?: number;
  limit?: number;
}

export interface SearchRemindersParams {
  q: string;
  page?: number;
  limit?: number;
}

export interface BulkUpdateRemindersDto {
  ids: string[];
  status?: ReminderStatus;
  priorita?: ReminderPriorita;
}

export interface ListRemindersResponse {
  reminders: Reminder[];
  total: number;
  page: number;
  limit: number;
}

// =============================================================================
// Types - Telegram Settings
// =============================================================================

export interface TelegramSettings {
  id: string;
  tenantId: string;
  userId: string;
  telegramChatId?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateTelegramSettingsDto {
  telegramChatId?: string;
  isActive?: boolean;
}

// =============================================================================
// Reminders API
// =============================================================================

export const remindersApi = {
  list: (params?: ListRemindersParams) =>
    apiClient.get<{ data: Reminder[]; meta: { total: number; page: number; limit: number } }>('/reminders', { params }),

  get: (id: string) =>
    apiClient.get<{ data: Reminder }>(`/reminders/${id}`),

  create: (dto: CreateReminderDto) =>
    apiClient.post<{ data: Reminder }>('/reminders', dto),

  update: (id: string, dto: UpdateReminderDto) =>
    apiClient.patch<{ data: Reminder }>(`/reminders/${id}`, dto),

  delete: (id: string) =>
    apiClient.delete<{ data: Reminder }>(`/reminders/${id}`),

  bulkDelete: (ids: string[]) =>
    apiClient.delete<{ data: { deleted: number } }>('/reminders/bulk', { data: { ids } }),

  complete: (id: string) =>
    apiClient.post<{ data: Reminder }>(`/reminders/${id}/complete`),

  search: (params: SearchRemindersParams) =>
    apiClient.get<{ data: Reminder[]; meta: { total: number; page: number; limit: number } }>('/reminders/search', { params }),

  bulkUpdate: (dto: BulkUpdateRemindersDto) =>
    apiClient.patch<{ data: { updated: number } }>('/reminders/bulk', dto),
};

// =============================================================================
// Telegram Settings API
// =============================================================================

export interface TelegramLinkToken {
  token: string;
  deepLink: string;
  expiresIn: number;
}

export interface TelegramLinkStatus {
  linked: boolean;
  active: boolean;
}

export const telegramApi = {
  getSettings: () =>
    apiClient.get<{ data: TelegramSettings | null }>('/telegram/settings'),

  updateSettings: (dto: UpdateTelegramSettingsDto) =>
    apiClient.put<{ data: TelegramSettings }>('/telegram/settings', dto),

  disconnect: () =>
    apiClient.delete<{ data: null }>('/telegram/settings'),

  /** Generate a QR link token (deep link to bot with /start token) */
  generateLinkToken: () =>
    apiClient.post<{ data: TelegramLinkToken }>('/telegram/settings/link-token'),

  /** Poll link status after QR scan */
  checkLinkStatus: () =>
    apiClient.get<{ data: TelegramLinkStatus }>('/telegram/settings/link-status'),
};
