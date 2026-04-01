/**
 * Normalizer functions mapping 5 source record types to UnifiedTaskDto.
 * Each normalizer is a pure function: source record in, UnifiedTaskDto out.
 */
import type {
  EmailFollowUp,
  FollowUpStatus,
  Reminder,
  ReminderPriorita,
  ReminderStatus,
  NBAAction,
  Ticket,
  ManualTask,
} from '@prisma/client';
import type { UnifiedTaskDto, UnifiedTaskStatus, UnifiedTaskPriority } from '../dto/unified-task.dto';

// ---------------------------------------------------------------------------
// Status & priority mapping lookups
// ---------------------------------------------------------------------------

const FOLLOW_UP_STATUS_MAP: Record<FollowUpStatus, UnifiedTaskStatus> = {
  PENDING: 'pending',
  REMINDED: 'pending',
  RESOLVED: 'completed',
  EXPIRED: 'expired',
};

const REMINDER_STATUS_MAP: Record<ReminderStatus, UnifiedTaskStatus> = {
  attivo: 'pending',
  completato: 'completed',
  annullato: 'dismissed',
  sospeso: 'pending',
};

const REMINDER_PRIORITY_MAP: Record<ReminderPriorita, UnifiedTaskPriority> = {
  alta: 'high',
  media: 'medium',
  bassa: 'low',
};

const NBA_STATUS_MAP: Record<string, UnifiedTaskStatus> = {
  SUGGESTED: 'pending',
  ACCEPTED: 'in_progress',
  EXECUTED: 'completed',
  DISMISSED: 'dismissed',
};

const TICKET_STATUS_MAP: Record<string, UnifiedTaskStatus> = {
  open: 'pending',
  in_progress: 'in_progress',
  waiting: 'pending',
  resolved: 'completed',
  closed: 'completed',
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function joinName(first: string | null, last: string | null): string | null {
  const parts = [first, last].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : null;
}

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

type FollowUpWithEmail = EmailFollowUp & {
  email: { subject: string; from: string | null };
};

export function normalizeFollowUp(record: FollowUpWithEmail): UnifiedTaskDto {
  const prefix = record.followUpType === 'TODO' ? '[TODO]' : '[Waiting]';
  return {
    id: `follow_up_${record.id}`,
    sourceType: 'follow_up',
    sourceId: record.id,
    title: `${prefix} ${record.email.subject}`,
    description: record.reason ?? null,
    status: FOLLOW_UP_STATUS_MAP[record.status] ?? 'pending',
    priority: 'medium',
    dueDate: record.dueDate.toISOString(),
    contactName: record.email.from ?? null,
    contactId: null,
    dealId: null,
    emailId: record.emailId,
    ticketId: null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function normalizeReminder(record: Reminder): UnifiedTaskDto {
  return {
    id: `reminder_${record.id}`,
    sourceType: 'reminder',
    sourceId: record.id,
    title: record.titolo,
    description: record.descrizione ?? null,
    status: REMINDER_STATUS_MAP[record.status] ?? 'pending',
    priority: REMINDER_PRIORITY_MAP[record.priorita] ?? 'medium',
    dueDate: record.scadenzaDatetime?.toISOString() ?? null,
    contactName: record.contatto ?? null,
    contactId: null,
    dealId: null,
    emailId: null,
    ticketId: null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

type NBAWithContact = NBAAction & {
  contact?: { firstName: string | null; lastName: string | null } | null;
};

export function normalizeNBAAction(record: NBAWithContact): UnifiedTaskDto {
  const priority: UnifiedTaskPriority =
    record.expectedImpact >= 75 ? 'high' : record.expectedImpact >= 50 ? 'medium' : 'low';

  return {
    id: `deal_action_${record.id}`,
    sourceType: 'deal_action',
    sourceId: record.id,
    title: record.title,
    description: record.reasoning,
    status: NBA_STATUS_MAP[record.status] ?? 'pending',
    priority,
    dueDate: null,
    contactName: record.contact ? joinName(record.contact.firstName, record.contact.lastName) : null,
    contactId: record.contactId ?? null,
    dealId: record.dealId,
    emailId: null,
    ticketId: null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

type TicketWithContact = Ticket & {
  contact?: { firstName: string | null; lastName: string | null } | null;
};

export function normalizeTicket(record: TicketWithContact): UnifiedTaskDto {
  return {
    id: `ticket_${record.id}`,
    sourceType: 'ticket',
    sourceId: record.id,
    title: record.subject,
    description: record.description ?? null,
    status: TICKET_STATUS_MAP[record.status] ?? 'pending',
    priority: (record.priority as UnifiedTaskPriority) ?? 'medium',
    dueDate: record.slaDeadline?.toISOString() ?? null,
    contactName: record.contact ? joinName(record.contact.firstName, record.contact.lastName) : null,
    contactId: record.contactId ?? null,
    dealId: null,
    emailId: record.emailId ?? null,
    ticketId: record.id,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

type ManualTaskWithContact = ManualTask & {
  contact?: { firstName: string | null; lastName: string | null } | null;
};

export function normalizeManualTask(record: ManualTaskWithContact): UnifiedTaskDto {
  return {
    id: `manual_${record.id}`,
    sourceType: 'manual',
    sourceId: record.id,
    title: record.title,
    description: record.description ?? null,
    status: (record.status as UnifiedTaskStatus) ?? 'pending',
    priority: (record.priority as UnifiedTaskPriority) ?? 'medium',
    dueDate: record.dueDate?.toISOString() ?? null,
    contactName: record.contact ? joinName(record.contact.firstName, record.contact.lastName) : null,
    contactId: record.contactId ?? null,
    dealId: record.dealId ?? null,
    emailId: record.emailId ?? null,
    ticketId: null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
